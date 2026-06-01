import * as THREE from 'three';
import { uniforms, mergeUniforms, resetUniforms, resetTime, setTime, togglePause, isPaused, isFinished, cycleSpeed, getParsedConfig, setUniformFromUI, getMaxDuration, updateMaxDuration } from './shaders/config.js';
import { toUniformValue, fromUniformValue } from './tools/uniformTypeTool.js';

const container = document.getElementById('canvas-container');
const drawerToggle = document.getElementById('drawer-toggle');
const drawer = document.getElementById('drawer');
const overlay = document.getElementById('drawer-overlay');
const shaderList = document.getElementById('shader-list');
const resetBtn = document.getElementById('reset-btn');
const addBtn = document.getElementById('add-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalInput = document.getElementById('modal-input');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const modalError = document.getElementById('modal-error');
const deleteModalOverlay = document.getElementById('delete-modal-overlay');
const deleteModalMsg = document.getElementById('delete-modal-msg');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');

const renameModalOverlay = document.getElementById('rename-modal-overlay');
const renameModalInput = document.getElementById('rename-modal-input');
const renameModalCancel = document.getElementById('rename-modal-cancel');
const renameModalConfirm = document.getElementById('rename-modal-confirm');
const renameModalError = document.getElementById('rename-modal-error');

const bottomPanel = document.getElementById('bottom-panel');
const panelHandle = document.getElementById('panel-handle');
const panelTimeline = document.getElementById('panel-timeline');
const uniformList = document.getElementById('uniform-list');
const panelTimeResetBtn = document.getElementById('panel-time-reset-btn');
const panelTimePauseBtn = document.getElementById('panel-time-pause-btn');
const panelTimeSpeedBtn = document.getElementById('panel-time-speed-btn');
const panelTimeDisplay = document.getElementById('panel-time-display');
const panelPauseIcon = document.getElementById('panel-pause-icon');
const panelPlayIcon = document.getElementById('panel-play-icon');
const panelCollapseHint = document.getElementById('panel-collapse-hint');

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const geometry = new THREE.PlaneGeometry(2, 2);

const defaultVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const defaultFragment = `
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(vUv, 0.5, 1.0);
  }
`;

let material = new THREE.ShaderMaterial({
  vertexShader: defaultVertex,
  fragmentShader: defaultFragment,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const vertexModules = import.meta.glob('./shaders/**/vertex.glsl', { query: '?raw', import: 'default' });
const fragmentModules = import.meta.glob('./shaders/**/fragment.glsl', { query: '?raw', import: 'default' });
const configModules = import.meta.glob('./shaders/**/config.js', { import: 'default' });

const validShaderDirs = new Set();
for (const vPath of Object.keys(vertexModules)) {
  const dir = vPath.replace(/\/vertex\.glsl$/, '');
  const fPath = `${dir}/fragment.glsl`;
  if (fragmentModules[fPath]) {
    validShaderDirs.add(dir);
  }
}

function buildShaderTree(shaderOrder) {
  const root = { children: {} };

  for (const dir of validShaderDirs) {
    const rel = dir.replace('./shaders/', '');
    const parts = rel.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children[part]) {
        const fullPath = parts.slice(0, i + 1).join('/');
        node.children[part] = { name: part, children: {}, hasShader: false, dirPath: `./shaders/${fullPath}` };
      }
      node = node.children[part];
    }
    node.hasShader = true;
    node.dirPath = dir;
  }

  function prune(node) {
    const valid = {};
    for (const [k, child] of Object.entries(node.children)) {
      const pruned = prune(child);
      if (pruned) valid[k] = pruned;
    }
    node.children = valid;
    return node.hasShader || Object.keys(node.children).length > 0 ? node : null;
  }

  function toArray(node) {
    const order = (shaderOrder && shaderOrder[node.dirPath]) || [];
    const orderMap = new Map(order.map((p, i) => [p, i]));

    const arr = Object.keys(node.children)
      .sort((a, b) => {
        const childA = node.children[a];
        const childB = node.children[b];
        const idxA = orderMap.has(childA.dirPath) ? orderMap.get(childA.dirPath) : Number.MAX_SAFE_INTEGER;
        const idxB = orderMap.has(childB.dirPath) ? orderMap.get(childB.dirPath) : Number.MAX_SAFE_INTEGER;
        if (idxA !== idxB) return idxA - idxB;
        return a.localeCompare(b);
      })
      .map(k => toArray(node.children[k]));

    return { ...node, children: arr };
  }

  const result = prune(root);
  return result ? toArray(result).children : [];
}

const LOCK_STORAGE_PREFIX = 'shader3d-lock-';

function isLocked(dirPath) {
  return localStorage.getItem(LOCK_STORAGE_PREFIX + dirPath) === '1';
}

function setLocked(dirPath, locked) {
  if (locked) {
    localStorage.setItem(LOCK_STORAGE_PREFIX + dirPath, '1');
  } else {
    localStorage.removeItem(LOCK_STORAGE_PREFIX + dirPath);
  }
  syncLocksToServer();
}

function toggleLock(dirPath) {
  const next = !isLocked(dirPath);
  setLocked(dirPath, next);
  return next;
}

async function syncLastShaderToServer() {
  const val = localStorage.getItem('shader3d-last-shader');
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastShader: val }),
    });
  } catch (err) {
    console.error('同步 lastShader 到服务器失败:', err);
  }
}

