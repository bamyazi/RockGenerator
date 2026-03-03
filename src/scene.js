/**
 * Three.js scene initialization: camera, lights, grid, ground, HDRI environment.
 *
 * @module scene
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';

/**
 * Initialize the Three.js scene, camera, renderer, lights, and controls.
 * Appends the renderer canvas to `#viewport`.
 */
export function initScene() {
  const viewport = document.getElementById('viewport');

  // Scene
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x111111);

  // Camera
  state.camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
  state.camera.position.set(3, 2, 3);

  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  state.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.2;
  viewport.appendChild(state.renderer.domElement);

  // Controls
  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.minDistance = 1;
  state.controls.maxDistance = 20;
  state.controls.target.set(0, 0, 0);

  // Lights
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -5;
  keyLight.name = 'keyLight';
  state.scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8899bb, 0.5);
  fillLight.position.set(-3, 4, -3);
  fillLight.name = 'fillLight';
  state.scene.add(fillLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  ambientLight.name = 'ambientLight';
  state.scene.add(ambientLight);

  // Ground grid
  state.gridHelper = new THREE.GridHelper(10, 20, 0x333344, 0x222233);
  state.gridHelper.position.y = -1.5;
  state.scene.add(state.gridHelper);

  // Ground plane for shadows
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  ground.name = 'ground';
  state.scene.add(ground);

  // Procedural HDRI
  setupHDRI();

  // Resize handler
  window.addEventListener('resize', () => {
    state.camera.aspect = viewport.clientWidth / viewport.clientHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  });
}

/**
 * Create a procedural equirectangular HDRI environment map.
 */
export function setupHDRI() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size * 4;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(0.3, '#3a4a6e');
  grad.addColorStop(0.48, '#8a7a6a');
  grad.addColorStop(0.5, '#5a5040');
  grad.addColorStop(0.52, '#3a3530');
  grad.addColorStop(1, '#1a1815');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 10;
    d[i]   = Math.max(0, Math.min(255, d[i] + noise));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + noise));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const envTex = new THREE.CanvasTexture(canvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;

  const pmremGenerator = new THREE.PMREMGenerator(state.renderer);
  pmremGenerator.compileEquirectangularShader();
  state.envMapTexture = pmremGenerator.fromEquirectangular(envTex).texture;
  pmremGenerator.dispose();
  envTex.dispose();

  const useHDRI = document.getElementById('useHDRI');
  if (useHDRI && useHDRI.checked) {
    state.scene.environment = state.envMapTexture;
  }
}

/**
 * Toggle HDRI environment map on/off.
 * @param {boolean} checked
 */
export function toggleHDRI(checked) {
  if (checked && state.envMapTexture) {
    state.scene.environment = state.envMapTexture;
  } else {
    state.scene.environment = null;
  }
}

/**
 * Start the render loop.
 */
export function startAnimationLoop() {
  function animate() {
    requestAnimationFrame(animate);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
  }
  animate();
}
