/**
 * Core application logic: rock generation, variation, randomization, and viewport actions.
 *
 * All functions that need to be called from HTML `onclick` handlers are assigned
 * to `window` at the bottom of this file.
 *
 * @module app
 */
import * as THREE from 'three';
import { state } from './state.js';
import { collectParams, getVal } from './utils.js';
import { rockPresets } from './presets.js';
import { generateRockGeometry } from './geometry/rock-generator.js';
import { generateTextures } from './textures.js';
import { createTriplanarMaterial } from './materials.js';
import { decimateGeometry } from './geometry/decimation.js';
import {
  getEffectDefaults, getEffectDriftIds, injectEffectUI, getEffects,
} from './geometry/post-process-registry.js';

/* ──────────────────────────────────────────────────────────────────────
 * Constants
 * ──────────────────────────────────────────────────────────────────── */

/** Default parameter values used by resetToDefaults(). */
const DEFAULTS = Object.freeze({
  baseShape: 'sphere', shapePreset: 'none',
  baseSize: 1, widthScale: 1, heightScale: 1, depthScale: 1,
  detail: 2, flatness: 0,
  domainWarp: 0, warpScale: 1.2, warpOctaves: 2,
  taperTop: 0, taperBottom: 0, twist: 0,
  skewX: 0, skewZ: 0, concavity: 0, concavityDir: 0, bulge: 0,
  macroStrength: 0, macroScale: 0.8, macroOctaves: 2, macroRidge: 0,
  mesoStrength: 0, mesoScale: 3, mesoOctaves: 3, mesoSubdivs: 1, sharpness: 0,
  microStrength: 0, microScale: 8, microOctaves: 4, microSubdivs: 1, erosion: 0,
  crackAlgo: 'ridge', crackDepth: 0, crackWidth: 0.12, crackDensity: 3, crackSubdivs: 1,
  pitting: 0, pitSize: 8,
  bumpIntensity: 0.8,
  normalStrength: 1.0, microNormalScale: 12, microNormalStrength: 0.4,
  textureScale: 3, colorVariation: 0.3, textureDetail: 3,
  metalness: 0.05, roughnessMap: 0.85,
  strataStrength: 0, mineralDensity: 0, weathering: 0,
  grainScale: 6, grainStrength: 0.3, roughnessVariation: 0.15,
  sssStrength: 0,
  seed: 42,
  decimation: 0.5,
  // Effect defaults are merged dynamically from the registry
  ...getEffectDefaults(),
});

/** Sliders affected by variation drift. */
const DRIFT_SLIDERS = [
  'macroStrength', 'macroScale', 'macroRidge',
  'mesoStrength', 'mesoScale', 'sharpness',
  'microStrength', 'microScale',
  'crackDepth', 'crackWidth', 'crackDensity', 'pitting', 'pitSize',
  'flatness', 'widthScale', 'heightScale', 'depthScale',
  'domainWarp', 'warpScale', 'taperTop', 'taperBottom',
  'twist', 'skewX', 'skewZ', 'concavity', 'bulge',
  // Effect drift IDs are merged dynamically from the registry
  ...getEffectDriftIds(),
];

/* ──────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

/** Sync every slider's numeric display element to its current value. */
function syncAllSliderDisplays() {
  document.querySelectorAll('.param-slider').forEach(sl => {
    const valEl = document.getElementById(sl.id + '-val');
    if (!valEl) return;
    const step = sl.step || '1';
    const decimals = step.includes('.') ? (step.split('.')[1] || '').length || 2 : 0;
    valEl.textContent = parseFloat(sl.value).toFixed(decimals);
  });
}

/**
 * Update the viewport info bar with vertex/triangle counts.
 * @param {THREE.BufferGeometry} geometry
 */
function updateViewportInfo(geometry) {
  const info = document.getElementById('viewport-info');
  if (!info) return;
  const vertCount = geometry.attributes.position.count;
  const triCount = geometry.index ? geometry.index.count / 3 : vertCount / 3;
  info.textContent = `${vertCount} verts · ${triCount} tris | LMB: Rotate | RMB: Pan | Scroll: Zoom`;
}

/** @returns {number} Random float in [min, max). */
function rand(min, max) { return min + Math.random() * (max - min); }

/** @returns {number} Random integer in [min, max]. */
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

/* ──────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────── */

