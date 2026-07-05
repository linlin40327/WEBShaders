varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vPosition;

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }
float remap(float v, float a, float b, float c, float d) {
  float t = inverseLerp(a, b, v);
  return mix(c, d, t);
}
void main() {
  vec3 normal = normalize(cross(dFdx(vPosition.xyz), dFdy(vPosition.xyz)));
  vec3 result =vec3(vColor);
  // ambient
  vec3 ambient = vec3(.5);
  // hemisphere
  vec3 skyColor = vec3(.0, .3, .6);
  vec3 groundColor = vec3(.6, .3, .1);
  float hemiMix = remap(vNormal.y, -1.0, 1.0, 0.0, 1.0);
  vec3 hemi = mix(groundColor, skyColor, hemiMix);
  // diffuse
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  vec3 lightColor = vec3(.4);
  float dp = clamp(dot(normal, lightDir), 0.0, 1.0);

  // result
  result = result * .6 + ambient * .1 + hemi * .2 + dp * lightColor * .4;
  gl_FragColor = vec4(result, 1.0);
}
