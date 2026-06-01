import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeUniforms, resetUniforms, getParsedConfig } from './globalConfig.js';
import { clearModels, addModels, getAllMaterials, setMaterial, setCamera, resetCamera } from './scene.js';
import { isLocked, toggleLock, syncLastShaderToServer, syncTreeExpand, isCameraEnabled } from './shaderTree.js';
import { loadShaderTextures, rebuildUniformList } from './uniformUI.js';
import { showToast } from './modal.js';

function createDefaultPlaneModel(vertSrc, fragSrc, uniforms) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: fragSrc,
    uniforms,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  return { objects: [mesh], camera };
}

async function createFromSpecVertical(spec, vertSrc, fragSrc, uniforms, dirPath) {
  if (spec.type === 'glb' && spec.asset) {
    try {
      const loader = new GLTFLoader();
      const assetUrl = `/api/shader/asset?path=${encodeURIComponent(dirPath)}&file=${encodeURIComponent(spec.asset)}`;
      const gltf = await loader.loadAsync(assetUrl);

      const material = new THREE.ShaderMaterial({
        vertexShader: vertSrc,
        fragmentShader: fragSrc,
        uniforms,
      });

      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.material = material;
        }
      });

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 2, 5);
      camera.lookAt(0, 0, 0);

      return { objects: [gltf.scene], camera };
    } catch (e) {
      showToast(`模型加载失败: ${e.message}`);
    }
  }

  return createDefaultPlaneModel(vertSrc, fragSrc, uniforms);
}

export function setActiveShader(dirPath) {
  localStorage.setItem('shader3d-last-shader', dirPath);
  syncLastShaderToServer();

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

  const encodedPath = encodeURIComponent(dirPath);

  Promise.all([
    fetch(`/api/shader/vertex?path=${encodedPath}`).then(r => r.text()),
    fetch(`/api/shader/fragment?path=${encodedPath}`).then(r => r.text()),
    fetch(`/api/shader/config?path=${encodedPath}`).then(r => r.json()),
  ]).then(async ([vertSrc, fragSrc, config]) => {
    const theUniforms = mergeUniforms(config);

    let result = createDefaultPlaneModel(vertSrc, fragSrc, theUniforms);

    try {
      const spec = await fetch(`/api/shader/object-spec?path=${encodedPath}`).then(r => r.json());
      if (spec) {
        result = await createFromSpecVertical(spec, vertSrc, fragSrc, theUniforms, dirPath);
      }
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
  }).catch(() => {
    const theUniforms = mergeUniforms({});
    const defaultModel = createDefaultPlaneModel(
      `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      `varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}`,
      theUniforms,
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

function buildCrumbClickHandler(dirPath) {
  return () => { setActiveShader(dirPath); };
}

export function renderTree(nodes, parentEl, level) {
  for (const node of nodes) {
    if (!node.hasShader && !node.isCollection) continue;

    const wrap = document.createElement('div');
    wrap.className = 'shader-item-wrap';

    const item = document.createElement('div');
    item.className = 'shader-item';
    item.style.paddingLeft = `${20 + level * 16}px`;
    item.setAttribute('data-dir-path', node.dirPath);
    if (node.hasShader) {
      item.title = node.dirPath;
    }

    if (node.isCollection) {
      item.innerHTML = `
        <span class="expand-arrow">${node.expanded ? '▾' : '▸'}</span>
        <span class="shader-folder-icon">📁</span>
        <span class="shader-name">${node.name}</span>
      `;
    } else {
      item.innerHTML = `
        <span class="shader-file-icon">📄</span>
        <span class="shader-name">${node.name}</span>
      `;
    }

    wrap.appendChild(item);

    if (node.hasShader || node.isCollection) {
      const lockBtn = document.createElement('button');
      lockBtn.className = 'shader-lock-btn';
      lockBtn.title = isLocked(node.dirPath) ? '解锁' : '锁定';
      lockBtn.innerHTML = isLocked(node.dirPath)
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
      if (isLocked(node.dirPath)) lockBtn.classList.add('locked');

      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newLocked = toggleLock(node.dirPath);
        lockBtn.classList.toggle('locked', newLocked);
        lockBtn.title = newLocked ? '解锁' : '锁定';
        lockBtn.innerHTML = newLocked
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
        const nodeEl = lockBtn.parentElement.querySelector('.shader-item');
        if (nodeEl) nodeEl.dispatchEvent(new Event('lock-toggled', { bubbles: true }));
      });

      wrap.appendChild(lockBtn);
    }

    if (node.hasShader) {
      item.addEventListener('click', () => setActiveShader(node.dirPath));
    }

    if (node.isCollection) {
      item.addEventListener('click', () => {
        syncTreeExpand(node.dirPath, !node.expanded);
        renderTree(getTree().children || [], parentEl, 0);
      });
    }

    parentEl.appendChild(wrap);

    if (node.isCollection && node.expanded && node.children.length > 0) {
      renderTree(node.children, parentEl, level + 1);
    }
  }
}

export { renderTree as default };

export function createShaderItemElement(dirPath, name, callbacks = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'shader-item-wrap';

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

  return wrap;
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