async function syncLocksToServer() {
  const locks = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(LOCK_STORAGE_PREFIX)) {
      const dirPath = key.slice(LOCK_STORAGE_PREFIX.length);
      locks[dirPath] = true;
    }
  }
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locks }),
    });
  } catch (err) {
    console.error('同步 locks 到服务器失败:', err);
  }
}

let shaderOrder = {};

async function loadFromServer() {
  try {
    const res = await fetch('/api/db');
    const data = await res.json();
    if (data.lastShader) {
      localStorage.setItem('shader3d-last-shader', data.lastShader);
    }
    if (data.locks) {
      for (const [dirPath, locked] of Object.entries(data.locks)) {
        if (locked) {
          localStorage.setItem(LOCK_STORAGE_PREFIX + dirPath, '1');
        }
      }
    }
    if (data.shaderOrder) {
      shaderOrder = data.shaderOrder;
    }
  } catch (err) {
    console.error('从服务器加载数据失败:', err);
  }
}

async function syncShaderOrder(parentPath, orderArray) {
  if (!shaderOrder) shaderOrder = {};
  shaderOrder[parentPath] = orderArray;
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shaderOrder }),
    });
  } catch (err) {
    console.error('同步 shaderOrder 失败:', err);
  }
}

async function init() {
  await loadFromServer();
  const treeData = buildShaderTree(shaderOrder);
  renderTree(treeData, shaderList);
  activateFirstShader();
}

init();

// ==================== 底部面板拖拽与收起 ====================

const PANEL_HEIGHT_KEY = 'shader3d-panel-height';
const PANEL_COLLAPSED_KEY = 'shader3d-panel-collapsed';
const COLLAPSE_THRESHOLD = 105;

let panelHeight = parseFloat(localStorage.getItem(PANEL_HEIGHT_KEY)) || 200;
let panelCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';

function applyPanelState() {
  if (panelCollapsed) {
    bottomPanel.classList.add('collapsed');
    bottomPanel.style.height = '';
  } else {
    bottomPanel.classList.remove('collapsed');
    bottomPanel.style.height = panelHeight + 'px';
    bottomPanel.style.transform = '';
  }
}

applyPanelState();

let isDragging = false;
let dragStartY = 0;
let dragStartHeight = 0;
let dragMoved = false;
let wasCollapsed = false;

