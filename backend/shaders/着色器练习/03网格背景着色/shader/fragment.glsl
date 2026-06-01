varying vec2 vUv;
uniform vec2 resolution;
uniform float cellSize;

void main() {
  vec3 black = vec3(0.0);
  vec3 axis = vec3(.0, .0, 1.0);

  // 绘制网格背景
  vec3 color = vec3(0.75);
  vec2 center = vUv - .5;
  vec2 cell = fract(center * resolution / cellSize);
  float distToCell = 1.0 - 2.0 * max(abs(cell.x - .5), abs(cell.y - .5));
  float cellLine = smoothstep(0.0, 0.05, distToCell);
  color = mix(black, color, cellLine);
  // 绘制坐标轴
  float xAxis = smoothstep(0.0, 0.003, abs(vUv.y - .5));
  float yAxis = smoothstep(0.0, 0.003, abs(vUv.x - .5));
  // color = mix(axis, color, xAxis + yAxis);
  color = mix(axis, color, (xAxis));
  color = mix(axis, color, (yAxis));
  // 绘制函数线
  vec2 pos = center * resolution / cellSize;
  float value1 = pos.y - pos.x;
  vec3 lineColor1 = vec3(.5, 1.0, 1.0);
  float functionLine1 = smoothstep(0.0, 0.075, abs(value1));
  color = mix(lineColor1, color, functionLine1);
  float value2 = pos.y + .5 - floor(pos.x);
  vec3 lineColor2 = vec3(1.0, .0, .0);
  float functionLine2 = smoothstep(0.0, 0.075, abs(value2));
  color = mix(lineColor2, color, functionLine2);
  float value3 = pos.y - .5 - ceil(pos.x);
  vec3 lineColor3 = vec3(.0, 1.0, .0);
  float functionLine3 = smoothstep(0.0, 0.075, abs(value3));
  color = mix(lineColor3, color, functionLine3);
  float value4 = pos.y - round(pos.x);
  vec3 lineColor4 = vec3(1.0, 1.0, .0);
  float functionLine4 = smoothstep(0.0, 0.075, abs(value4));
  color = mix(lineColor4, color, functionLine4);
  float value5 = pos.y - fract(pos.x);
  vec3 lineColor5 = vec3(.8, .2, .8);
  float functionLine5 = smoothstep(0.0, 0.075, abs(value5));
  color = mix(lineColor5, color, functionLine5);

  gl_FragColor = vec4(color, 1.0);
}
