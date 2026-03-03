/**
 * Application entry point.
 *
 * Initialises the Three.js scene, wires up UI controls, generates the
 * first rock, and starts the render loop.  All side-effect imports
 * (`app.js`, `exporters.js`) register their `window.*` bindings upon
 * import so that HTML `onclick` handlers work.
 *
 * @module main
 */
import { initScene, startAnimationLoop, setupHDRI } from './scene.js';
import { setupUI } from './ui.js';
import { generateRock } from './app.js';

// Side-effect imports — register window.* bindings
import './app.js';
import './exporters.js';

/* ──────────────────────────────────────────────────────────────────── */

initScene();
setupHDRI();
setupUI();
generateRock();
startAnimationLoop();

// Hide the loading spinner once everything is ready
const overlay = document.getElementById('loading');
if (overlay) overlay.style.display = 'none';
