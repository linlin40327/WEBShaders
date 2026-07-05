import * as THREE from 'three';

export function createObjects(config, shader) {
  return new Promise(function(resolve) {
    var geometry = new THREE.PlaneGeometry(2, 2);
    var material = new THREE.ShaderMaterial({
      vertexShader: shader.vertex,
      fragmentShader: shader.fragment,
      uniforms: config.uniforms,
      side: THREE.DoubleSide,
    });
    var mesh = new THREE.Mesh(geometry, material);
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
    camera.position.z = 1;
    resolve({ objects: [mesh], camera: camera });
  });
}
