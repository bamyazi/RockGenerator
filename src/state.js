/**
 * Shared application state singleton.
 *
 * Import this object from any module to read or modify global state
 * without introducing circular dependencies.
 *
 * @module state
 */
export const state = {
  /** @type {THREE.Scene} */
  scene: null,
  /** @type {THREE.PerspectiveCamera} */
  camera: null,
  /** @type {THREE.WebGLRenderer} */
  renderer: null,
  /** @type {import('three/addons/controls/OrbitControls.js').OrbitControls} */
  controls: null,
  /** @type {THREE.Mesh|null} Current rock mesh */
  rockMesh: null,
  /** @type {THREE.GridHelper} */
  gridHelper: null,
  /** @type {boolean} */
  wireframeMode: false,
  /** @type {THREE.Texture|null} PMREM environment map */
  envMapTexture: null,
};
