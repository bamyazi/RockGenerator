/**
 * UI wiring: slider sync, live preview, presets, and lighting controls.
 *
 * @module ui
 */
import * as THREE from 'three';
import { state } from './state.js';
import { rockPresets, shapePresets } from './presets.js';
import { generateRock } from './app.js';
import { toggleHDRI } from './scene.js';
import { injectEffectUI } from './geometry/post-process-registry.js';

/* ──────────────────────────────────────────────────────────────────────
 * Debounced live regeneration
 * ──────────────────────────────────────────────────────────────────── */

let _regenTimer = null;

/**
 * Schedule a rock regeneration if live preview is enabled.
 * @param {number} [delay=120] - Debounce delay in milliseconds.
 */
function liveRegenerate(delay = 120) {
  if (!document.getElementById('liveUpdate').checked) return;
  clearTimeout(_regenTimer);
  _regenTimer = setTimeout(() => generateRock(), delay);
}

/* ──────────────────────────────────────────────────────────────────────
 * Shape preset helper
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Apply a named shape preset to the sidebar controls.
 * @param {string} name - Key into `shapePresets`.
 */
function applyShapePreset(name) {
  const p = shapePresets[name];
  if (!p) return;

  const setSlider = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    const valEl = document.getElementById(id + '-val');
    if (valEl) {
      const step = el.step || '1';
      const decimals = step.includes('.') ? (step.split('.')[1] || '').length : 0;
      valEl.textContent = parseFloat(val).toFixed(decimals);
    }
  };

  if (p.baseShape) document.getElementById('baseShape').value = p.baseShape;
  setSlider('widthScale', p.widthScale);
  setSlider('heightScale', p.heightScale);
  setSlider('depthScale', p.depthScale);
  setSlider('domainWarp', p.domainWarp);
  setSlider('warpScale', p.warpScale);
  if (p.warpOctaves !== undefined) setSlider('warpOctaves', p.warpOctaves);
  setSlider('taperTop', p.taperTop);
  setSlider('taperBottom', p.taperBottom);
  setSlider('twist', p.twist);
  setSlider('skewX', p.skewX);
  setSlider('skewZ', p.skewZ);
  setSlider('concavity', p.concavity);
  if (p.concavityDir !== undefined) setSlider('concavityDir', p.concavityDir);
  setSlider('bulge', p.bulge);
  if (p.macroStrength !== undefined) setSlider('macroStrength', p.macroStrength);
  if (p.macroScale !== undefined) setSlider('macroScale', p.macroScale);
  if (p.macroRidge !== undefined) setSlider('macroRidge', p.macroRidge);
  if (p.mesoStrength !== undefined) setSlider('mesoStrength', p.mesoStrength);
  if (p.mesoScale !== undefined) setSlider('mesoScale', p.mesoScale);
  if (p.sharpness !== undefined) setSlider('sharpness', p.sharpness);
  if (p.flatness !== undefined) setSlider('flatness', p.flatness);
}

/* ──────────────────────────────────────────────────────────────────────
 * Setup — call once after the scene is initialised
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Wire up all UI controls: sliders, colour pickers, selects, checkboxes,
 * and lighting knobs. Should be called once during application boot.
 */
export function setupUI() {
  // ── Inject dynamically-registered effect controls into the sidebar ──
  injectEffectUI('effects-container');

  // ── Rock type → colour preset ──
  document.getElementById('rockType').addEventListener('change', (e) => {
    const preset = rockPresets[e.target.value];
    if (!preset) return;
    document.getElementById('colorPrimary').value = preset.primary;
    document.getElementById('colorSecondary').value = preset.secondary;
    document.getElementById('metalness').value = preset.metalness;
    document.getElementById('metalness-val').textContent = preset.metalness.toFixed(2);
    document.getElementById('roughnessMap').value = preset.roughnessMap;
    document.getElementById('roughnessMap-val').textContent = preset.roughnessMap.toFixed(2);
  });

  // ── Shape preset ──
  document.getElementById('shapePreset').addEventListener('change', (e) => {
    if (e.target.value !== 'none') {
      applyShapePreset(e.target.value);
      liveRegenerate(50);
    }
  });

  // ── Sliders: display sync + live regeneration ──
  document.querySelectorAll('.param-slider').forEach(slider => {
    const valEl = document.getElementById(slider.id + '-val');
    if (!valEl) return;
    const isDecimation = slider.id === 'decimation';
    const update = () => {
      const step = slider.step;
      const decimals = step.includes('.') ? (step.split('.')[1] || '').length : 0;
      valEl.textContent = parseFloat(slider.value).toFixed(decimals);
      if (!isDecimation) liveRegenerate();
    };
    slider.addEventListener('input', update);
    update(); // initialise display value
  });

  // ── Colour pickers (static + any injected by effects) ──
  document.querySelectorAll('input[type="color"]').forEach(picker => {
    picker.addEventListener('input', () => liveRegenerate());
  });

  // ── Selects (non-preset) ──
  ['rockType', 'baseShape', 'shapePreset', 'crackAlgo'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => liveRegenerate(50));
  });

  // ── Lighting controls ──
  document.getElementById('keyLight').addEventListener('input', (e) => {
    state.scene.getObjectByName('keyLight').intensity = parseFloat(e.target.value);
  });
  document.getElementById('fillLight').addEventListener('input', (e) => {
    state.scene.getObjectByName('fillLight').intensity = parseFloat(e.target.value);
  });
  document.getElementById('ambientLight').addEventListener('input', (e) => {
    state.scene.getObjectByName('ambientLight').intensity = parseFloat(e.target.value);
  });
  document.getElementById('lightColor').addEventListener('input', (e) => {
    state.scene.getObjectByName('keyLight').color = new THREE.Color(e.target.value);
  });
  document.getElementById('bgColor').addEventListener('input', (e) => {
    state.scene.background = new THREE.Color(e.target.value);
  });

  // ── Scene toggles ──
  document.getElementById('showGrid').addEventListener('change', (e) => {
    state.gridHelper.visible = e.target.checked;
    state.scene.getObjectByName('ground').visible = e.target.checked;
  });
  document.getElementById('autoRotate').addEventListener('change', (e) => {
    state.controls.autoRotate = e.target.checked;
    state.controls.autoRotateSpeed = 2;
  });
  document.getElementById('useHDRI').addEventListener('change', (e) => {
    toggleHDRI(e.target.checked);
  });
}
