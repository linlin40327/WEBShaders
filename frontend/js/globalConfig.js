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
let loopMode = 1; // 0 = 播放一次, 1 = 循环播放

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (!paused) {
    accumulatedTime += delta * speed;
    if (maxDuration > 0 && accumulatedTime >= maxDuration) {
      if (loopMode === 0) {
        accumulatedTime = maxDuration;
        paused = true;
        finished = true;
      } else {
        accumulatedTime = accumulatedTime % maxDuration;
      }
    } else if (maxDuration === 0 && loopMode === 0) {
      const windowEnd = Math.floor(accumulatedTime / 10) * 10 + 9.99;
      if (accumulatedTime >= windowEnd) {
        accumulatedTime = windowEnd;
        paused = true;
        finished = true;
      }
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

export function getTime() {
  return accumulatedTime;
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
  if (speed === 0.5) speed = 1;
  else if (speed === 1) speed = 2;
  else if (speed === 2) speed = 4;
  else speed = 0.5;
  return speed;
}

export function getLoopMode() {
  return loopMode;
}

export function cycleLoopMode() {
  loopMode = loopMode === 0 ? 1 : 0;
  if (loopMode === 1 && finished) {
    // 切换为循环时，如果已完成则重置并恢复播放
    accumulatedTime = 0;
    paused = false;
    finished = false;
  }
  return loopMode;
}

export function jumpToSegmentEnd() {
  if (maxDuration > 0) {
    accumulatedTime = maxDuration;
  } else {
    accumulatedTime = Math.floor(accumulatedTime / 10) * 10 + 9.99;
  }
  paused = false;
  finished = false;
  if (loopMode === 0 && maxDuration > 0) {
    // 有 duration + 播放一次：跳转到末尾意味着完成
    finished = true;
    paused = true;
  } else if (loopMode === 0 && maxDuration === 0) {
    // 无 duration + 播放一次：跳转到窗口末尾即为完成
    finished = true;
    paused = true;
  } else if (loopMode === 1 && maxDuration > 0) {
    // 有 duration + 循环：末尾归零继续
    accumulatedTime = accumulatedTime % maxDuration;
  }
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
