export default {
  uniforms: {
    ambientPower: {
      type: 'float',
      value: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.1,
    },
    hemispherePower: {
      type: 'float',
      value: 0.05,
      min: 0.0,
      max: 1.0,
      step: 0.1,
    },
    sunPower: {
      type: 'float',
      value: .1,
      min: 0.0,
      max: 1.0,
      step: 0.1,
    },
    lightDir: {
      type: 'vec3',
      value: [1.0, 1.0, 1.0],
    },
  },
  objects: {
    monkey: './assets/初始猴头.glb',
  },
};
