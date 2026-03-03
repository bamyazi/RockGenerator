/**
 * Post-process effect registry.
 *
 * Provides a dependency-injection model where each effect:
 *   - Registers itself via `register()`
 *   - Declares its UI controls (sliders, colors, checkboxes)
 *   - Declares what shared resources it needs (adjacency, normals, noise)
 *   - Provides a `shouldRun(params)` check and a `process(geo, params, ctx)` function
 *
 * The registry handles:
 *   - Ordered execution with lazy resource provisioning
 *   - UI injection into the sidebar
 *   - Param collection from dynamically-created controls
 *   - Default values and drift slider IDs for the randomizer
 *
 * ── Adding a new effect ──
 * Create a file in `src/geometry/effects/`, import the registry, and call `register()`.
 * See any existing effect for a template.
 *
 * @module geometry/post-process-registry
 */
import * as THREE from 'three';
import { SimplexNoise } from '../noise.js';
import { buildAdjacency } from './mesh-ops.js';

/* ──────────────────────────────────────────────────────────────────────
 * Registry state
 * ──────────────────────────────────────────────────────────────────── */

/** @type {Array<EffectDefinition>} */
const _effects = [];

/** Track whether UI has been injected. */
let _uiInjected = false;

/* ──────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Register a post-processing effect.
 *
 * @param {EffectDefinition} effect
 *
 * @typedef {Object} EffectDefinition
 * @property {string}   id              - Unique effect identifier.
 * @property {string}   name            - Human-readable name (section title).
 * @property {number}   order           - Execution order (lower = earlier). Use 100-199 for
 *                                        geometry effects, 200+ for colour effects.
 * @property {'geometry'|'color'} phase - Whether the effect modifies geometry or vertex colours.
 * @property {boolean}  needsAdjacency  - If true, the runner provides adjacency data in `ctx.adj`.
 * @property {boolean}  needsNormals    - If true, vertex normals are recomputed before this runs.
 * @property {boolean}  modifiesGeometry - If true, cached adjacency is invalidated after this runs.
 * @property {Array<ControlDef>} controls - UI control definitions.
 * @property {string[]} [driftIds]      - Parameter IDs subject to variation drift.
 * @property {function(Object): boolean} shouldRun  - Return true if the effect is active.
 * @property {function(THREE.BufferGeometry, Object, RunContext): THREE.BufferGeometry|void} process
 *
 * @typedef {Object} ControlDef
 * @property {'slider'|'color'|'select'|'checkbox'} type
 * @property {string}  id       - DOM element id (must be unique).
 * @property {string}  label    - Display label.
 * @property {*}       default  - Default value.
 * @property {number}  [min]    - Slider min.
 * @property {number}  [max]    - Slider max.
 * @property {number|string} [step] - Slider step.
 * @property {Array<{value:string,label:string}>} [options] - Select options.
 *
 * @typedef {Object} RunContext
 * @property {Object|null} adj   - CSR adjacency structure (lazy, may be null if not requested).
 * @property {function(number): SimplexNoise} noise - Get a seeded noise instance by offset.
 */
export function register(effect) {
  _effects.push(effect);
  _effects.sort((a, b) => a.order - b.order);
}

/** @returns {ReadonlyArray<EffectDefinition>} All registered effects, sorted by order. */
export function getEffects() {
  return _effects;
}

/* ──────────────────────────────────────────────────────────────────────
 * UI injection
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Build and inject sidebar sections for every registered effect into
 * the given container element.
 *
 * @param {string} containerId - ID of the DOM element to populate.
 */
