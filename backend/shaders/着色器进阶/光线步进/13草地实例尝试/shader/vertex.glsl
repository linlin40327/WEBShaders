varying vec2 vUv;
uniform vec4 grassParams;

void main() {
  vUv = uv;
  int GRASS_SEGMENTS = int(grassParams.x);
  int GRASS_VERTIVES = int(grassParams.y);
  float GRASS_HEIGHT = grassParams.w;
  float GRASS_WIDTH = grassParams.z;

  vec3 grassOffset = vec3(0.0, 0.0, 0.0);

  int vertFB = gl_VertexID % (GRASS_VERTIVES * 2.0);
  int vertIndex = vertFB % GRASS_VERTIVES;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
