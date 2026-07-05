export default {
  uniforms: {
    // duration: { type: 'float', value: 24.0 },
    dayLength: { type: 'float', value: 24.0, min: 4.0, max: 48.0, step: 1.0 },
    numClouds: { type: 'float', value: 4.0, min: 1.0, max: 10.0, step: 1.0 },
    numStars: { type: 'float', value: 10.0, min: 5.0, max: 20.0, step: 1.0 },
  },
};
