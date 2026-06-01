import * as THREE from 'three';
import { parseUniformConfig, buildThreeUniforms, updateUniformValue } from '../tools/uniformTypeTool.js';

const uniforms = {
  time: { value: 0 },
  resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
};

const clock = new THREE.Clock();
let paused = false;
let speed = 1;
let accumulatedTime = 0;
let maxDuration = 0;
let finished = false;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (!paused) {
    accumulatedTime += delta * speed;
    if (maxDuration > 0 && accumulatedTime >= maxDuration) {
      accumulatedTime = maxDuration;
      paused = true;
      finished = true;
    }
  }
  uniforms.time.value = accumulatedTime;
}
animate();

window.addEventListener('resize', () => {
  uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});

export function resetTime() {
  accumulatedTime = 0;
  paused = false;
  finished = false;
}

export function setTime(value) {
  accumulatedTime = Math.max(0, value);
  if (maxDuration > 0 && accumulatedTime > maxDuration) {
    accumulatedTime = maxDuration;
  }
}

export function togglePause() {
  if (paused && finished) {
    accumulatedTime = 0;
    finished = false;
    paused = false;
    return paused;
  }
  paused = !paused;
  return paused;
}

export function isPaused() {
  return paused;
}

export function isFinished() {
  return finished;
}

export function cycleSpeed() {
  if (speed === 1) speed = 2;
  else if (speed === 2) speed = 4;
  else speed = 1;
  return speed;
}

export { uniforms };

let initialUniformSnapshot = {};
let lastParsedConfig = null;

export function mergeUniforms(localConfig) {
  const result = {};
  Object.assign(result, uniforms);

  if (localConfig && localConfig.uniforms) {
    lastParsedConfig = parseUniformConfig(localConfig);
    const localUniforms = buildThreeUniforms(lastParsedConfig);
    Object.assign(result, localUniforms);

    if (lastParsedConfig.duration && typeof lastParsedConfig.duration.value === 'number') {
      maxDuration = lastParsedConfig.duration.value;
    } else {
      maxDuration = 0;
    }
  } else {
    lastParsedConfig = null;
    maxDuration = 0;
  }

  accumulatedTime = 0;
  paused = false;
  finished = false;

  initialUniformSnapshot = {};
  for (const key in result) {
    const val = result[key].value;
    if (val !== null && val !== undefined && typeof val.clone === 'function') {
      initialUniformSnapshot[key] = val.clone();
    } else {
      initialUniformSnapshot[key] = val;
    }
  }

  return result;
}

export function getMaxDuration() {
  return maxDuration;
}

export function updateMaxDuration(value) {
  maxDuration = typeof value === 'number' ? value : 0;
  if (maxDuration > 0 && accumulatedTime > maxDuration) {
    accumulatedTime = maxDuration;
  }
}

export function resetUniforms(targetUniforms) {
  if (!targetUniforms) return;
  for (const key in initialUniformSnapshot) {
    if (!(key in targetUniforms)) continue;
    const src = initialUniformSnapshot[key];
    const dst = targetUniforms[key].value;
    if (dst !== null && dst !== undefined && typeof dst.copy === 'function' && src !== null && src !== undefined) {
      dst.copy(src);
    } else {
      targetUniforms[key].value = src;
    }
  }
  accumulatedTime = 0;
}

export function getParsedConfig() {
  return lastParsedConfig;
}

export function setUniformFromUI(name, rawValue) {
  if (!lastParsedConfig || !lastParsedConfig[name]) return false;
  const result = updateUniformValue(lastParsedConfig, name, rawValue);
  if (name === 'duration' && typeof lastParsedConfig.duration.value === 'number') {
    updateMaxDuration(lastParsedConfig.duration.value);
  }
  return result;
}
