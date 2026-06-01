varying vec2 vUv;
uniform float time;
uniform float stripesCount;
uniform float speed;
uniform sampler2D backgroundImage;

float linearStep(float x, float start, float end) {
  return (x - start) / (end - start);
}

float remap(float x, float start, float end) {
  float t = linearStep(x, start, end);
  return mix(start, end, t);
}

void main() {
  const float PI = 3.1415926;
  vec3 crt = texture(backgroundImage, vUv).rgb;
  vec3 result = vec3(0.0);
  float peak = 1.0;
  float valley = 0.96;

  float wrong = mix(peak, valley,
                    sin(vUv.y * 2.0 * PI * stripesCount + time * speed * 3.0));
  result = mix(vec3(0.2), crt, wrong);

  gl_FragColor = vec4(result, 1.0);
}