panelHandle.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) return;
  isDragging = true;
  dragMoved = false;
  dragStartY = e.clientY;
  wasCollapsed = panelCollapsed;

  if (!panelCollapsed) {
    dragStartHeight = bottomPanel.getBoundingClientRect().height;
  } else {
    dragStartHeight = 48;
  }

  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const delta = dragStartY - e.clientY;
  if (Math.abs(delta) > 3) {
    if (!dragMoved && wasCollapsed) {
      bottomPanel.classList.remove('collapsed');
      bottomPanel.style.transform = '';
      panelCollapsed = false;
      bottomPanel.style.height = '48px';
    }
    dragMoved = true;
  }
  if (!dragMoved) return;
  const newHeight = Math.max(48, Math.min(600, dragStartHeight + delta));
  bottomPanel.style.height = newHeight + 'px';
  bottomPanel.classList.remove('collapsed');
  bottomPanel.style.transform = '';
  panelCollapsed = false;

  if (newHeight < COLLAPSE_THRESHOLD) {
    panelCollapseHint.classList.remove('hidden');
  } else {
    panelCollapseHint.classList.add('hidden');
  }
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.userSelect = '';
  panelCollapseHint.classList.add('hidden');

  if (dragMoved) {
    const currentHeight = bottomPanel.getBoundingClientRect().height;
    if (currentHeight < COLLAPSE_THRESHOLD) {
      const rightPanel = document.querySelector('.panel-right');
      const rightRect = rightPanel.getBoundingClientRect();
      const overHint = e.clientX >= rightRect.left && e.clientX <= rightRect.right &&
                       e.clientY >= rightRect.top && e.clientY <= rightRect.bottom;

      if (overHint) {
        panelCollapsed = true;
        localStorage.setItem(PANEL_COLLAPSED_KEY, '1');
        applyPanelState();
      } else {
        panelHeight = currentHeight;
        localStorage.setItem(PANEL_HEIGHT_KEY, panelHeight);
        localStorage.setItem(PANEL_COLLAPSED_KEY, '0');
      }
    } else {
      panelHeight = currentHeight;
      localStorage.setItem(PANEL_HEIGHT_KEY, panelHeight);
      localStorage.setItem(PANEL_COLLAPSED_KEY, '0');
    }
  }
});

panelHandle.addEventListener('click', (e) => {
  if (dragMoved) return;
  if (e.target.closest('button')) return;
  panelCollapsed = !panelCollapsed;
  localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? '1' : '0');
  if (!panelCollapsed) {
    bottomPanel.style.height = panelHeight + 'px';
  }
  applyPanelState();
});

// ==================== 顶栏按钮 ====================

resetBtn.addEventListener('click', () => {
  localStorage.removeItem('shader3d-last-shader');
  syncLastShaderToServer();
  const newMaterial = new THREE.ShaderMaterial({
    vertexShader: defaultVertex,
    fragmentShader: defaultFragment,
  });
  mesh.material = newMaterial;
  material.dispose();
  material = newMaterial;
  resetUniforms(material.uniforms);
  document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
  rebuildUniformList();
});

// ==================== 面板时间按钮 ====================

panelTimeResetBtn.addEventListener('click', resetTime);

panelTimePauseBtn.addEventListener('click', () => {
  const paused = togglePause();
  panelPauseIcon.style.display = paused ? 'none' : '';
  panelPlayIcon.style.display = paused ? '' : 'none';
});

panelTimeSpeedBtn.addEventListener('click', function () {
  const speed = cycleSpeed();
  this.textContent = speed + '×';
});

panelTimeline.addEventListener('input', () => {
  setTime(parseFloat(panelTimeline.value));
});

// ==================== Uniform 列表 ====================

