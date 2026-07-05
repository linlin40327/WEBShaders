varying vec2 vUv;
uniform vec2 resolution;
uniform float cellSize;
uniform float time;

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

float sdfCircle(vec2 p, float r) { return length(p) - r; }
float sdfLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - h * ba);
}
float sdfBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
mat2 rotate2D(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
// mat2 translate2D(float a, float y) { return mat2(1.0, 0.0, a / y, 1.0); }
// 一次针对矩阵变换的理解做出的故意错误的平移操作
void main() {
  float aspectRatio = resolution.y / resolution.x;
  vec2 pixelCoords = (vUv - .5) * resolution;
  vec3 result = BackgroundColor();
  result = drawGrid(result, vec3(.4), cellSize, 1.0);
  result = drawGrid(result, vec3(.1), cellSize * 10.0, 2.0);

  float d = sdfCircle(pixelCoords, 10.0 * cellSize);
  result = mix(RED * 0.5, result, smoothstep(-1.0, 1.0, d));
  result = mix(RED, result, smoothstep(-5.0, .0, d));
  float dLine = sdfLine(rotate2D(time) * pixelCoords,
                        vec2(-10.0 * cellSize, 25.0 * cellSize),
                        vec2(20.0 * cellSize, -5.0 * cellSize));
  result = mix(RED * 0.5, result, smoothstep(6.0, 8.0, dLine));
  result = mix(RED, result, smoothstep(5.0, 7.0, dLine));
  vec2 pos = pixelCoords;
  pos = rotate2D(-time) * pos;
  pos = pos - vec2(100.0, 350.0);
  float dBox = sdfBox(pos,
                      // 比较一下rotate2D(time) * pos - vec2(100.0, 250.0)
                      // 和rotate2D(time) * (pos - vec2(100.0,
                      // 250.0))的渲染结果， 并分析产生不同现象的原因是什么
                      vec2(20.0 * cellSize, 5.0 * cellSize));
  result = mix(RED * 0.5, result, smoothstep(-1.0, 1.0, dBox));
  result = mix(RED, result, smoothstep(-5.0, .0, dBox));

  gl_FragColor = vec4(vec3(result), 1.0);
}
