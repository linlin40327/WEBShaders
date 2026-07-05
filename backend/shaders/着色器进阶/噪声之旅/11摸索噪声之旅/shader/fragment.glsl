varying vec2 vUv;
uniform vec2 resolution;
uniform float time;

float Math_Random(vec2 co) {
  vec2 p = 50.0 * fract(co * 0.3183099 + vec2(.71, .113));
  return fract(p.x * p.y * (p.x + p.y)) * 2.0 - 1.0;
}

vec4 sample2D(vec2 uv) {
  vec4 YEllOW = vec4(1.0, 1.0, 0.0, 1.0);
  vec4 RED = vec4(1.0, 0.0, 0.0, 1.0);
  vec4 GREEN = vec4(0.0, 1.0, 0.0, 1.0);
  vec4 BLUE = vec4(0.0, 0.0, 1.0, 1.0);
  if (uv.x == -0.5 || uv.x == .5) {
    if (uv.y == -.5) {
      return YEllOW;
    }
    if (uv.y == .5) {
      return YEllOW;
    }
    if (uv.y == 1.5) {
      return RED;
    }
    if (uv.y == 2.5) {
      return RED;
    }
  }

  if (uv.x == 1.5 || uv.x == 2.5) {
    if (uv.y == -.5) {
      return BLUE;
    }
    if (uv.y == .5) {
      return BLUE;
    }
    if (uv.y == 1.5) {
      return GREEN;
    }
    if (uv.y == 2.5) {
      return GREEN;
    }
  }
  return vec4(.5, .5, .5, 1.0);
}

vec4 filteredSample2D(vec2 coords) {
  vec2 texSize = vec2(2.0, 2.0);
  vec2 pc = coords * texSize - .5;
  vec2 base = floor(pc) + .5;

  vec4 c1 = sample2D(base);
  vec4 c2 = sample2D(base + vec2(1.0, 0.0));
  vec4 c3 = sample2D(base + vec2(0.0, 1.0));
  vec4 c4 = sample2D(base + vec2(1.0, 1.0));

  vec2 f = smoothstep(.0, 1.0, fract(pc));

  vec4 res1 = mix(c1, c2, f.x);
  vec4 res2 = mix(c3, c4, f.x);
  return mix(res1, res2, f.y);
}

vec4 filteredNoise2D(vec2 coords) {
  vec2 texSize = vec2(20.0);
  vec2 pc = coords * texSize;
  vec2 base = floor(pc);

  float c1 = Math_Random(base);
  float c2 = Math_Random(base + vec2(1.0, 0.0));
  float c3 = Math_Random(base + vec2(0.0, 1.0));
  float c4 = Math_Random(base + vec2(1.0, 1.0));

  vec2 f = smoothstep(.0, 1.0, fract(pc));

  float res1 = mix(c1, c2, f.x);
  float res2 = mix(c3, c4, f.x);
  float res = mix(res1, res2, f.y);
  return vec4(vec3(res), 1.0);
}
void main() {
  vec2 pixel_crood = (vUv - .5) * resolution;
  // vec3 res = vec3(Math_Random(pixel_crood));
  // vec4 res = filteredSample2D(vUv);
  vec4 res = filteredNoise2D(vUv);
  gl_FragColor = res;
}
