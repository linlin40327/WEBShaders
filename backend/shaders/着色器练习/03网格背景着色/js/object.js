import * as THREE from 'three';
import vertex from '../shader/vertex.glsl?raw';
import fragment from '../shader/fragment.glsl?raw';

export default function createObjects(uniforms) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  return {
    objects: [mesh],
    camera,
  };
}
