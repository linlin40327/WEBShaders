varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

float linearStep(float x, float a, float b) {
  return clamp((x - a) / (b - a), 0.0, 1.0);
}
float remap(float v, float a, float b, float c, float d) {
  float t = linearStep(v, a, b);
  return c + (d - c) * t;
}
vec3 linearToGamma(vec3 value) { return pow(value, vec3(1.0 / 2.2)); }
void main() {
  vec3 result = vec3(.8);
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vPosition);

  // ambient
  vec3 ambient = vec3(.5);

  // hemisphere
  vec3 skyColor = vec3(.0, .3, .6);
  vec3 groundColor = vec3(.6, .3, .1);
  float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
  vec3 hemi = mix(groundColor, skyColor, hemiMix);

  // diffuse lighting
  vec3 lightDir = vec3(1.0, 1.0, 1.0);
  vec3 lightColor = vec3(.4);
  float dp = clamp(dot(normal, lightDir), 0.0, 1.0);

  // specular
  vec3 specularColor = vec3(.5, .4, .1);
  vec3 reflectDir = normalize(reflect(-lightDir, normal));
  float phongValue = max(0.0, dot(viewDir, reflectDir));
  phongValue = pow(phongValue, 128.0);
  vec3 specular = phongValue * specularColor;
  specular = smoothstep(.45, .5, specular);

  // fresnel
  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
  fresnel *= smoothstep(.6, .65, fresnel);
  // toon
  dp = step(.7, dp) * 0.8 + step(.3, dp) * 0.3;

  // result
  result = ambient * .1 + hemi * (fresnel * .2) + dp * lightColor + specular;
  result = linearToGamma(result);
  gl_FragColor = vec4(vec3(result), 1.0);
}
