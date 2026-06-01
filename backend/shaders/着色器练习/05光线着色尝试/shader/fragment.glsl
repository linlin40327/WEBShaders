varying vec3 vNormal;

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }

float remap(float v, float a, float b, float c, float d) {
  float t = inverseLerp(a, b, v);
  return c + (d - c) * t;
}

void main() {
  vec3 result = vec3(.5);
  vec3 light = vec3(.0);
  vec3 normal = normalize(vNormal);

  // // ambient
  vec3 ambient = vec3(.5);

  // // hemisphere
  vec3 skyColor = vec3(.0, .3, .6);
  vec3 groundColor = vec3(.6, .3, .1);
  float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
  vec3 hemi = mix(groundColor, skyColor, hemiMix);

  light = ambient * 0.0 + hemi;

  // // result
  result = light * result;

  gl_FragColor = vec4(result, 1.0);
}
