import { setUniformFromUI, getParsedConfig, getMaxDuration, updateMaxDuration } from './globalConfig.js';
import { toUniformValue, fromUniformValue } from '../tools/uniformTypeTool.js';
import { getAllMaterials } from './scene.js';
import * as THREE from 'three';

const uniformList = document.getElementById('uniform-list');

export function rebuildUniformList() {
  uniformList.innerHTML = '';
  const parsed = getParsedConfig();
  if (!parsed) {
    uniformList.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.3);padding:8px;">当前着色器无可调节 uniform</div>';
    return;
  }

  for (const [name, def] of Object.entries(parsed)) {
    const row = document.createElement('div');
    row.className = 'uniform-item';

    const label = document.createElement('span');
    label.className = 'uniform-label';
    label.textContent = name;
    row.appendChild(label);

    const controls = buildUniformControls(name, def);
    row.appendChild(controls);
    uniformList.appendChild(row);
  }
}

function addWheelStep(input, step, min, max) {
  input.addEventListener('wheel', (e) => {
    if (document.activeElement !== input) return;
    e.preventDefault();
    const sign = e.deltaY < 0 ? 1 : -1;
    const st = typeof step === 'number' ? step : parseFloat(step) || 0.01;
    let val = parseFloat(input.value) || 0;
    val = parseFloat((val + sign * st).toFixed(10));
    if (min != null) val = Math.max(Number(min), val);
    if (max != null) val = Math.min(Number(max), val);
    input.value = val;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });
}

