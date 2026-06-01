let treeData = [];

function buildNodeMap(root) {
  const map = {};
  function walk(n) {
    if (n.dirPath) map[n.dirPath] = n;
    if (n.children) n.children.forEach(walk);
  }
  walk(root);
  return map;
}

let nodeMap = {};

export function buildShaderTree(dbTree) {
  function convert(node) {
    if (node.type === 'root') {
      return {
        name: 'root',
        dirPath: '',
        isCollection: true,
        expanded: true,
        children: (node.children || []).map(convert),
      };
    }
    if (node.type === 'collection') {
      return {
        name: node.name || node.path?.split('/').pop() || '',
        dirPath: node.path,
        isCollection: true,
        expanded: node.expanded !== false,
        children: (node.children || []).map(convert),
      };
    }
    const isShader = node.type === 'shader';
    return {
      name: node.name || node.path?.split('/').pop() || '',
      dirPath: node.path,
      hasShader: isShader,
      isCollection: false,
      locked: node.locked || false,
      cameraEnabled: node.cameraEnabled !== false,
      children: (node.children || []).map(convert),
    };
  }
  treeData = convert(dbTree);
  nodeMap = buildNodeMap(treeData);
  return treeData;
}

export function getTree() {
  return treeData;
}

export function getNode(dirPath) {
  return nodeMap[dirPath];
}

export function isLocked(dirPath) {
  return localStorage.getItem(`shader3d-lock-${dirPath}`) === '1';
}

export function setLocked(dirPath, locked) {
  if (locked) {
    localStorage.setItem(`shader3d-lock-${dirPath}`, '1');
  } else {
    localStorage.removeItem(`shader3d-lock-${dirPath}`);
  }
  fetch('/api/tree/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath, locked }),
  }).catch(() => {});
}

export function toggleLock(dirPath) {
  const next = !isLocked(dirPath);
  setLocked(dirPath, next);
  return next;
}

export function isCameraEnabled(dirPath) {
  return localStorage.getItem(`shader3d-camera-${dirPath}`) !== '0';
}

export function setCameraEnabled(dirPath, enabled) {
  if (enabled) {
    localStorage.removeItem(`shader3d-camera-${dirPath}`);
  } else {
    localStorage.setItem(`shader3d-camera-${dirPath}`, '0');
  }
  fetch('/api/tree/camera', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath, cameraEnabled: enabled }),
  }).catch(() => {});
}

export function toggleCameraEnabled(dirPath) {
  const next = !isCameraEnabled(dirPath);
  setCameraEnabled(dirPath, next);
  return next;
}

export function syncLastShaderToServer() {
  fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lastShader: localStorage.getItem('shader3d-last-shader') }),
  }).catch(() => {});
}

export function syncTreeExpand(dirPath, expanded) {
  fetch('/api/tree/expand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath, expanded }),
  }).catch(() => {});
}

export function syncTreeReorder(parentPath, orderedPaths) {
  fetch('/api/tree/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentPath, children: orderedPaths }),
  }).catch(() => {});
}

export async function loadFromServer() {
  const res = await fetch('/api/db');
  const data = await res.json();

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key.startsWith('shader3d-lock-') || key.startsWith('shader3d-camera-')) {
      localStorage.removeItem(key);
    }
  }
  function syncLocks(node) {
    if (node.locked) {
      localStorage.setItem(`shader3d-lock-${node.path}`, '1');
    }
    if (node.cameraEnabled === false) {
      localStorage.setItem(`shader3d-camera-${node.path}`, '0');
    }
    if (node.children) node.children.forEach(syncLocks);
  }
  syncLocks(data.tree);

  return data;
}
