import { uniforms, isPaused, isFinished, getMaxDuration } from './globalConfig.js';
import { scene, getCamera, renderer, getAllMaterials } from './scene.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildShaderTree, loadFromServer, getTree, isCameraEnabled, toggleCameraEnabled } from './shaderTree.js';
import { initPanel, initTimeButtons, updateTimelineUI } from './panel.js';
import { renderTree, activateFirstShader, setActiveShader, reloadConfigOnly, reloadShaderOnly, spinResetBtn } from './shaderItem.js';
import { initDragDrop } from './dnd.js';
import { showToast, initModals, isWsAutoReloadPaused } from './modal.js';
import { connectWs } from './wsClient.js';

const shaderList = document.getElementById('shader-list');
const cameraBtn = document.getElementById('camera-btn');

const controls = new OrbitControls(getCamera(), renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

function getCameraEnabled() {
  const dirPath = localStorage.getItem('shader3d-last-shader');
  return isCameraEnabled(dirPath);
}

function updateCameraBtnUI() {
  const enabled = getCameraEnabled();
  if (enabled) {
    cameraBtn.classList.add('active');
    cameraBtn.title = '摄像头：开';
  } else {
    cameraBtn.classList.remove('active');
    cameraBtn.title = '摄像头：关';
  }
}

cameraBtn.addEventListener('click', () => {
  const dirPath = localStorage.getItem('shader3d-last-shader');
  toggleCameraEnabled(dirPath);
  updateCameraBtnUI();
});

async function init() {
  try {
    const data = await loadFromServer();
    const treeData = buildShaderTree(data.tree);
    renderTree(treeData.children, shaderList, 0);
    activateFirstShader();
  } catch {
    showToast('连接服务端失败，请检查后端是否运行');
  }
}

initPanel();
initTimeButtons();
initDragDrop(showToast);
initModals();

connectWs((fileType) => {
  if (isWsAutoReloadPaused()) return;
  const lastShader = localStorage.getItem('shader3d-last-shader');
  if (!lastShader) return;

  spinResetBtn();

  if (fileType === 'config') {
    reloadConfigOnly(lastShader);
  } else if (fileType === 'shader') {
    reloadShaderOnly(lastShader);
  } else {
    setActiveShader(lastShader);
  }
});

init();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const cam = getCamera();
  if (cam.isPerspectiveCamera) {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
  }
});

function animate() {
  requestAnimationFrame(animate);

  const cam = getCamera();
  controls.object = cam;
  controls.enabled = getCameraEnabled();
  controls.update();

  const elapsed = uniforms.time.value;
  const materials = getAllMaterials();
  for (const mat of materials) {
    if (mat.uniforms && mat.uniforms.time) {
      mat.uniforms.time.value = elapsed;
    }
  }

  const maxDur = getMaxDuration();
  updateTimelineUI(elapsed, maxDur, isPaused(), isFinished());

  renderer.render(scene, cam);
}

animate();
