import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import vertex from '../shader/vertex.glsl?raw';
import fragment from '../shader/fragment.glsl?raw';

const modelUrl = new URL('../assets/初始猴头.glb', import.meta.url).href;

export default async function createObjects(uniforms) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelUrl);

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
  });

  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
    }
  });

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1, 4);
  camera.lookAt(0, 0, 0);

  return {
    objects: [gltf.scene],
    camera,
  };
}