function buildUniformControls(name, def) {
  const wrap = document.createElement('div');
  wrap.className = 'uniform-controls';

  const ui = def.ui;

  if (ui === 'slider' && !def.isBool) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'uniform-slider';
    slider.min = def.min !== null ? def.min : 0;
    slider.max = def.max !== null ? def.max : 100;
    slider.step = def.step !== null ? def.step : 0.1;
    slider.value = fromUniformValue(def.value, def.type);
    wrap.appendChild(slider);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'uniform-input';
    input.min = def.min !== null ? def.min : 0;
    input.max = def.max !== null ? def.max : 100;
    input.step = def.step !== null ? def.step : 0.1;
    input.value = fromUniformValue(def.value, def.type);
    wrap.appendChild(input);
    addWheelStep(input, def.step !== null ? def.step : 0.1, input.min, input.max);

    slider.addEventListener('input', () => {
      let val = def.type === 'int' ? Math.floor(parseFloat(slider.value)) : parseFloat(slider.value);
      input.value = val;
      applyUniformChange(name, val, def.type);
    });

    input.addEventListener('change', () => {
      let val = def.type === 'int' ? Math.floor(parseFloat(input.value) || 0) : parseFloat(input.value) || 0;
      if (def.min !== null) val = Math.max(def.min, val);
      if (def.max !== null) val = Math.min(def.max, val);
      input.value = val;
      slider.value = val;
      applyUniformChange(name, val, def.type);
    });
  }

  else if (ui === 'toggle') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'uniform-checkbox';
    checkbox.checked = def.value === true;
    wrap.appendChild(checkbox);

    checkbox.addEventListener('change', () => {
      applyUniformChange(name, checkbox.checked, def.type);
    });
  }

  else if (ui === 'vec2' || ui === 'vec3' || ui === 'vec4') {
    const size = def.size;
    let vals = fromUniformValue(def.value, def.type);
    if (!Array.isArray(vals)) vals = new Array(size).fill(0);

    for (let i = 0; i < size; i++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'uniform-input';
      input.step = def.step || 0.01;
      input.value = vals[i];
      wrap.appendChild(input);
      addWheelStep(input, def.step || 0.01, null, null);
      input.addEventListener('change', () => {
        vals[i] = parseFloat(input.value) || 0;
        applyUniformChange(name, [...vals], def.type);
      });
    }
  }

  else if (ui === 'bvec2' || ui === 'bvec3' || ui === 'bvec4') {
    const size = def.size;
    let vals = fromUniformValue(def.value, def.type);
    if (!Array.isArray(vals)) vals = new Array(size).fill(false);

    for (let i = 0; i < size; i++) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'uniform-checkbox';
      checkbox.checked = vals[i];
      wrap.appendChild(checkbox);
      checkbox.addEventListener('change', () => {
        vals[i] = checkbox.checked;
        applyUniformChange(name, [...vals], def.type);
      });
    }
  }

  else if (ui === 'colorPicker') {
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'uniform-color';
    colorInput.value = fromUniformValue(def.value, 'color');
    wrap.appendChild(colorInput);

    colorInput.addEventListener('input', () => {
      applyUniformChange(name, colorInput.value, def.type);
    });
  }

  else if (ui === 'colorAlpha') {
    let vals = fromUniformValue(def.value, 'colorAlpha');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'uniform-color';
    const hex = '#' + [vals[0], vals[1], vals[2]]
      .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
      .join('');
    colorInput.value = hex;
    wrap.appendChild(colorInput);

    const alphaInput = document.createElement('input');
    alphaInput.type = 'number';
    alphaInput.className = 'uniform-input';
    alphaInput.step = '0.01';
    alphaInput.min = '0';
    alphaInput.max = '1';
    alphaInput.value = vals[3] !== undefined ? vals[3] : 1;
    wrap.appendChild(alphaInput);
    addWheelStep(alphaInput, 0.01, 0, 1);

    colorInput.addEventListener('input', () => {
      const hexStr = colorInput.value;
      const r = parseInt(hexStr.slice(1, 3), 16) / 255;
      const g = parseInt(hexStr.slice(3, 5), 16) / 255;
      const b = parseInt(hexStr.slice(5, 7), 16) / 255;
      applyUniformChange(name, [r, g, b, parseFloat(alphaInput.value) || 1], def.type);
    });

    alphaInput.addEventListener('change', () => {
      const hexStr = colorInput.value;
      const r = parseInt(hexStr.slice(1, 3), 16) / 255;
      const g = parseInt(hexStr.slice(3, 5), 16) / 255;
      const b = parseInt(hexStr.slice(5, 7), 16) / 255;
      applyUniformChange(name, [r, g, b, parseFloat(alphaInput.value) || 1], def.type);
    });
  }

  else if (ui === 'mat2' || ui === 'mat3' || ui === 'mat4') {
    const size = def.size;
    const dim = Math.sqrt(size);
    const vals = fromUniformValue(def.value, def.type);
    const grid = document.createElement('div');
    grid.className = 'uniform-matrix-grid';
    grid.style.gridTemplateColumns = `repeat(${dim}, 1fr)`;

    for (let i = 0; i < size; i++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'uniform-input';
      input.step = def.step || 0.01;
      input.value = vals[i];
      grid.appendChild(input);
      addWheelStep(input, def.step || 0.01, null, null);
      input.addEventListener('change', () => {
        vals[i] = parseFloat(input.value) || 0;
        applyUniformChange(name, [...vals], def.type);
      });
    }
    wrap.appendChild(grid);
  }

  else if (ui === 'texture') {
    const textureRow = document.createElement('div');
    textureRow.className = 'uniform-texture-row';

    const btn = document.createElement('button');
    btn.className = 'uniform-texture-btn';
    btn.textContent = '选择纹理';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'uniform-texture-name';
    nameSpan.dataset.uniform = name;
    const rawValue = def.raw && def.raw.value;
    const hasInitialPath = typeof rawValue === 'string' && rawValue.trim().length > 0;
    nameSpan.textContent = def.value ? '已加载' : hasInitialPath ? rawValue.replace(/^.*[/\\]/, '') : '未选择';
    textureRow.appendChild(btn);
    textureRow.appendChild(nameSpan);
    wrap.appendChild(textureRow);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    wrap.appendChild(fileInput);

    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      nameSpan.textContent = file.name;
      const url = URL.createObjectURL(file);
      const tex = new THREE.TextureLoader().load(url, () => {
        applyUniformChange(name, tex, def.type);
      });
    });
  }

  return wrap;
}

export function applyUniformChange(name, rawValue, type) {
  const ok = setUniformFromUI(name, rawValue);
  if (ok) {
    const materials = getAllMaterials();
    for (const mat of materials) {
      if (mat.uniforms && mat.uniforms[name]) {
        mat.uniforms[name].value = toUniformValue(rawValue, type);
      }
    }
    if (name === 'duration') {
      updateMaxDuration(rawValue);
    }
  }
}

export function loadShaderTextures(config, dirPath) {
  if (!config || !config.uniforms) return;
  const entries = Object.entries(config.uniforms);
  for (const [name, u] of entries) {
    if (u.type === 'sampler2D' && typeof u.value === 'string' && u.value.startsWith('./')) {
      const fileName = u.value.replace('./', '');
      const img = new Image();
      img.src = `/api/shader/asset?path=${encodeURIComponent(dirPath)}&file=${encodeURIComponent(fileName)}`;
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        config.uniforms[name].value = texture;
        const materials = getAllMaterials();
        for (const mat of materials) {
          if (mat.uniforms && mat.uniforms[name]) {
            mat.uniforms[name].value = texture;
          }
        }
      };
    }
  }
}
