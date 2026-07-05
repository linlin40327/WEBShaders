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
    uLightDir: {
      type: 'vec3',
      value: [1.0, 1.0, 1.0],
    },
    specularPower: {
      type: 'float',
      value: 32.0,
      min: 4.0,
      max: 100.0,
      step: 4.0,
    },
    specularButtom: {
      type: 'bool',
      value: true,
    },
  },
  objects: {
    monkey: './assets/初始猴头.glb',
  },
};
