varying vec2 vUv;
uniform float time;
uniform float duration;

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
  color = mix(color, mystep, t > vUv.x ? 1.0 : 0.0);
  color =
      mix(black, color,
          t > vUv.x ? smoothstep(.0, .005,
                                 abs(vUv.y - mix(.69, .97, step(.5, vUv.x))))
                    : 1.0);

  // // mix
  vec3 mymix = mix(red, blue, vUv.x);
  color = mix(mymix, color, t - 1.0 > vUv.x ? step(.66, vUv.y) : 1.0);
  color = mix(black, color,
              t - 1.0 > vUv.x
                  ? smoothstep(.0, .005, abs(vUv.y - mix(.36, .63, vUv.x)))
                  : 1.0);

  // // smoothstep
  vec3 mysmoothstep = mix(red, blue, smoothstep(.0, 1.0, vUv.x));
  color = mix(mysmoothstep, color, t - 2.0 > vUv.x ? step(.33, vUv.y) : 1.0);
  color = mix(
      black, color,
      t - 2.0 > vUv.x
          ? smoothstep(.0, .005,
                       abs(vUv.y - mix(.03, .3, smoothstep(.0, 1.0, vUv.x))))
          : 1.0);

  // result
  color = mix(white, color, min(br01, br02));
  gl_FragColor = vec4(color, 1.0);
}
