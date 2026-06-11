import * as THREE from 'three';
import { mergeUniforms, resetUniforms, getParsedConfig } from './globalConfig.js';
import { clearModels, addModels, getAllMaterials, setMaterial, setCamera, resetCamera } from './scene.js';
import { isLocked, toggleLock, syncLastShaderToServer, syncTreeExpand, isCameraEnabled, getTree } from './shaderTree.js';
import { loadShaderTextures, rebuildUniformList } from './uniformUI.js';
import { showToast, showDeleteModal, showRenameModal, showDeleteCollectionModal, showCollectionItemModal } from './modal.js';
import { sendActivePath } from './wsClient.js';

let spinTimeout = null;

export function spinResetBtn() {
  const btn = document.getElementById('reset-btn');
  if (!btn) return;
  clearTimeout(spinTimeout);
  btn.classList.remove('spinning');
  void btn.offsetWidth;
  btn.classList.add('spinning');
  spinTimeout = setTimeout(() => {
    btn.classList.remove('spinning');
    spinTimeout = null;
  }, 600);
}

export function reloadConfigOnly(dirPath) {
  const encodedPath = encodeURIComponent(dirPath);
  fetch(`/api/shader/config?path=${encodedPath}`)
    .then(r => r.json())
    .then(config => {
      const theUniforms = mergeUniforms(config);
      const materials = getAllMaterials();
      for (const mat of materials) {
        if (mat.isShaderMaterial && mat.uniforms) {
          for (const key in theUniforms) {
            mat.uniforms[key] = theUniforms[key];
          }
        }
      }
      rebuildUniformList();
      loadShaderTextures(config, dirPath);
    });
}

export function reloadShaderOnly(dirPath) {
  const encodedPath = encodeURIComponent(dirPath);
  Promise.all([
    fetch(`/api/shader/vertex?path=${encodedPath}`).then(r => r.text()),
    fetch(`/api/shader/fragment?path=${encodedPath}`).then(r => r.text()),
  ]).then(([vertSrc, fragSrc]) => {
    const materials = getAllMaterials();
    for (const mat of materials) {
      if (mat.isShaderMaterial) {
        mat.vertexShader = vertSrc;
        mat.fragmentShader = fragSrc;
        mat.needsUpdate = true;
      }
    }
  });
}

function createDefaultPlaneModel(config, shader) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: shader.vertex,
    fragmentShader: shader.fragment,
    uniforms: config.uniforms,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  return { objects: [mesh], camera };
}

