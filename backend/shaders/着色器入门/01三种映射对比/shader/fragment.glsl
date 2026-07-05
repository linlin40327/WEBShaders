varying vec2 vUv;
uniform float time;
uniform float duration;

float linearStep(float a, float b, float x) { return x - a / (b - a); }
float remap(float x, float a, float b, float c, float d) {
  return linearStep(a, b, x) * (d - c) + c;
}

void main() {
  vec3 color = vec3(.0);
  float br01 = smoothstep(.0, .005, abs(vUv.y - 0.33));
  float br02 = smoothstep(.0, .005, abs(vUv.y - 0.66));

  vec3 red = vec3(1.0, .0, .0);
  vec3 blue = vec3(.0, .0, 1.0);
  vec3 white = vec3(1.0);
  vec3 black = vec3(0.0);

  float delay = duration / 3.0;
  float t = time / delay;

  // step
  vec3 mystep = mix(red, blue, step(.5, vUv.x));
  color = mix(color, mystep, remap(t, 0.0, 1.0, .0, 1.0) > vUv.y ? 1.0 : 0.0);
  color =
      mix(black, color,
          smoothstep(.0, .005, abs(vUv.y - mix(.03, .30, step(.5, vUv.x)))));

  // mix
  vec3 mymix = mix(red, blue, vUv.x);
  color = mix(mymix, color,
              remap(t, 1.0, 2.0, .33, 1.0) > vUv.y ? step(vUv.y, .33) : 1.0);
  color = mix(black, color,
              remap(t, 1.0, 2.0, .33, 1.0) > vUv.y
                  ? smoothstep(.0, .005, abs(vUv.y - mix(.36, .63, vUv.x)))
                  : 1.0);

  // smoothstep
  vec3 mysmoothstep = mix(red, blue, smoothstep(.0, 1.0, vUv.x));
  color = mix(mysmoothstep, color, remap(t, 2.0, 3.0, .66, 1.0) > vUv.y ? step(vUv.y, .66) : 1.0);
   color = mix(
        black, color,
        remap(t, 2.0, 3.0, .66, 1.0) > vUv.y
            ? smoothstep(.0, .005,
                         abs(vUv.y - mix(.69, 0.97, smoothstep(.0, 1.0,
                         vUv.x))))
            : 1.0);

  // result
  color = mix(white, color, min(br01, br02));
  gl_FragColor = vec4(color, 1.0);
}