export function injectEffectUI(containerId) {
  const container = document.getElementById(containerId);
  if (!container || _uiInjected) return;
  _uiInjected = true;

  for (const effect of _effects) {
    if (!effect.controls || effect.controls.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'section';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.innerHTML = `<span class="arrow">&#9660;</span> ${effect.name}`;
    title.addEventListener('click', () => {
      title.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
    });

    const body = document.createElement('div');
    body.className = 'section-body';

    for (const ctrl of effect.controls) {
      body.appendChild(_buildControl(ctrl));
    }

    section.appendChild(title);
    section.appendChild(body);
    container.appendChild(section);
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Param helpers
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Collect current values from all effect UI controls.
 * Merges into the given params object (or creates a new one).
 *
 * @param {Object} [target={}] - Object to merge into.
 * @returns {Object} The target with effect params added.
 */
export function collectEffectParams(target = {}) {
  for (const effect of _effects) {
    for (const ctrl of effect.controls || []) {
      const el = document.getElementById(ctrl.id);
      if (!el) continue;
      switch (ctrl.type) {
        case 'color':    target[ctrl.id] = el.value; break;
        case 'checkbox': target[ctrl.id] = el.checked; break;
        case 'select':   target[ctrl.id] = el.value; break;
        default:         target[ctrl.id] = parseFloat(el.value); break;
      }
    }
  }
  return target;
}

/**
 * Get a merged defaults object from all registered effects.
 * @returns {Object<string, *>}
 */
export function getEffectDefaults() {
  const defaults = {};
  for (const effect of _effects) {
    for (const ctrl of effect.controls || []) {
      defaults[ctrl.id] = ctrl.default;
    }
  }
  return defaults;
}

/**
 * Get all effect parameter IDs that should participate in variation drift.
 * @returns {string[]}
 */
export function getEffectDriftIds() {
  const ids = [];
  for (const effect of _effects) {
    if (effect.driftIds) ids.push(...effect.driftIds);
  }
  return ids;
}

/* ──────────────────────────────────────────────────────────────────────
 * Pipeline runner
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Run all active post-processing effects on the geometry in order.
 *
 * Lazily builds adjacency and noise as requested. Recomputes normals
 * at phase transitions and when effects request it.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {Object} params
 * @returns {THREE.BufferGeometry}
 */
export function runPostProcessEffects(geo, params) {
  let adj = null;
  let normalsValid = true;
  const noiseCache = {};

  /** @type {RunContext} */
  const ctx = {
    get adj() { return adj; },
    noise(seedOffset) {
      if (!noiseCache[seedOffset]) {
        noiseCache[seedOffset] = new SimplexNoise(params.seed + seedOffset);
      }
      return noiseCache[seedOffset];
    },
  };

  let lastPhase = null;

  for (const effect of _effects) {
    if (!effect.shouldRun(params)) continue;

    // Recompute normals when transitioning from geometry → colour phase
    if (effect.phase === 'color' && lastPhase === 'geometry') {
      geo.computeVertexNormals();
      normalsValid = true;
    }

    // Ensure normals are up-to-date if the effect needs them
    if (effect.needsNormals && !normalsValid) {
      geo.computeVertexNormals();
      normalsValid = true;
    }

    // Lazily build adjacency when first needed (or after invalidation)
    if (effect.needsAdjacency && !adj) {
      adj = buildAdjacency(geo);
    }

    const result = effect.process(geo, params, ctx);
    if (result) geo = result;

    // Geometry-modifying effects invalidate adjacency & normals
    if (effect.modifiesGeometry) {
      adj = null;
      normalsValid = false;
    }

    lastPhase = effect.phase;
  }

  return geo;
}

/* ──────────────────────────────────────────────────────────────────────
 * Internal: build a single UI control element
 * ──────────────────────────────────────────────────────────────────── */

function _buildControl(ctrl) {
  switch (ctrl.type) {
    case 'slider': return _buildSlider(ctrl);
    case 'color':  return _buildColor(ctrl);
    case 'select': return _buildSelect(ctrl);
    case 'checkbox': return _buildCheckbox(ctrl);
    default: {
      const div = document.createElement('div');
      div.textContent = `Unknown control type: ${ctrl.type}`;
      return div;
    }
  }
}

function _buildSlider({ id, label, min, max, step, default: def }) {
  const row = document.createElement('div');
  row.className = 'param-row';

  const lbl = document.createElement('span');
  lbl.className = 'param-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.className = 'param-slider';
  input.type = 'range';
  input.id = id;
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = def;

  const val = document.createElement('span');
  val.className = 'param-value';
  val.id = id + '-val';
  const stepStr = String(step);
  const decimals = stepStr.includes('.') ? (stepStr.split('.')[1] || '').length : 0;
  val.textContent = Number(def).toFixed(decimals);

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  return row;
}

function _buildColor({ id, label, default: def }) {
  const row = document.createElement('div');
  row.className = 'color-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'color';
  input.id = id;
  input.value = def;

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

function _buildSelect({ id, label, options, default: def }) {
  const row = document.createElement('div');
  row.className = 'select-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const select = document.createElement('select');
  select.id = id;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === def) o.selected = true;
    select.appendChild(o);
  }

  row.appendChild(lbl);
  row.appendChild(select);
  return row;
}

function _buildCheckbox({ id, label, default: def }) {
  const row = document.createElement('div');
  row.className = 'check-row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = !!def;

  const lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  row.appendChild(input);
  row.appendChild(lbl);
  return row;
}
