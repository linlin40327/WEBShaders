varying vec2 vUv;
uniform vec2 resolution;
uniform float time;

float inverLerp(float a, float b, float v) { return (b - a) / (b - a); }
float remap(float v, float a, float b, float a2, float b2) {
  return inverLerp(a, b, v) * (b2 - a2) + a2;
}
float saturate(float v) { return clamp(v, 0.0, 1.0); }

const float PI = 3.14159265358979323846;
mat3 rotateY(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat3(c, .0, -s, .0, 1.0, .0, s, .0, c);
}

float sphereSDF(vec3 p, float radius) { return length(p) - radius; }
float boxSDF(vec3 p, vec3 w) {
  vec3 d = abs(p) - w;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), .0);
}
float boxFrameSDF(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(length(max(vec3(p.x, q.y, q.z), 0.0)) +
                     min(max(p.x, max(q.y, q.z)), 0.0),
                 length(max(vec3(q.x, p.y, q.z), 0.0)) +
                     min(max(q.x, max(p.y, q.z)), 0.0)),
             length(max(vec3(q.x, q.y, p.z), 0.0)) +
                 min(max(q.x, max(q.y, p.z)), 0.0));
}
float planeSDF(vec3 p) {
  // n must be normalized
  return p.y;
}

struct MaterialData {
  vec3 color;
  float dist;
};
vec3 RED = vec3(1.0, 0.0, 0.0);
vec3 GREEN = vec3(0.0, 1.0, 0.0);
vec3 BLUE = vec3(0.0, 0.0, 1.0);
vec3 GRAY = vec3(.5);
vec3 WHITE = vec3(1.0);
// calculate the overall SDF value
MaterialData calculateSceneSDF(vec3 p) {
  MaterialData result = MaterialData(GRAY, planeSDF(p - vec3(.0, -2.0, .0)));
  float box01 = boxSDF((p - vec3(-2.0, -.84, 5.0)), vec3(1.0));
  if (box01 < result.dist) {
    result = MaterialData(RED, box01);
  }
  float box02 = boxFrameSDF((p - vec3(2.0, -.84, 5.0)), vec3(1.0), .1);
  if (box02 < result.dist) {
    result = MaterialData(BLUE, box02);
  }
  float box03 = boxSDF(p - vec3(.0, -.85, sin(0.0) * 10.0 + 20.0), vec3(1.0));
  if (box03 < result.dist) {
    result = MaterialData(BLUE, box03);
  }
  return result;
}
const int NUM_STEPS = 100;
const float EPS = 0.001;
const float MAX_DISTANCE = 1000.0;

vec3 CalculateNormal(vec3 p) {
  vec3 n = vec3(calculateSceneSDF(p + vec3(EPS, 0.0, 0.0)).dist -
                    calculateSceneSDF(p - vec3(EPS, 0.0, 0.0)).dist,
                calculateSceneSDF(p + vec3(0.0, EPS, 0.0)).dist -
                    calculateSceneSDF(p - vec3(0.0, EPS, 0.0)).dist,
                calculateSceneSDF(p + vec3(0.0, 0.0, EPS)).dist -
                    calculateSceneSDF(p - vec3(0.0, 0.0, EPS)).dist);
  return normalize(n);
}
vec3 CalculateLighting(vec3 p, vec3 n, vec3 lightColor, vec3 lightDir) {
  float diffuse = saturate(dot(n, lightDir));
  // diffuse =
  // mix(mix(.3,.5,smoothstep(.4,.5,diffuse)),.9,smoothstep(.7,.8,diffuse));

  return diffuse * lightColor;
}
float CalculateShadow(vec3 p, vec3 lightDir, float w) {
  float startD = 0.01;
  float res = 1.0;
  // float MAX_DIST = 10.0;
  for (int i = 0; i < NUM_STEPS; i++) {
    float h = calculateSceneSDF(p + startD * lightDir).dist;

    if (h < EPS) {
      return .0;
    }
    res = min(res, h / startD / w);
    startD += h;
  }

  return res;
}
float CalculateAO(vec3 pos, vec3 n) {
  float ao = .0;
  float stepSize = .1;
  for (float i = .0; i < 5.0; ++i) {
    float distFactor = 1.0 / pow(2.0, i);
    ao += distFactor *
          (i * stepSize - calculateSceneSDF(pos + n * i * stepSize).dist);
  }
  return 1.0 - ao;
}

MaterialData RayCast(vec3 origin, vec3 dir, int nunSteps, float startD,
                     float max_dist) {
  MaterialData material = MaterialData(vec3(.0), startD);
  for (int i = 0; i < nunSteps; i++) {
    vec3 pos = origin + dir * material.dist;

    MaterialData result = calculateSceneSDF(pos);
    // case1:hit the scene
    if (result.dist < EPS) {
      break;
    }
    material.dist += result.dist;
    material.color = result.color;
    // case2:dist>MAX_DISTANCE
    if (material.dist > MAX_DISTANCE) {
      return skyColor;
    }
    // case3:loop round,in reality,do nothing.
  }
}

vec3 RayMarch(vec3 cameraOrigin, vec3 cameraDir) {
  vec3 pos;
  MaterialData material = MaterialData(vec3(.0), .0);

  vec3 skyColor = vec3(.55, .6, 1.0);

  vec3 lightColor = WHITE;
  // vec3 lightPos = vec3(20.0, -2.4, 5.0);
  vec3 lightDir = normalize(vec3(1.0, 2.0, -1.0));
  // vec3 viewDir = normalize(-cameraDir);
  vec3 normal = CalculateNormal(pos);
  vec3 lighting = CalculateLighting(pos, normal, lightColor, lightDir);

  float shadow = CalculateShadow(pos, lightDir, 0.1);
  lighting *= shadow;
  float ao = CalculateAO(pos, normal);
  vec3 color = material.color * lighting;
  float fogFactor = 1.0 - exp(-pos.z * 0.01);
  color = mix(color, skyColor, fogFactor);

  return color;
}

void main() {
  vec2 pixel_coords = (vUv - .5) * resolution;
  vec3 result = vec3(0.0);

  vec3 rayOrigin = vec3(0.0);
  vec3 rayDir = normalize(vec3(pixel_coords * 2.0 / resolution.y, 1.0));
  result = RayMarch(rayOrigin, rayDir);

  gl_FragColor = vec4(pow(result, vec3(1.0 / 1.2)), 1.0);
}
