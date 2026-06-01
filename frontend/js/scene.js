import * as THREE from 'three';

const scene = new THREE.Scene();

const defaultCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
defaultCamera.position.z = 1;

let _camera = defaultCamera;

function getCamera() {
  return _camera;
}

function setCamera(cam) {
  _camera = cam;
}

function resetCamera() {
  _camera = defaultCamera;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const container = document.getElementById('canvas-container');
container.appendChild(renderer.domElement);

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

let activeModels = [];
let _primaryMaterial = null;

function clearModels() {
  for (const model of activeModels) {
    model.traverse((child) => {
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child.geometry) {
        child.geometry.dispose();
      }
    });
    scene.remove(model);
  }
  activeModels = [];
}

function addModels(models) {
  if (!models || !Array.isArray(models)) return;
  for (const model of models) {
    scene.add(model);
    activeModels.push(model);
  }
}

function getAllMaterials() {
  const materials = [];
  for (const model of activeModels) {
    model.traverse((child) => {
      if (child.material) {
        if (Array.isArray(child.material)) {
          materials.push(...child.material);
        } else {
          materials.push(child.material);
        }
      }
    });
  }
  return materials;
}

function getMaterial() {
  return _primaryMaterial;
}

function setMaterial(m) {
  _primaryMaterial = m;
}

export {
  scene,
  defaultCamera,
  getCamera,
  setCamera,
  resetCamera,
  renderer,
  defaultVertex,
  defaultFragment,
  clearModels,
  addModels,
  getAllMaterials,
  getMaterial,
  setMaterial,
};
