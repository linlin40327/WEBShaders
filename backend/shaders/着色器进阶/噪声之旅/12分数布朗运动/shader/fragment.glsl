varying vec2 vUv;
uniform vec2 resolution;
uniform float cellSize;
uniform float time;

float noise(vec2 co) {
  vec2 p = 50.0 * fract(co * 0.3183099 + vec2(.71, .113));
  return fract(p.x * p.y * (p.x + p.y)) * 2.0 - 1.0;
}

const vec3 RED = vec3(.8, .2, .0);

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
  vec2 uv = abs(fract(center * resolution / cellSize) - .5);
  float distToEdge = (.5 - max(uv.x, uv.y)) * cellSize;
  // 这一步乘以cellSize很关键，原本的UV转化成了具体的像素值↑，
  // 这样来就可以在下一步smoothstep的时候按照像素的为单位进行映射，
  // 因为我们把UV乘以了屏幕的分辨率，这就使得对于UV来讲，它的单位1就是一个像素。
  // 如此一来，我们就可以精准的控制某条线一定能够占据几个像素的宽度，
  // 就不会由于一条线可能只在UV中占据0.001，
  // 映射到像素上时无法占据一个像素导致没有被正确渲染的错误
  float t = smoothstep(.0, lineWidth, distToEdge);
  return mix(lineColor, bgColor, t);
}

float sdfLine(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  vec2 pa = p - a;
  float h = dot(ba, pa) / dot(ba, ba);
  h = clamp(h, .0, 1.0);
  return length(pa - h * ba);
}
float evaluateFunction(float x) {
  float y = .0;
  float amplitude = 128.0;
  float frequency = 1.0 / 64.0;

  // y += sin(frequency * x) * amplitude;
  // y += sin(frequency * x * 3.5) * amplitude * .5;
  // y += sin(frequency * x * 7.5) * amplitude * .25;
  y += noise(vec2(x) * frequency) * amplitude;
  return y;
}

float plotFunction(vec2 p, float px, float curTime) {
  float res = 100000.0;
  for (float i = -5.0; i < 5.0; i++) {
    float c1 = p.x + px * i;
    float c2 = p.x + px * (i + 1.0);

    vec2 a = vec2(c1, evaluateFunction(c1 + curTime));
    vec2 b = vec2(c2, evaluateFunction(c2 + curTime));
    res = min(res, sdfLine(p, a, b));
  }
  return res;
}

void main() {
  float aspectRatio = resolution.y / resolution.x;
  vec2 pixelCoords = (vUv - .5) * resolution;
  vec3 result = BackgroundColor();
  result = drawGrid(result, vec3(.4), cellSize, 1.0);
  result = drawGrid(result, vec3(.1), cellSize * 10.0, 2.0);

  float xAxis = sdfLine(pixelCoords, vec2(-resolution.x / 2.0, 0.0),
                        vec2(resolution.x / 2.0, 1.0));
  result = mix(vec3(.1, .3, .8), result, smoothstep(2., 3.0, xAxis));
  float dist = plotFunction(pixelCoords, 1.0, time * 50.0);
  result = mix(RED / 2.0, result, smoothstep(3., 4.0, dist));
  result = mix(RED, result, smoothstep(1., 2.0, dist));

  gl_FragColor = vec4(vec3(result), 1.0);
}
