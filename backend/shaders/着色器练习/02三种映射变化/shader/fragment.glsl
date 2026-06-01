varying vec2 vUv;
uniform float time;
uniform float duration;
uniform vec2 resolution;

float createCircle(float x, float y, float radius) {
  vec2 p = vUv - vec2(x, y);
  p.x *= resolution.x / resolution.y;
  float d = length(p);
  return 1.0 - smoothstep(radius - 0.005, radius, d);
}

// float createRect(float x, float y, float width, float height) {
//   float x1 = x - .5 * width / resolution.x;
//   float y1 = y - .5 * height / resolution.y;
//   float x2 = x + .5 * width / resolution.x;
//   float y2 = y + .5 * height / resolution.y;
//   float result =
//       smoothstep(x1, x1 + 0.005, vUv.x) * smoothstep(x2 + 0.005, x2, vUv.x) *
//       smoothstep(y1, y1 + 0.005, vUv.y) * smoothstep(y2 + 0.005, y2, vUv.y);
//   return result;
// }
float createRect(float x, float y, float width, float height, float radius) {
  vec2 p = vUv - vec2(x, y);
  p.x *= resolution.x / resolution.y;
  vec2 halfSize = vec2(width * 0.5 / resolution.y, height * 0.5 / resolution.y);
  float r = max(radius / resolution.y, 0.0);
  vec2 q = abs(p) - halfSize + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  return 1.0 - smoothstep(-0.005, 0.0, d);
}

float createLine(vec2 a, vec2 b, float width) {
  float aspect = resolution.x / resolution.y;
  vec2 p = vUv;
  p.x *= aspect;
  a.x *= aspect;
  b.x *= aspect;
  vec2 ab = b - a;
  vec2 ap = p - a;
  float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  vec2 closest = a + ab * t;
  float d = distance(p, closest);
  return 1.0 - smoothstep(width - 0.001, width + 0.001, d);
}

vec3 createAnimation(vec2 a, vec2 b, float width, float radius, vec3 lineColor,
                     vec3 circleColor, float t) {
  // line
  float lineMask = createLine(a, b, width);
  // circle
  vec2 center = mix(a, b, t);
  float circleMask = createCircle(center.x, center.y, radius);
  vec3 result = vec3(0.0);
  result = mix(result, lineColor, lineMask);
  result = mix(result, circleColor, circleMask);
  return result;
}

vec3 createMapping(float x, float y, float t) {
  vec3 orange = vec3(0.914, 0.604, 0.173);
  vec3 blue = vec3(0.337, 0.604, 0.980);
  vec3 result = vec3(.05);

  result = mix(result, vec3(.0), createRect(x, y, 400.0, 180.0, 10.0));

  float rect01 =
      createRect(x - 100.0 / resolution.x, y + 36.0 / resolution.y, 50.0, 50.0, 5.0);
  float rect02 = createRect(x, y + 36.0 / resolution.y, 50.0, 50.0, 5.0);
  float rect03 =
      createRect(x + 100.0 / resolution.x, y + 36.0 / resolution.y, 50.0, 50.0, 5.0);

  result = mix(result, orange, rect01);
  result = mix(result, mix(orange, blue, t), rect02);
  result = mix(result, blue, rect03);
  vec3 animiation =
      createAnimation(vec2(x - 150.0 / resolution.x, y - 36.0 / resolution.y),
                      vec2(x + 150.0 / resolution.x, y - 36.0 / resolution.y),
                      0.002, 0.02, vec3(.5, .5, .5),  mix(orange, blue, t), t);
  result = mix(result, animiation, step(.5, dot(animiation, vec3(1.0))));

  return result;
}

void main() {
  vec3 color = vec3(.0);
  float br01 = smoothstep(.0, .005, abs(vUv.y - 0.3));
  float br02 = smoothstep(.0, .005, abs(vUv.y - 0.6));
  float br03 = smoothstep(.0, .005, abs(vUv.y - .9));
  float br = min(min(br01, br02), br03);
  vec3 white = vec3(1.0);
  float t = clamp(time / duration, 0.0, 1.0);

  vec3 mapping01 = createMapping(0.5, 0.75, step(.5, t));
  vec3 mapping02 = createMapping(0.5, 0.45, t);
  vec3 mapping03 = createMapping(0.5, 0.15, smoothstep(.0, 1.0, t));
  vec3 animiation = createAnimation(vec2(0.15, 0.93), vec2(0.85, 0.93), 0.002,
                                    0.015, vec3(.8), vec3(.2, .8, .2), t);
  vec3 result = mapping01 + mapping02 + mapping03 + animiation;
  color = mix(white, result, br);
  gl_FragColor = vec4(color, 1.0);
}
