import { syncLastShaderToServer, loadFromServer, buildShaderTree, clearLastShaderOnServer } from './shaderTree.js';
import { renderTree, setActiveShader, activateFirstShader } from './shaderItem.js';

let wsPauseUntil = 0;
export function pauseWsAutoReload(ms = 2000) {
  wsPauseUntil = Date.now() + ms;
}
export function isWsAutoReloadPaused() {
  return Date.now() < wsPauseUntil;
}

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

async function refreshTree(activatePath) {
  const shaderList = document.getElementById('shader-list');
  shaderList.innerHTML = '';
  const data = await loadFromServer();
  const treeData = buildShaderTree(data.tree);
  renderTree(treeData.children, shaderList, 0);
  if (activatePath) {
    setActiveShader(activatePath);
  }
}

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

  closeModal();
  refreshTree(null);
}

async function handleCreateShaderComplete(name, parentPath) {
  const result = await handleCreateShader(name, parentPath);
  if (!result) return;

  closeModal();
  localStorage.setItem('shader3d-last-shader', result.dirPath);
  await syncLastShaderToServer();
  refreshTree(result.dirPath);
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
    const lastShader = localStorage.getItem('shader3d-last-shader');
    if (lastShader) {
      setActiveShader(lastShader);
    }
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

      const lastShader = localStorage.getItem('shader3d-last-shader');
      const isActiveAffected = lastShader === pendingDeleteDir
        || (lastShader && pendingDeleteIsCollection
          && (lastShader.startsWith(pendingDeleteDir + '/') || lastShader.startsWith(pendingDeleteDir + '\\')));

      if (isActiveAffected) {
        localStorage.removeItem('shader3d-last-shader');
        await clearLastShaderOnServer();
      }

      await refreshTree(isActiveAffected ? null : lastShader);

      if (isActiveAffected) {
        activateFirstShader();
      }
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

      // 暂停 WebSocket 自动重载
      pauseWsAutoReload(2000);

      // 服务端重命名时已经更新了 db.lastShader，直接以服务器返回的为准
      const normNewPath = data.newPath.replace(/\\/g, '/');
      const normLastShader = data.lastShader ? data.lastShader.replace(/\\/g, '/') : null;

      // 如果重命名的是当前激活的着色器，更新本地记录到新路径
      if (normLastShader === normNewPath) {
        localStorage.setItem('shader3d-last-shader', normNewPath);
      } else if (normLastShader && normLastShader.startsWith(normNewPath + '/')) {
        localStorage.setItem('shader3d-last-shader', normLastShader);
      }

      // 刷新 UI 树
      try {
        await refreshTree(null);
      } catch (err) {
        console.error('refreshTree 失败:', err);
      }

      // 激活正确的着色器
      const activeShader = localStorage.getItem('shader3d-last-shader');
      if (activeShader) {
        setActiveShader(activeShader);
      }
    } catch (err) {
      renameModalError.textContent = '网络错误';
      renameModalError.classList.remove('hidden');
    }
  });
}
