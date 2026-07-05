varying vec2 vUv;
uniform vec2 resolution;
uniform float time;
uniform float dayLength;
uniform float numClouds;
uniform float numStars;

const float PI = 3.1415926;

float inverseLerp(float a, float b, float v) { return (v - a) / (b - a); }
float remap(float v, float a, float b, float c, float d) {
  return mix(c, d, inverseLerp(a, b, v));
}
float saturate(float x) { return clamp(x, 0.0, 1.0); }
float easeOut(float x, float k) { return 1.0 - pow(1.0 - x, k); }
float easeOutBounce(float x) {
  const float n1 = 7.5625;
  const float d1 = 2.75;

  if (x < 1.0 / d1) {
    return n1 * x * x;
  } else if (x < 2.0 / d1) {
    x -= 1.5 / d1;
    return n1 * x * x + .75;
  } else if (x < 2.5 / d1) {
    x -= 2.25 / d1;
    return n1 * x * x + .9375;
  } else
    x -= 2.625 / d1;
  return n1 * x * x + .984375;
}

float opUnion(float a, float b) { return min(a, b); }
float opIntersection(float a, float b) { return max(a, b); }
float opSubtraction(float a, float b) { return max(-a, b); }

float sdfCricle(vec2 p, float r) { return length(p) - r; }
float sdfCloud(vec2 p) {
  float puff1 = sdfCricle(p, 100.0);
  float puff2 = sdfCricle(p + vec2(120.0, 10.0), 80.0);
  float puff3 = sdfCricle(p - vec2(120.0, -10.0), 80.0);
  return opUnion(puff1, opUnion(puff2, puff3));
}
float sdfMoon(vec2 p) {
  float d =
      opSubtraction(sdfCricle(p + vec2(66.0, .0), 100.0), sdfCricle(p, 100.0));
  return d;
}
float sdfStar(in vec2 p, in float r, in float rf) {
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-k1.x, k1.y);

  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), .0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

