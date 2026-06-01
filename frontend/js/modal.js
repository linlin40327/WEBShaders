import * as THREE from 'three';
import { resetUniforms } from './globalConfig.js';
import { defaultVertex, defaultFragment, clearModels, addModels, setMaterial } from './scene.js';
import { syncLastShaderToServer } from './shaderTree.js';
import { createShaderItemElement } from './shaderItem.js';
import { rebuildUniformList } from './uniformUI.js';

const drawer = document.getElementById('drawer');
const drawerToggle = document.getElementById('drawer-toggle');
const overlay = document.getElementById('drawer-overlay');
const addBtn = document.getElementById('add-btn');
const addCollectionBtn = document.getElementById('add-collection-btn');
const resetBtn = document.getElementById('reset-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalInput = document.getElementById('modal-input');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const modalConfirmSub = document.getElementById('modal-confirm-sub');
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

let modalMode = 'shader';
let modalParentPath = null;

export function showToast(msg) {
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

export function openDrawer() {
  drawer.classList.add('open');
  overlay.classList.add('open');
  drawerToggle.classList.add('open');
}

export function closeDrawer() {
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawerToggle.classList.remove('open');
}

function openCreateModal(mode, parentPath) {
  modalMode = mode;
  modalParentPath = parentPath || null;
  modalInput.value = '';
  modalError.classList.add('hidden');
  modalError.textContent = '';
  if (mode === 'collection') {
    if (parentPath) {
      modalTitle.textContent = `在 "${parentPath.replace(/^.*[/\\]/, '')}" 中新建收录`;
    } else {
      modalTitle.textContent = '新建收录';
    }
    modalConfirm.style.display = '';
    modalConfirmSub.style.display = 'none';
  } else {
    if (parentPath) {
      modalTitle.textContent = `在 "${parentPath.replace(/^.*[/\\]/, '')}" 中新建着色器`;
    } else {
      modalTitle.textContent = '新建着色器';
    }
    modalConfirm.style.display = '';
    modalConfirmSub.style.display = 'none';
  }
  modalOverlay.classList.remove('hidden');
  setTimeout(() => modalInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalMode = 'shader';
  modalParentPath = null;
}

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.classList.remove('hidden');
}

let pendingDeleteDir = '';
let pendingDeleteIsCollection = false;

export function showDeleteModal(dirPath, name) {
  pendingDeleteDir = dirPath;
  pendingDeleteIsCollection = false;
  const shortName = dirPath.replace(/^\.\.?\/shaders\//, '');
  deleteModalMsg.textContent = `确定要删除 "${shortName}" 吗？此操作不可恢复。`;
  deleteModalOverlay.classList.remove('hidden');
}

export function showDeleteCollectionModal(dirPath, name) {
  pendingDeleteDir = dirPath;
  pendingDeleteIsCollection = true;
  const shortName = dirPath.replace(/^\.\.?\/shaders\//, '');
  deleteModalMsg.textContent = `正在检查 "${shortName}" ...`;
  deleteModalOverlay.classList.remove('hidden');

  const relPath = dirPath.replace(/^\.\.?\/shaders\//, '');
  fetch(`/api/check-collection-locks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relPath }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.locked) {
        deleteModalMsg.textContent = `无法删除 "${shortName}"：\n"${data.firstLocked}" 已被锁定，请先解锁。`;
        deleteModalConfirm.style.display = 'none';
      } else {
        deleteModalMsg.textContent = `确定要删除收录 "${shortName}" 吗？\n包含的所有着色器也将被删除。`;
        deleteModalConfirm.style.display = '';
      }
    })
    .catch(() => {
      deleteModalMsg.textContent = `确定要删除 "${shortName}" 吗？此操作不可恢复。`;
      deleteModalConfirm.style.display = '';
    });
}

function closeDeleteModal() {
  deleteModalOverlay.classList.add('hidden');
  pendingDeleteDir = '';
  pendingDeleteIsCollection = false;
  deleteModalConfirm.style.display = '';
}

let pendingRenameDir = '';

export function showRenameModal(dirPath, name) {
  pendingRenameDir = dirPath;
  const shortName = dirPath.replace(/^\.\.?\/shaders\//, '');
  renameModalInput.value = shortName.split('/').pop();
  renameModalError.classList.add('hidden');
  renameModalOverlay.classList.remove('hidden');
  setTimeout(() => renameModalInput.focus(), 100);
}

function closeRenameModal() {
  renameModalOverlay.classList.add('hidden');
  pendingRenameDir = '';
}

export function showCollectionItemModal(dirPath, name) {
  openCreateModal('collection', dirPath);
}

async function handleCreateShader(name, parentPath) {
  const body = { name };
  if (parentPath) {
    body.parent = parentPath.replace(/^\.\.?\/shaders\//, '');
  }

  const res = await fetch('/api/create-shader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    showModalError(data.error || '创建失败');
    return null;
  }

  return { dirPath: `../shaders/${data.path}`, name: data.path.split('/').pop() };
}

async function handleCreateCollection(name, parentPath) {
  const body = { name };
  if (parentPath) {
    body.parent = parentPath.replace(/^\.\.?\/shaders\//, '');
  }

  const res = await fetch('/api/create-collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    showModalError(data.error || '创建失败');
    return;
  }

  window.location.reload();
}

async function handleCreateShaderComplete(name, parentPath) {
  const result = await handleCreateShader(name, parentPath);
  if (!result) return;

  closeModal();

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

  const geometry = new THREE.PlaneGeometry(2, 2);
  const defaultMesh = new THREE.Mesh(geometry, newMaterial);
  clearModels();
  addModels([defaultMesh]);
  setMaterial(newMaterial);
  resetUniforms(newMaterial.uniforms);

  const li = document.createElement('li');
  li.style.listStyle = 'none';
  const callbacks = { closeDrawer, showDeleteModal, showRenameModal, showToast, showCollectionItemModal, showDeleteCollectionModal };
  li.appendChild(createShaderItemElement(result.dirPath, result.name, callbacks));
  const shaderList = document.getElementById('shader-list');
  shaderList.appendChild(li);

  document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
  const activeItem = li.querySelector('.shader-item');
  activeItem.classList.add('active');

  localStorage.setItem('shader3d-last-shader', result.dirPath);
  syncLastShaderToServer();

  rebuildUniformList();
}

export function initModals() {
  drawerToggle.addEventListener('click', () => {
    if (drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  overlay.addEventListener('click', closeDrawer);

  if (addCollectionBtn) {
    addCollectionBtn.addEventListener('click', () => openCreateModal('collection', null));
  }

  resetBtn.addEventListener('click', () => {
    localStorage.removeItem('shader3d-last-shader');
    syncLastShaderToServer();
    clearModels();
    setMaterial(null);
    document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));
    rebuildUniformList();
  });

  addBtn.addEventListener('click', () => {
    const lastShader = localStorage.getItem('shader3d-last-shader');
    let parentPath = null;
    if (lastShader) {
      const rel = lastShader.replace(/^\.\.?\/shaders\//, '');
      const parts = rel.split('/');
      if (parts.length > 1) {
        parts.pop();
        parentPath = `../shaders/${parts.join('/')}`;
      }
    }
    openCreateModal('shader', parentPath);
  });
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
      if (modalMode === 'collection') {
        await handleCreateCollection(name, modalParentPath);
      } else {
        await handleCreateShaderComplete(name, modalParentPath);
      }
    } catch (err) {
      showModalError('网络错误，请检查服务是否运行');
    }
  });

  deleteModalCancel.addEventListener('click', closeDeleteModal);
  deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === deleteModalOverlay) closeDeleteModal();
  });
  deleteModalConfirm.addEventListener('click', async () => {
    if (!pendingDeleteDir) return;

    const shortName = pendingDeleteDir.replace(/^\.\.?\/shaders\//, '');

    try {
      const endpoint = pendingDeleteIsCollection ? '/api/delete-collection' : '/api/delete-shader';
      const res = await fetch(endpoint, {
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
      const geometry = new THREE.PlaneGeometry(2, 2);
      const defaultMesh = new THREE.Mesh(geometry, newMaterial);
      clearModels();
      addModels([defaultMesh]);
      setMaterial(newMaterial);
      resetUniforms(newMaterial.uniforms);

      document.querySelectorAll('.shader-list .shader-item').forEach(el => el.classList.remove('active'));

      window.location.reload();
    } catch (err) {
      console.error('网络错误', err);
    }
  });

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
}