/** Generate a new rock from the current UI parameters. */
export function generateRock() {
  const params = collectParams();

  // Dispose previous rock
  if (state.rockMesh) {
    state.rockMesh.geometry.dispose();
    state.rockMesh.material.dispose();
    state.scene.remove(state.rockMesh);
  }

  const geometry = generateRockGeometry(params);
  const { diffuseTexture, normalTexture, roughnessTexture } = generateTextures(params);
  const material = createTriplanarMaterial(
    diffuseTexture, normalTexture, roughnessTexture, params, state.wireframeMode,
  );

  state.rockMesh = new THREE.Mesh(geometry, material);
  state.rockMesh.castShadow = true;
  state.rockMesh.receiveShadow = true;
  state.scene.add(state.rockMesh);

  updateViewportInfo(geometry);
}

/** Generate a variation: new seed + optional parameter drift. */
export function generateVariation() {
  const drift = getVal('variationDrift');
  const newSeed = randInt(0, 9999);
  document.getElementById('seed').value = newSeed;
  document.getElementById('seed-val').textContent = newSeed;

  if (drift > 0) {
    DRIFT_SLIDERS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const range = max - min;
      const cur = parseFloat(el.value);
      const delta = (Math.random() - 0.5) * 2 * drift * range;
      el.value = Math.max(min, Math.min(max, cur + delta));
      const valEl = document.getElementById(id + '-val');
      if (valEl) {
        const step = el.step;
        const decimals = step.includes('.') ? (step.split('.')[1] || '').length : 0;
        valEl.textContent = parseFloat(el.value).toFixed(decimals);
      }
    });
  }

  generateRock();
}