mat2 rotate2D(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
vec3 BackgroundColor(float dayTime) {
  vec3 morning = mix(vec3(.44, .64, .84), vec3(.34, .51, .94),
                     smoothstep(.0, 1.0, vUv.x * vUv.y));
  vec3 midday = mix(vec3(.42, .58, .75), vec3(.36, .46, .82),
                    smoothstep(.0, 1.0, vUv.x * vUv.y));
  vec3 evening = mix(vec3(.82, .51, .25), vec3(.88, .71, .39),
                     smoothstep(.0, 1.0, vUv.x * vUv.y));
  vec3 midnight = mix(vec3(.07, .1, .19), vec3(.19, .2, .29),
                      smoothstep(.0, 1.0, vUv.x * vUv.y));

  if (dayTime < dayLength * .25) {
    return mix(morning, midday, smoothstep(.0, .25, dayTime / dayLength));
  } else if (dayTime < dayLength * .5) {
    return mix(midday, evening, smoothstep(.25, .5, dayTime / dayLength));
  } else if (dayTime < dayLength * .75) {
    return mix(evening, midnight, smoothstep(.5, .75, dayTime / dayLength));
  } else {
    return mix(midnight, morning, smoothstep(.75, 1.0, dayTime / dayLength));
  }
}

float hash(vec2 v) { return sin(dot(v, vec2(36.9898, 73.233))); }
void main() {
  float dayTime = mod(time, dayLength);

  vec2 pixelCoords = vUv * resolution;
  vec3 result = BackgroundColor(dayTime);
  // SUN
  if (dayTime < dayLength * .75) {
    float t = saturate(inverseLerp(.0, 1.0, dayTime));
    vec2 sunOffset = vec2(200.0, resolution.y * 0.8) +
                     mix(vec2(0.0, 400.0), vec2(.0), easeOut(t, 2.0));
    if (dayTime > dayLength * .5) {
      t = saturate(inverseLerp(dayLength * 0.5 - 1.0, dayLength * .5, dayTime));
      sunOffset = vec2(200.0, resolution.y * 0.8) +
                  mix(vec2(0.0), vec2(.0, 400.0), easeOut(t, 2.0));
    }

    vec2 sunPos = pixelCoords - sunOffset;
    float sun = sdfCricle(sunPos, 100.0);
    result = mix(vec3(.84, .68, .26), result, smoothstep(-3.0, .0, sun));

    float s = max(0.001, sun);
    float p = saturate(exp(-0.001 * s * s));
    result += .5 * mix(vec3(.0), vec3(.9, .85, .47), p);
  }

  // MOON
  if (dayTime > dayLength * .5) {
    float t =
        saturate(inverseLerp(dayLength * .5, dayLength * .5 + 1.0, dayTime));
    vec2 moonOffset = vec2(resolution.x - 200.0, resolution.y * 0.8) +
                      mix(vec2(0.0, 400.0), vec2(.0), easeOutBounce(t));
    if (dayTime > dayLength - 1.0) {
      t = saturate(inverseLerp(dayLength - 1.0, dayLength, dayTime));
      moonOffset = vec2(resolution.x - 200.0, resolution.y * 0.8) +
                   mix(vec2(0.0), vec2(.0, 400.0), easeOutBounce(t));
    }

    vec2 moonPos = pixelCoords - moonOffset;
    moonPos = rotate2D(-PI * .2) * moonPos;

    float moonShadow = sdfMoon(moonPos + vec2(25.0));
    result = mix(vec3(.0), result, smoothstep(-50.0, 0.0, moonShadow));
    float moon = sdfMoon(moonPos);
    result = mix(vec3(.9), result, smoothstep(-5.0, .0, moon));

    float moonGlow = sdfMoon(moonPos);
    result +=.1*mix(vec3(1.0), vec3(.0), smoothstep(0.0, 5.0, moonGlow));
  }
  // STARS
  for (float i = 0.0; i < numStars; i += 1.0) {
    float hashSmaple = hash(vec2(i * 13.0)) * .5 + .5;
    float fade = 0.0;
    if (dayTime > dayLength * .9) {
      fade = saturate(inverseLerp(dayLength * .9, dayLength * 0.98,
                                  dayTime - hashSmaple * 0.25));
    }
    float t = saturate(inverseLerp(dayLength * .5, dayLength * .5 + 1.0,
                                   dayTime + hashSmaple * 0.5));
    vec2 offset = vec2(i * 100.0, .0) + 100.0 * hash(vec2(i + 1.0));
    offset += mix(vec2(0.0, 600.0), vec2(0.0), easeOutBounce(t));

    float size = mix(2.0, 1.0, hashSmaple);
    float rotate = PI * hashSmaple;
    vec2 starPos = pixelCoords - offset;
    starPos.x = mod(starPos.x, resolution.x);
    starPos -= vec2(.5, .75) * resolution;
    starPos = starPos * size;
    starPos = rotate2D(rotate) * starPos;

    float star = sdfStar(starPos, 10.0, 2.0);
    vec3 starColor = mix(vec3(1.0), result, smoothstep(-3.0, .0, star));
    starColor += mix(vec3(.2), vec3(.0), pow(smoothstep(-5.0, 15.0, star), 0.25));
    result = mix(starColor, result, fade);
  }

  // CLOUDS
  for (float i = 0.0; i < numClouds; i += 1.0) {
    float size = mix(2.0, 1.0, (i / numClouds) + .1 * hash(vec2(i)));
    float speed = size * 0.25;

    vec2 offset = vec2(i * 200.0 + time * 100.0 * speed,
                       resolution.y * .4 * hash(vec2(i)));
    vec2 pos = pixelCoords - offset;
    pos.x = mod(pos.x, resolution.x);
    pos -= .5 * resolution;

    float cloudShadow = sdfCloud(pos * size + vec2(40.0, 50.0));
    float cloud = sdfCloud(pos * size);
    result = mix(result, vec3(.0), .6 * smoothstep(.0, -100.0, cloudShadow));
    result = mix(vec3(1.0), result, smoothstep(-3.0, .0, cloud));
  }

  gl_FragColor = vec4(result, 1.0);
}
