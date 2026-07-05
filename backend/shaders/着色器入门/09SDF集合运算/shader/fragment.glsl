varying vec2 vUv;
uniform vec2 resolution;
uniform float cellSize;
uniform float time;
const vec3 RED = vec3(.8, .2, .2);
const vec3 Blue = vec3(.3, .3, .9);

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }
float remap(float v, float a, float b, float c, float d) {
  float t = inverseLerp(a, b, v);
  return mix(c, d, t);
}
vec3 BackgroundColor() {
  float distToCenter = length(abs(vUv - .5));
  float vignette = 1.0 - distToCenter;
  vignette = smoothstep(.0, .7, vignette);
  vignette = remap(vignette, .0, 1.0, .3, 1.0);
  return vec3(vignette);
}
vec3 drawGrid(vec3 bgColor, vec3 lineColor, float cellSize, float lineWidth) {
  vec2 center = (vUv - .5);
  vec2 uv = abs(fract(center * resolution / cellSize) - 0.5);
  float distToEdge = (.5 - max(uv.x, uv.y)) * cellSize;
  float t = smoothstep(.0, lineWidth, distToEdge);
  return mix(lineColor, bgColor, t);
}
mat2 rotate2D(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float sdfCircle(vec2 p, float r) { return length(p) - r; }
float sdfBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, .0)) + min(max(d.x, d.y), .0);
}

float sdfUnion(float a, float b) { return min(a, b); }
float sdfIntersection(float a, float b) { return max(a, b); }
float sdfSubtraction(float a, float b) { return max(-a, b); }

float softMax(float a, float b, float k) {
  return log(exp(a * k) + exp(b * k)) / k;
}
float softMin(float a, float b, float k) { return -softMax(-a, -b, k); }
float softMinValue(float a, float b, float k) {
  float h = exp(-b * k) / (exp(-a * k) + exp(-b * k)); // 模式一
  h = remap(a - b, -1.0 / k, 1.0 / k, .0, 1.0); // 模式二
  return h;
}
void main() {
  vec3 result = BackgroundColor();
  vec2 pixelCoords = (vUv - .5) * resolution;
  result = drawGrid(result, vec3(.4), cellSize, 1.0);
  result = drawGrid(result, vec3(.1), cellSize * 10.0, 2.0);

  float cricle_01 = sdfCircle(
      pixelCoords + vec2(20.0 * cellSize, 10.0 * cellSize), 10.0 * cellSize);
  float cricle_02 = sdfCircle(
      pixelCoords + vec2(-20.0 * cellSize, 10.0 * cellSize), 10.0 * cellSize);
  float cricle_03 = sdfCircle(
      pixelCoords + vec2(0.0 * cellSize, -15.0 * cellSize), 10.0 * cellSize);
  float box_01 = sdfBox(rotate2D(time) * pixelCoords,
                        vec2(15.0 * cellSize, 8.0 * cellSize));
  float d = sdfUnion(sdfUnion(cricle_01, cricle_02), cricle_03);
  vec3 sdfColor =
      mix(RED, Blue, smoothstep(0.0, 1.0, softMinValue(box_01, d, 0.02)));

  d = softMin(d, box_01, 0.05);
  result = mix(sdfColor * 0.5, result, smoothstep(-1.0, 1.0, d));
  result = mix(sdfColor, result, smoothstep(-5.0, .0, d));
  gl_FragColor = vec4(result, 1.0);
}
