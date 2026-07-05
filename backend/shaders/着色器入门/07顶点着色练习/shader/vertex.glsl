varying vec2 vUv;
uniform float time;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vPosition;

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }
float remap(float v, float a, float b, float c, float d) {
  float t = inverseLerp(a, b, v);
  return mix(c, d, t);
}
mat3 rotateY(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat3(c, 0, s, 0, 1, 0, -s, 0, c);
}
void main() {
  vUv = uv;
  vPosition = position;
  vNormal = normalize(normal);
  vec3 localPosition = position;
  float t = sin(localPosition.y * 20.0 + time * 10.0);
  t = remap(t, -1.0, 1.0, .0, .2);
  localPosition.xyz += t * normalize(normal);

  vColor = mix(vec3(.0, .0, .5), vec3(.1, .5, .8), smoothstep(.0, .2, t));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(localPosition, 1.0);
}