async function createFromObjectJS(dirPath, config, shader) {
  try {
    const res = await fetch(`/api/shader/object-js?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok) return null;
    const code = await res.text();
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const module = await import(url);
    URL.revokeObjectURL(url);
    return module.createObjects(config, shader);
  } catch (e) {
    console.error('object.js 执行失败:', e);
    return null;
  }
}

function expandAncestors(dirPath) {
  let el = document.querySelector(`.shader-list .shader-item[data-dir-path="${CSS.escape(dirPath)}"]`);
  if (!el) return;
  while (el) {
    const parentUl = el.closest('.folder-children');
    if (!parentUl) break;
    parentUl.style.display = '';
    const folderLi = parentUl.previousElementSibling;
    if (folderLi) {
      const toggle = folderLi.querySelector('.folder-toggle');
      if (toggle) toggle.textContent = '\u25BC';
    }
    el = folderLi;
  }
}

export function setActiveShader(dirPath) {
  localStorage.setItem('shader3d-last-shader', dirPath);
  syncLastShaderToServer();
  sendActivePath(dirPath);

  const cameraBtn = document.getElementById('camera-btn');
  const enabled = isCameraEnabled(dirPath);
  if (enabled) {
    cameraBtn.classList.add('active');
    cameraBtn.title = '摄像头：开';
  } else {
    cameraBtn.classList.remove('active');
    cameraBtn.title = '摄像头：关';
  }

  document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`.shader-list .shader-item[data-dir-path="${CSS.escape(dirPath)}"]`);
  if (target) target.classList.add('active');

  expandAncestors(dirPath);

  const encodedPath = encodeURIComponent(dirPath);

  Promise.all([
    fetch(`/api/shader/vertex?path=${encodedPath}`).then(r => r.text()),
    fetch(`/api/shader/fragment?path=${encodedPath}`).then(r => r.text()),
    fetch(`/api/shader/config?path=${encodedPath}`).then(r => r.json()),
  ]).then(async ([vertSrc, fragSrc, config]) => {
    const theUniforms = mergeUniforms(config);

    const shortPath = dirPath.replace(/^\.\.\/shaders\//, '');
    const objects = {};
    if (config.objects) {
      for (const [key, val] of Object.entries(config.objects)) {
        const raw = typeof val === 'string' ? val : val.path;
        objects[key] = raw && raw.startsWith('./')
          ? '/shaders/' + shortPath + '/' + raw.replace('./', '')
          : raw;
      }
    }
    const processedConfig = {
      uniforms: theUniforms,
      objects,
    };

    const shader = {
      vertex: vertSrc,
      fragment: fragSrc,
    };

    let result = createDefaultPlaneModel(processedConfig, shader);

    try {
      const objResult = await createFromObjectJS(dirPath, processedConfig, shader);
      if (objResult) result = objResult;
    } catch {
    }

    clearModels();
    addModels(result.objects);
    if (result.camera) {
      setCamera(result.camera);
    } else {
      resetCamera();
    }
    const materials = getAllMaterials();
    const shaderMat = materials.find(m => m.isShaderMaterial);
    if (shaderMat) setMaterial(shaderMat);
    resetUniforms(theUniforms);
    rebuildUniformList();
    loadShaderTextures(config, dirPath);
    spinResetBtn();
  }).catch(() => {
    const theUniforms = mergeUniforms({});
    const defaultModel = createDefaultPlaneModel(
      { uniforms: theUniforms, objects: {} },
      {
        vertex: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragment: `varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}`,
      },
    );
    clearModels();
    addModels(defaultModel.objects);
    setCamera(defaultModel.camera);
    const materials = getAllMaterials();
    const shaderMat = materials.find(m => m.isShaderMaterial);
    if (shaderMat) setMaterial(shaderMat);
    resetUniforms(theUniforms);
    rebuildUniformList();
  });
}

export function getDrawerCallbacks() {
  return { isLocked, toggleLock };
}

export function createShaderItemElement(dirPath, name, callbacks = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'shader-item-wrap';
  wrap.dataset.dirPath = dirPath;
  wrap.dataset.parentPath = callbacks.parentPath || '.';
  wrap.dataset.isFolder = callbacks.isFolder ? 'true' : 'false';

  const item = document.createElement('div');
  item.className = 'shader-item';
  item.setAttribute('data-dir-path', dirPath);
  item.title = dirPath;
  item.innerHTML = `
    <span class="shader-file-icon">📄</span>
    <span class="shader-name">${name}</span>
  `;
  wrap.appendChild(item);

  item.addEventListener('click', () => setActiveShader(dirPath));
  if (callbacks.closeDrawer) {
    item.addEventListener('click', callbacks.closeDrawer);
  }

  const lockBtn = document.createElement('button');
  lockBtn.className = 'shader-lock-btn';
  lockBtn.title = isLocked(dirPath) ? '解锁' : '锁定';
  lockBtn.innerHTML = isLocked(dirPath)
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  if (isLocked(dirPath)) lockBtn.classList.add('locked');

  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const locked = toggleLock(dirPath);
    lockBtn.classList.toggle('locked', locked);
    lockBtn.title = locked ? '解锁' : '锁定';
    lockBtn.innerHTML = locked
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    item.dispatchEvent(new Event('lock-toggled', { bubbles: true }));

  });
  wrap.appendChild(lockBtn);

  const renameFn = callbacks.showRenameModal || showRenameModal;
  const renameBtn = document.createElement('button');
  renameBtn.className = 'shader-rename-btn';
  renameBtn.title = '重命名';
  renameBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renameFn(dirPath, name);
  });
  wrap.appendChild(renameBtn);

  const deleteFn = callbacks.isCollection
    ? (callbacks.showDeleteCollectionModal || showDeleteCollectionModal)
    : (callbacks.showDeleteModal || showDeleteModal);
  const toastFn = callbacks.showToast || showToast;

  const trashBtn = document.createElement('button');
  trashBtn.className = 'shader-delete-btn';
  trashBtn.title = '删除';
  trashBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
  trashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isLocked(dirPath)) {
      toastFn('已锁定，请先解锁后再删除');
      return;
    }
    deleteFn(dirPath, name);
  });
  wrap.appendChild(trashBtn);

  return wrap;
}

function createCollectionFolderElement(dirPath, name, parentDirPath = '.') {
  const wrap = document.createElement('div');
  wrap.className = 'shader-item-wrap';
  wrap.dataset.dirPath = dirPath;
  wrap.dataset.parentPath = parentDirPath;
  wrap.dataset.isFolder = 'true';

  const item = document.createElement('div');
  item.className = 'shader-item';
  item.setAttribute('data-dir-path', dirPath);
  item.title = dirPath;
  wrap.appendChild(item);

  const toggle = document.createElement('span');
  toggle.className = 'folder-toggle';
  toggle.textContent = '\u25B6';
  item.appendChild(toggle);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'shader-name';
  nameSpan.textContent = name;
  item.appendChild(nameSpan);

  const addBtn = document.createElement('button');
  addBtn.className = 'shader-add-btn';
  addBtn.title = '新建子项目';
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showCollectionItemModal(dirPath, name);
  });
  wrap.appendChild(addBtn);

  const renameBtn = document.createElement('button');
  renameBtn.className = 'shader-rename-btn';
  renameBtn.title = '重命名';
  renameBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showRenameModal(dirPath, name);
  });
  wrap.appendChild(renameBtn);

  const trashBtn = document.createElement('button');
  trashBtn.className = 'shader-delete-btn';
  trashBtn.title = '删除';
  trashBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
  trashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeleteCollectionModal(dirPath, name);
  });
  wrap.appendChild(trashBtn);

  return { wrap, toggle, item };
}

export function renderTree(nodes, parentEl, level, parentDirPath = '.') {
  for (const node of nodes) {
    if (!node.hasShader && !node.isCollection) continue;

    const ctxPath = node.dirPath || parentDirPath;

    if (node.hasShader && !node.isCollection && (!node.children || node.children.length === 0)) {
      const li = document.createElement('li');
      li.style.listStyle = 'none';
      li.setAttribute('draggable', 'true');
      li.draggable = true;
      const wrap = createShaderItemElement(node.dirPath, node.name, {
        parentPath: parentDirPath,
      });
      li.appendChild(wrap);
      parentEl.appendChild(li);
      continue;
    }

    const li = document.createElement('li');
    li.style.listStyle = 'none';
    li.setAttribute('draggable', 'true');
    li.draggable = true;

    const { wrap: folderWrap, toggle } = createCollectionFolderElement(node.dirPath || '', node.name, parentDirPath);
    li.appendChild(folderWrap);

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'folder-children';
    childrenUl.style.display = node.expanded ? '' : 'none';

    if (node.hasShader) {
      const defaultLi = document.createElement('li');
      defaultLi.style.listStyle = 'none';
      defaultLi.setAttribute('draggable', 'false');
      defaultLi.draggable = false;
      const wrap = createShaderItemElement(node.dirPath, '#default', {
        parentPath: ctxPath,
      });
      defaultLi.appendChild(wrap);
      childrenUl.appendChild(defaultLi);
    }

    if (node.children && node.children.length > 0) {
      renderTree(node.children, childrenUl, level + 1, ctxPath);
    }

    parentEl.appendChild(li);
    parentEl.appendChild(childrenUl);

    if (toggle) {
      folderWrap.querySelector('.shader-item').addEventListener('click', () => {
        const hidden = childrenUl.style.display === 'none';
        childrenUl.style.display = hidden ? '' : 'none';
        toggle.textContent = hidden ? '\u25BC' : '\u25B6';
        syncTreeExpand(node.dirPath, hidden);
      });
    }
  }
}

export function activateFirstShader() {
  const lastShader = localStorage.getItem('shader3d-last-shader');
  if (lastShader) {
    setActiveShader(lastShader);
    return;
  }
  function findFirst(nodes) {
    for (const n of nodes) {
      if (n.hasShader) return n.dirPath;
      if (n.children && n.children.length > 0) {
        const found = findFirst(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  const first = findFirst(getTree().children);
  if (first) setActiveShader(first);
}
