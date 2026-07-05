import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createObjects(config, shader) {
  return new Promise(function(resolve, reject) {
    if (config.objects && config.objects.monkey) {
      var loader = new GLTFLoader();
      loader.load(config.objects.monkey,
        function(gltf) {
          var material = new THREE.ShaderMaterial({
            vertexShader: shader.vertex,
            fragmentShader: shader.fragment,
            uniforms: config.uniforms,
          });
          gltf.scene.traverse(function(child) {
            if (child.isMesh) child.material = material;
          });
          var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
          camera.position.set(0, 1, 4);
          camera.lookAt(0, 0, 0);
          resolve({ objects: [gltf.scene], camera: camera });
        },
        undefined,
        reject
      );
    } else {
      var geometry = new THREE.PlaneGeometry(2, 2);
      var material = new THREE.ShaderMaterial({
        vertexShader: shader.vertex,
        fragmentShader: shader.fragment,
        uniforms: config.uniforms,
      });
      var mesh = new THREE.Mesh(geometry, material);
      var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;
      resolve({ objects: [mesh], camera: camera });
    }
  });
}
