varying vec3 vNormal;
varying vec3 vPosition;
uniform vec3 lightDir;
uniform float ambientPower;
uniform float hemispherePower;
uniform float sunPower;

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }

float remap(float v, float a, float b, float c, float d) {
  float t = inverseLerp(a, b, v);
  return c + (d - c) * t;
}

vec3 linearToSRGB(vec3 value) {
  vec3 lt = vec3(lessThanEqual(value, vec3(0.0031308)));
  vec3 v1 = value * 12.92;
  vec3 v2 = pow(value.xyz, vec3(0.41666) * 1.055 - vec3(0.055));
  return mix(v1, v2, lt);
}

vec3 linearToGamma(vec3 value) { return vec3(pow(value, vec3(1.0 / 2.2))); }

void main() {
  vec3 result = vec3(.5);
  vec3 light = vec3(.0);
  vec3 normal = normalize(vNormal);

  // ambient
  vec3 ambient = vec3(.5);

  // hemisphere
  vec3 skyColor = vec3(.0, .3, .6);
  vec3 groundColor = vec3(.6, .3, .1);
  float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
  vec3 hemi = mix(groundColor, skyColor, hemiMix);

  // diffuse
  vec3 lightDir = normalize(lightDir);
  vec3 lightColor = vec3(1.0, 1.0, .9);
  float dp = clamp(dot(normal, lightDir), 0.0, 1.0);

  vec3 sunLight = dp * lightColor;

  light = ambient * ambientPower + hemi * hemispherePower + sunLight * sunPower;

  // result
  result = light * result;
  //  result = linearToSRGB(result);
  result = linearToGamma(result);

  gl_FragColor = vec4(result, 1.0);
}
