import * as THREE from 'three';

export function createObjects(config, shader) {
  return new Promise(function(resolve) {
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
  });
}
