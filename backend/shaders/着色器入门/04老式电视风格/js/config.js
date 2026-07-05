export default {
  uniforms: {
    stripesCount: {
      type: 'float',
      value: 80,
      min: 1.0,
      max: 100.0,
      step: 1.0,
    },
    speed: {
      type: 'float',
      value: 5.0,
      min: 0.0,
      max: 10.0,
      step: 0.1,
    },
    backgroundImage:{
      type: 'sampler2D',
      value: './background.jpeg',
    }
  },
};