function rebuildUniformList() {
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

function applyUniformChange(name, rawValue, type) {
  const ok = setUniformFromUI(name, rawValue);
  if (ok && material.uniforms && material.uniforms[name]) {
    material.uniforms[name].value = toUniformValue(rawValue, type);
    if (name === 'duration') {
      updateMaxDuration(rawValue);
    }
  }
}

// ==================== 着色器加载后刷新 uniform 列表 ====================

let dragInfo = null;
let dragHint = null;

function isFolderEl(el) {
  return el.classList.contains('folder-item') || el.dataset.isFolder === 'true';
}

function dropAction(targetEl, clientX, clientY) {
  const rect = targetEl.getBoundingClientRect();
  if (isFolderEl(targetEl) && clientX >= rect.left + rect.width * 0.5) return 'inside';
  return clientY < rect.top + rect.height * 0.5 ? 'before' : 'after';
}

function showDragHint(targetEl, action) {
  removeDragHint();
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const hint = document.createElement('div');
  hint.className = 'drag-hint';
  hint.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:10000;`;
  document.body.appendChild(hint);

  if (isFolderEl(targetEl)) {
    hint.innerHTML = `<div class="drag-hint-left">同级</div><div class="drag-hint-right">移入</div>`;
    hint.querySelector('.drag-hint-left').classList.toggle('active', action !== 'inside');
    hint.querySelector('.drag-hint-right').classList.toggle('active', action === 'inside');
  } else {
    hint.innerHTML = action === 'before'
      ? '<div class="drag-hint-above">插入上方</div>'
      : '<div class="drag-hint-below">插入下方</div>';
  }
  dragHint = hint;
}

function removeDragHint() {
  if (dragHint) { dragHint.remove(); dragHint = null; }
}

function clearDropStyles() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside');
  });
}

document.addEventListener('dragstart', (e) => {
  const dragEl = e.target.closest('.shader-item-wrap, .folder-item');
  if (!dragEl || dragEl.getAttribute('draggable') === 'false') return;
  dragInfo = {
    dirPath: dragEl.dataset.dirPath,
    parentPath: dragEl.dataset.parentPath || '.',
    element: dragEl,
  };
  dragEl.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragEl.dataset.dirPath);
});

document.addEventListener('dragend', () => {
  if (dragInfo?.element) dragInfo.element.classList.remove('dragging');
  dragInfo = null;
  clearDropStyles();
  removeDragHint();
});

document.addEventListener('dragenter', (e) => { e.preventDefault(); });

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!dragInfo) return;
  e.dataTransfer.dropEffect = 'move';

  const targetEl = e.target.closest('.shader-item-wrap, .folder-item');
  removeDragHint();
  clearDropStyles();

  if (targetEl && targetEl.dataset.dirPath !== dragInfo.dirPath) {
    const action = dropAction(targetEl, e.clientX, e.clientY);
    if (action === 'before') targetEl.classList.add('drop-before');
    else if (action === 'inside') targetEl.classList.add('drop-inside');
    else targetEl.classList.add('drop-after');
    showDragHint(targetEl, action);
  }
});

function getInsertIndex(order, targetDirPath, action) {
  const targetIdx = order.indexOf(targetDirPath);
  if (targetIdx === -1) return order.length;
  return action === 'after' ? targetIdx + 1 : targetIdx;
}

document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!dragInfo) return;

  const targetEl = e.target.closest('.shader-item-wrap, .folder-item');
  removeDragHint();
  clearDropStyles();

  if (targetEl && targetEl.dataset.dirPath !== dragInfo.dirPath) {
    const action = dropAction(targetEl, e.clientX, e.clientY);

    if (action === 'inside') {
      moveShaderToParent(dragInfo.dirPath, targetEl.dataset.dirPath);
      return;
    }

    const targetParent = targetEl.dataset.parentPath || '.';
    if (targetParent === dragInfo.parentPath) {
      const order = shaderOrder[targetParent] || [];
      const filtered = order.filter(p => p !== dragInfo.dirPath);
      const idx = getInsertIndex(order, targetEl.dataset.dirPath, action);
      filtered.splice(idx, 0, dragInfo.dirPath);
      shaderOrder[targetParent] = filtered;
      syncShaderOrder(targetParent, filtered);
      const dragLi = dragInfo.element.parentElement;
      const targetLi = targetEl.parentElement;
      if (dragLi && targetLi && dragLi.parentElement === targetLi.parentElement) {
        if (action === 'after') {
          targetLi.parentElement.insertBefore(dragLi, targetLi.nextSibling);
        } else {
          targetLi.parentElement.insertBefore(dragLi, targetLi);
        }
      }
    } else {
      const order = shaderOrder[targetParent] || [];
      const filtered = order.filter(p => p !== dragInfo.dirPath);
      const idx = getInsertIndex(order, targetEl.dataset.dirPath, action);
      filtered.splice(idx, 0, dragInfo.dirPath);
      shaderOrder[targetParent] = filtered;
      syncShaderOrder(targetParent, filtered);
      moveShaderToParent(dragInfo.dirPath, targetParent);
    }
    return;
  }

  if (dragInfo.parentPath !== '.' && e.target.closest('#shader-list')) {
    moveShaderToParent(dragInfo.dirPath, '.');
  }
});

function moveShaderToParent(dirPath, targetParent) {
  fetch('/api/move-shader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: dirPath, target: targetParent }),
  })
    .then(res => { if (!res.ok) return res.json().then(d => showToast(d.error || '移动失败')); })
    .catch(() => showToast('网络错误'));
}

function showToast(msg) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function createShaderItemElement(dirPath, name) {
  const wrap = document.createElement('div');
  wrap.className = 'shader-item-wrap';
  wrap.setAttribute('draggable', 'true');
  wrap.dataset.dirPath = dirPath;

  const item = document.createElement('div');
  item.className = 'shader-item';
  item.dataset.folder = dirPath;
  item.textContent = name;
  item.addEventListener('click', () => {
    setActiveShader(dirPath);
    closeDrawer();
  });
  wrap.appendChild(item);

  const lockBtn = document.createElement('button');
  lockBtn.className = 'shader-lock-btn';
  lockBtn.title = '锁定/解锁';
  lockBtn.innerHTML = isLocked(dirPath)
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const locked = toggleLock(dirPath);
    lockBtn.innerHTML = locked
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
    lockBtn.classList.toggle('locked', locked);
  });
  lockBtn.classList.toggle('locked', isLocked(dirPath));
  wrap.appendChild(lockBtn);

  const renameBtn = document.createElement('button');
  renameBtn.className = 'shader-rename-btn';
  renameBtn.title = '重命名';
  renameBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showRenameModal(dirPath, name);
  });
  wrap.appendChild(renameBtn);

  const trashBtn = document.createElement('button');
  trashBtn.className = 'shader-delete-btn';
  trashBtn.title = '删除';
  trashBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  trashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isLocked(dirPath)) {
      showToast('已锁定，请先解锁后再删除');
      return;
    }
    showDeleteModal(dirPath, name);
  });
  wrap.appendChild(trashBtn);

  return wrap;
}

function setActiveShader(dirPath) {
  localStorage.setItem('shader3d-last-shader', dirPath);
  syncLastShaderToServer();
  document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.querySelector(`.shader-list .shader-item[data-folder="${dirPath}"]`);
  if (activeItem) activeItem.classList.add('active');

  const vertexPath = `${dirPath}/vertex.glsl`;
  const fragmentPath = `${dirPath}/fragment.glsl`;

  if (vertexModules[vertexPath] && fragmentModules[fragmentPath]) {
    const promises = [
      vertexModules[vertexPath](),
      fragmentModules[fragmentPath](),
    ];

    const configPath = `${dirPath}/config.js`;
    if (configModules[configPath]) {
      promises.push(configModules[configPath]());
    } else {
      promises.push(Promise.resolve(null));
    }

    Promise.all(promises).then(([vertSrc, fragSrc, config]) => {
      const theUniforms = mergeUniforms(config);

      const newMaterial = new THREE.ShaderMaterial({
        vertexShader: vertSrc,
        fragmentShader: fragSrc,
        uniforms: theUniforms,
      });

      mesh.material = newMaterial;
      material.dispose();
      material = newMaterial;
      resetUniforms(material.uniforms);
      rebuildUniformList();

      if (config && config.uniforms) {
        for (const [name, def] of Object.entries(config.uniforms)) {
          if ((def.type === 'sampler2D' || def.type === 'texture2D') && typeof def.value === 'string' && def.value.trim().length > 0) {
            const assetPath = def.value.startsWith('./') ? 'assets/' + def.value.slice(2) : def.value;
            const texUrl = dirPath + '/' + assetPath;
            const fileName = assetPath.replace(/^.*[/\\]/, '');
            new THREE.TextureLoader().load(texUrl,
              (tex) => {
                if (material.uniforms[name]) {
                  material.uniforms[name].value = tex;
                }
                const parsed = getParsedConfig();
                if (parsed && parsed[name]) {
                  parsed[name].value = tex;
                }
                const uiSpan = document.querySelector(`.uniform-texture-name[data-uniform="${name}"]`);
                if (uiSpan) {
                  uiSpan.textContent = fileName;
                  uiSpan.style.color = '';
                }
              },
              undefined,
              () => {
                const uiSpan = document.querySelector(`.uniform-texture-name[data-uniform="${name}"]`);
                if (uiSpan) {
                  uiSpan.textContent = `${fileName} 不存在！`;
                  uiSpan.style.color = '#ef4444';
                }
              }
            );
          }
        }
      }
    });
  }
}

function renderTree(nodes, parentEl, parentDirPath) {
  const pp = parentDirPath || '.';
  for (const node of nodes) {
    const hasSubfolders = node.children.length > 0;

    if (node.hasShader && !hasSubfolders) {
      const li = document.createElement('li');
      li.style.listStyle = 'none';
      const el = createShaderItemElement(node.dirPath, node.name);
      el.setAttribute('draggable', 'true');
      el.dataset.dirPath = node.dirPath;
      el.dataset.parentPath = pp;
      el.dataset.isFolder = 'true';
      li.appendChild(el);
      parentEl.appendChild(li);
      continue;
    }

    const folderLi = document.createElement('li');
    folderLi.className = 'folder-item';
    folderLi.setAttribute('draggable', 'true');
    folderLi.dataset.dirPath = node.dirPath || '';
    folderLi.dataset.parentPath = pp;

    const toggle = document.createElement('span');
    toggle.className = 'folder-toggle';
    toggle.textContent = '\u25B6';
    folderLi.appendChild(toggle);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = node.name;
    folderLi.appendChild(nameSpan);
    parentEl.appendChild(folderLi);

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'folder-children';
    childrenUl.style.display = 'none';
    childrenUl.dataset.parentPath = node.dirPath || '';

    if (node.hasShader) {
      const li = document.createElement('li');
      li.style.listStyle = 'none';
      const el = createShaderItemElement(node.dirPath, '#default');
      el.setAttribute('draggable', 'false');
      el.dataset.dirPath = node.dirPath;
      el.dataset.parentPath = node.dirPath || '';
      el.dataset.isFolder = 'true';
      li.appendChild(el);
      childrenUl.appendChild(li);
    }

    renderTree(node.children, childrenUl, node.dirPath || '');
    parentEl.appendChild(childrenUl);

    folderLi.addEventListener('click', (e) => {
      const hidden = childrenUl.style.display === 'none';
      childrenUl.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '\u25BC' : '\u25B6';
    });
  }
}

function activateShader(dirPath) {
  const item = document.querySelector(`.shader-list .shader-item[data-folder="${dirPath}"]`);
  if (!item) return false;

  let parent = item.closest('.folder-children');
  while (parent) {
    parent.style.display = '';
    const folderLi = parent.previousElementSibling;
    if (folderLi) {
      const toggle = folderLi.querySelector('.folder-toggle');
      if (toggle) toggle.textContent = '\u25BC';
    }
    parent = folderLi ? folderLi.parentElement.closest('.folder-children') : null;
  }
  setActiveShader(dirPath);
  return true;
}

function activateFirstShader() {
  const savedDir = localStorage.getItem('shader3d-last-shader');
  if (savedDir) {
    activateShader(savedDir);
  }
}

function openDrawer() {
  drawer.classList.add('open');
  overlay.classList.add('open');
  drawerToggle.classList.add('open');
}

function closeDrawer() {
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawerToggle.classList.remove('open');
}

drawerToggle.addEventListener('click', () => {
  if (drawer.classList.contains('open')) {
    closeDrawer();
  } else {
    openDrawer();
  }
});

overlay.addEventListener('click', closeDrawer);

function openModal() {
  modalOverlay.classList.remove('hidden');
  modalInput.value = '';
  modalError.classList.add('hidden');
  modalError.textContent = '';
  setTimeout(() => modalInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.classList.remove('hidden');
}

addBtn.addEventListener('click', openModal);

modalCancel.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') modalConfirm.click();
});

modalConfirm.addEventListener('click', async () => {
  const name = modalInput.value.trim();
  if (!name) {
    showModalError('名称不能为空');
    return;
  }

  try {
    const res = await fetch('/api/create-shader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();

    if (!res.ok) {
      showModalError(data.error || '创建失败');
      return;
    }

    closeModal();

    const dirPath = `./shaders/${name}`;

    const vertSrc = `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

    const fragSrc = `varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}
`;

    const newMaterial = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
    });

    mesh.material = newMaterial;
    material.dispose();
    material = newMaterial;
    resetUniforms(material.uniforms);

    const li = document.createElement('li');
    li.style.listStyle = 'none';
    li.appendChild(createShaderItemElement(dirPath, name));
    shaderList.appendChild(li);

    document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
    const activeItem = li.querySelector('.shader-item');
    activeItem.classList.add('active');

    localStorage.setItem('shader3d-last-shader', dirPath);
    syncLastShaderToServer();

    const parentKey = '.';
    if (!shaderOrder[parentKey]) shaderOrder[parentKey] = [];
    if (!shaderOrder[parentKey].includes(dirPath)) {
      shaderOrder[parentKey].push(dirPath);
    }
    syncShaderOrder(parentKey, shaderOrder[parentKey]);

    rebuildUniformList();
  } catch (err) {
    showModalError('网络错误，请检查服务是否运行');
  }
});