/** Reset all parameters to sensible defaults, then regenerate. */
export function resetToDefaults() {
  for (const [id, val] of Object.entries(DEFAULTS)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // Reset rock type colours
  document.getElementById('rockType').value = 'granite';
  const preset = rockPresets.granite;
  document.getElementById('colorPrimary').value = preset.primary;
  document.getElementById('colorSecondary').value = preset.secondary;
  document.getElementById('colorTertiary').value = '#4a4a3e';

  syncAllSliderDisplays();
  generateRock();
}

/** Randomize every parameter, then regenerate. */
export function randomizeAll() {
  const shapes = ['sphere', 'box', 'cylinder', 'cone', 'torus'];
  document.getElementById('baseShape').value = shapes[randInt(0, shapes.length - 1)];
  document.getElementById('shapePreset').value = 'none';
  document.getElementById('baseSize').value = rand(0.5, 2).toFixed(2);
  document.getElementById('widthScale').value = rand(0.3, 2.5).toFixed(2);
  document.getElementById('heightScale').value = rand(0.3, 2.5).toFixed(2);
  document.getElementById('depthScale').value = rand(0.3, 2.5).toFixed(2);
  document.getElementById('detail').value = randInt(1, 3);
  document.getElementById('flatness').value = rand(0, 0.7).toFixed(2);
  document.getElementById('domainWarp').value = rand(0, 0.8).toFixed(2);
  document.getElementById('warpScale').value = rand(0.5, 3).toFixed(1);
  document.getElementById('warpOctaves').value = randInt(1, 3);
  document.getElementById('taperTop').value = rand(0, 0.6).toFixed(2);
  document.getElementById('taperBottom').value = rand(0, 0.6).toFixed(2);
  document.getElementById('twist').value = rand(0, 1.5).toFixed(1);
  document.getElementById('skewX').value = rand(-0.5, 0.5).toFixed(2);
  document.getElementById('skewZ').value = rand(-0.5, 0.5).toFixed(2);
  document.getElementById('concavity').value = rand(0, 0.5).toFixed(2);
  document.getElementById('concavityDir').value = randInt(0, 5);
  document.getElementById('bulge').value = rand(-0.5, 0.5).toFixed(2);
  document.getElementById('macroStrength').value = rand(0.15, 0.7).toFixed(2);
  document.getElementById('macroScale').value = rand(0.4, 2).toFixed(1);
  document.getElementById('macroOctaves').value = randInt(1, 3);
  document.getElementById('macroRidge').value = rand(0, 0.7).toFixed(2);
  document.getElementById('mesoStrength').value = rand(0.05, 0.4).toFixed(2);
  document.getElementById('mesoScale').value = rand(2, 6).toFixed(2);
  document.getElementById('mesoOctaves').value = randInt(2, 4);
  document.getElementById('mesoSubdivs').value = randInt(0, 2);
  document.getElementById('sharpness').value = rand(0, 0.6).toFixed(2);
  document.getElementById('microStrength').value = rand(0.01, 0.15).toFixed(3);
  document.getElementById('microScale').value = rand(5, 15).toFixed(1);
  document.getElementById('microOctaves').value = randInt(2, 5);
  document.getElementById('microSubdivs').value = randInt(0, 2);
  document.getElementById('erosion').value = rand(0, 0.5).toFixed(2);
  const algos = ['ridge', 'voronoi', 'warp', 'branch', 'shatter', 'planar', 'horizontal', 'vertical', 'path'];
  document.getElementById('crackAlgo').value = algos[randInt(0, algos.length - 1)];
  document.getElementById('crackDepth').value = rand(0, 0.3).toFixed(2);
  document.getElementById('crackWidth').value = rand(0.03, 0.25).toFixed(2);
  document.getElementById('crackDensity').value = rand(1, 6).toFixed(1);
  document.getElementById('crackSubdivs').value = randInt(0, 2);
  document.getElementById('pitting').value = rand(0, 0.5).toFixed(2);
  document.getElementById('pitSize').value = rand(4, 15).toFixed(1);
  document.getElementById('bumpIntensity').value = rand(0.3, 1.5).toFixed(2);
  document.getElementById('textureScale').value = rand(1, 6).toFixed(2);
  document.getElementById('colorVariation').value = rand(0.1, 0.7).toFixed(2);
  document.getElementById('textureDetail').value = randInt(2, 5);
  document.getElementById('metalness').value = rand(0, 0.2).toFixed(2);
  document.getElementById('roughnessMap').value = rand(0.5, 1).toFixed(2);
  document.getElementById('seed').value = randInt(0, 9999);
  document.getElementById('sssStrength').value = rand(0, 0.3).toFixed(2);

  // Randomize all registered effect sliders within their ranges
  for (const effect of getEffects()) {
    for (const ctrl of effect.controls || []) {
      const el = document.getElementById(ctrl.id);
      if (!el) continue;
      if (ctrl.type === 'slider') {
        const stepStr = String(ctrl.step);
        const decimals = stepStr.includes('.') ? (stepStr.split('.')[1] || '').length : 0;
        el.value = rand(ctrl.min, ctrl.max).toFixed(decimals);
      }
    }
  }

  // Random rock type + matching colours
  const types = Object.keys(rockPresets);
  const type = types[randInt(0, types.length - 1)];
  document.getElementById('rockType').value = type;
  const preset = rockPresets[type];
  document.getElementById('colorPrimary').value = preset.primary;
  document.getElementById('colorSecondary').value = preset.secondary;

  syncAllSliderDisplays();
  generateRock();
}

/** Apply mesh decimation to the current rock in-place. */
export function applyDecimation() {
  if (!state.rockMesh) return;
  const ratio = parseFloat(document.getElementById('decimation').value);
  if (ratio <= 0) return;
  const oldGeo = state.rockMesh.geometry;
  const newGeo = decimateGeometry(oldGeo, ratio);
  oldGeo.dispose();
  state.rockMesh.geometry = newGeo;
  updateViewportInfo(newGeo);
}

/** Toggle wireframe rendering on/off. */
export function toggleWireframe() {
  state.wireframeMode = !state.wireframeMode;
  if (state.rockMesh) state.rockMesh.material.wireframe = state.wireframeMode;
}

/** Download a screenshot of the current viewport as PNG. */
export function screenshotRock() {
  state.renderer.render(state.scene, state.camera);
  const link = document.createElement('a');
  link.download = 'rock-screenshot.png';
  link.href = state.renderer.domElement.toDataURL('image/png');
  link.click();
}

/** Reset the camera to its default position. */
export function resetCamera() {
  state.camera.position.set(3, 2, 3);
  state.controls.target.set(0, 0, 0);
  state.controls.update();
}

/** Toggle a sidebar section's collapsed state. */
export function toggleSection(el) {
  el.classList.toggle('collapsed');
  el.nextElementSibling.classList.toggle('collapsed');
}

/* ──────────────────────────────────────────────────────────────────────
 * Window bindings — required for inline HTML onclick attributes
 * ──────────────────────────────────────────────────────────────────── */

window.generateRock      = generateRock;
window.generateVariation = generateVariation;
window.resetToDefaults   = resetToDefaults;
window.randomizeAll      = randomizeAll;
window.applyDecimation   = applyDecimation;
window.toggleWireframe   = toggleWireframe;
window.screenshotRock    = screenshotRock;
window.resetCamera       = resetCamera;
window.toggleSection     = toggleSection;
