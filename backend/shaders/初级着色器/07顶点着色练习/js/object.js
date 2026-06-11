import * as THREE from 'three';

export function createObjects(config, shader) {
  return new Promise(function (resolve) {
    var geometry = new THREE.IcosahedronGeometry(1, 128);
    var material = new THREE.ShaderMaterial({
      vertexShader: shader.vertex,
      fragmentShader: shader.fragment,
      uniforms: config.uniforms,
    });
    var mesh = new THREE.Mesh(geometry, material);
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.set(2, 0, 5);
    resolve({ objects: [mesh], camera: camera });
  });
}