let pendingDeleteDir = '';

function showDeleteModal(dirPath, name) {
  pendingDeleteDir = dirPath;
  const shortName = dirPath.replace('./shaders/', '');
  deleteModalMsg.textContent = `确定要删除 "${shortName}" 吗？此操作不可恢复。`;
  deleteModalOverlay.classList.remove('hidden');
}

function closeDeleteModal() {
  deleteModalOverlay.classList.add('hidden');
  pendingDeleteDir = '';
}

deleteModalCancel.addEventListener('click', closeDeleteModal);

deleteModalOverlay.addEventListener('click', (e) => {
  if (e.target === deleteModalOverlay) closeDeleteModal();
});

deleteModalConfirm.addEventListener('click', async () => {
  if (!pendingDeleteDir) return;

  const shortName = pendingDeleteDir.replace('./shaders/', '');

  try {
    const res = await fetch('/api/delete-shader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: shortName }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('删除失败:', data.error);
      return;
    }

    closeDeleteModal();
    localStorage.removeItem('shader3d-last-shader');
    syncLastShaderToServer();

    const newMaterial = new THREE.ShaderMaterial({
      vertexShader: defaultVertex,
      fragmentShader: defaultFragment,
    });
    mesh.material = newMaterial;
    material.dispose();
    material = newMaterial;
    resetUniforms(material.uniforms);

    document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));

    window.location.reload();
  } catch (err) {
    console.error('网络错误', err);
  }
});

let pendingRenameDir = '';

function showRenameModal(dirPath, name) {
  pendingRenameDir = dirPath;
  const shortName = dirPath.replace('./shaders/', '');
  renameModalInput.value = shortName.split('/').pop();
  renameModalError.classList.add('hidden');
  renameModalOverlay.classList.remove('hidden');
  setTimeout(() => renameModalInput.focus(), 100);
}

function closeRenameModal() {
  renameModalOverlay.classList.add('hidden');
  pendingRenameDir = '';
}

renameModalCancel.addEventListener('click', closeRenameModal);

renameModalOverlay.addEventListener('click', (e) => {
  if (e.target === renameModalOverlay) closeRenameModal();
});

renameModalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') renameModalConfirm.click();
});

renameModalConfirm.addEventListener('click', async () => {
  if (!pendingRenameDir) return;
  const newName = renameModalInput.value.trim();
  if (!newName) {
    renameModalError.textContent = '名称不能为空';
    renameModalError.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/rename-shader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: pendingRenameDir, newName }),
    });

    const data = await res.json();

    if (!res.ok) {
      renameModalError.textContent = data.error || '重命名失败';
      renameModalError.classList.remove('hidden');
      return;
    }

    closeRenameModal();

    if (localStorage.getItem('shader3d-last-shader') === pendingRenameDir) {
      localStorage.setItem('shader3d-last-shader', data.newPath);
      syncLastShaderToServer();
    }

    window.location.reload();
  } catch (err) {
    renameModalError.textContent = '网络错误';
    renameModalError.classList.remove('hidden');
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const elapsed = uniforms.time.value;
  if (material.uniforms && material.uniforms.uTime) {
    material.uniforms.uTime.value = elapsed;
  }

  const maxDur = getMaxDuration();
  if (maxDur > 0) {
    panelTimeline.max = maxDur;
    panelTimeline.value = elapsed.toFixed(2);
    panelTimeDisplay.textContent = elapsed.toFixed(2) + 's / ' + maxDur.toFixed(1) + 's';
  } else {
    panelTimeline.max = 10;
    panelTimeline.value = (elapsed % 10).toFixed(2);
    panelTimeDisplay.textContent = elapsed.toFixed(2) + 's';
  }

  if (isFinished() || isPaused()) {
    panelPauseIcon.style.display = 'none';
    panelPlayIcon.style.display = '';
  } else {
    panelPauseIcon.style.display = '';
    panelPlayIcon.style.display = 'none';
  }

  renderer.render(scene, camera);
}

animate();
