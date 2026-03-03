# Code Review — Rock Generator

**Date:** 2026-03-03  
**Scope:** Full codebase (23 JS files, 1 HTML, 1 CSS)  
**Reviewed by:** GitHub Copilot

---

## Summary

The codebase is well-structured for a no-build-tools, browser-native ES module project. The recent refactor from a monolithic file into ~15 modules is clean, and the new plugin registry for post-process effects is a solid architectural pattern. Most issues found are minor — no showstoppers, but several items could improve robustness, performance, and maintainability.

| Severity | Count |
|----------|-------|
| 🔴 Bug | 4 |
| 🟡 Warning | 8 |
| 🔵 Suggestion | 10 |
| ⚪ Nit | 5 |

---

## 🔴 Bugs

### B1. `downloadBlob` leaks Object URLs on fast sequential calls
**File:** `src/utils.js` L96-101  
**Issue:** `URL.revokeObjectURL(link.href)` is called synchronously after `link.click()`, but the browser may not have started the download yet. For a single download this usually works, but `exportTextures()` calls it 3× in rapid succession with `setTimeout` offsets of only 200ms — on slow machines the revocation could race the download.  
**Fix:** Revoke after a short `setTimeout` (e.g. 1000ms), or use `link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(...), 1000))`.

### B2. `injectEffectUI` import in `app.js` is unused
**File:** `src/app.js` L18-19  
**Issue:** `injectEffectUI` is imported but never called from `app.js`. The actual injection happens in `ui.js`. This is dead code in the import; it still works because JS tree-shakes at runtime, but it's misleading.  
**Fix:** Remove `injectEffectUI` from the destructured import in `app.js`.

### B3. Duplicate `setupHDRI()` call on startup
**File:** `src/main.js` L22-23 and `src/scene.js` L87  
**Issue:** `main.js` calls `setupHDRI()` explicitly on line 23, but `initScene()` (called on line 22) already calls `setupHDRI()` internally at line 87 of `scene.js`. This creates the PMREM environment map twice, wasting GPU memory (the first one is overwritten but never disposed).  
**Fix:** Remove the explicit `setupHDRI()` call from `main.js`, or remove the call from inside `initScene()`.

### B4. Thermal erosion mutates neighbour positions during iteration
**File:** `src/geometry/effects/thermal-erosion.js` L50-64  
**Issue:** The inner loop reads `heights[]` (computed at the start of each iteration), but writes directly into `arr[]` (the position buffer). This means a vertex processed later in the loop sees positions already modified by earlier iterations within the same pass, causing order-dependent asymmetric erosion. The `heights[]` array becomes stale after the first vertex is modified.  
**Fix:** Either double-buffer the position changes (accumulate deltas, then apply), or recompute heights after each vertex transfer. This is a known limitation of Jacobi-style vs. Gauss-Seidel iteration; if the visual result is acceptable it can be left as-is, but it should be documented.

---

## 🟡 Warnings

### W1. `randomizeAll()` bypasses effect randomization range awareness
**File:** `src/app.js` L224-233  
**Issue:** The new generic effect randomization loop uses `rand(ctrl.min, ctrl.max)`, which randomizes across the full range. For effects like `erosionIterations` (0–20), this often produces extreme values that make generations very slow. The old hardcoded version used `randInt(0, 5)` — a deliberate subset.  
**Suggestion:** Add an optional `randomRange: [min, max]` field to control definitions so effects can declare "sane" randomization ranges separate from the slider's full range.

### W2. No geometry disposal when `runPostProcessEffects` returns a new geometry
**File:** `src/geometry/post-process-registry.js` L233-234  
**Issue:** `const result = effect.process(geo, params, ctx); if (result) geo = result;` — if an effect returns a *new* geometry, the old one is not disposed. Currently no effects do this (they all mutate in-place and return the same `geo`), but the contract allows it and future effects could leak.  
**Fix:** Add `if (result && result !== geo) { geo.dispose(); geo = result; }`.

### W3. `edgeSeen` Set uses vertex indices to generate edge keys — integer overflow risk
**File:** `src/geometry/decimation.js` L140-147  
**Issue:** Edge keys are computed as `a * vertCount + b`. For meshes with >~46k vertices, `a * vertCount` exceeds `Number.MAX_SAFE_INTEGER` when `a ≈ vertCount ≈ 46341` (since 46341² > 2^53). At that point edge keys collide, potentially skipping valid edges or collapsing wrong ones.  
**Fix:** Use string keys (`${a}_${b}`) or BigInt, or a `Map<number, Set<number>>` keyed on the lower vertex.

### W4. `texToBlob` creates canvas but never cleans it up
**File:** `src/utils.js` L104-110  
**Issue:** Each call creates a `<canvas>`, draws into it, then converts to Blob. The canvas remains in memory until GC, which is fine for occasional use, but `exportAllZip` calls it 3× in quick succession.  
**Suggestion:** Minor — no action needed unless memory profiling shows leaks.

### W5. `collectParams()` reads from DOM on every generation call
**File:** `src/utils.js` L27-93  
**Issue:** Every `generateRock()` call triggers 60+ `document.getElementById()` + `parseFloat()` calls. This is fast enough for interactive use, but the pattern is fragile — any mistyped ID returns `NaN` silently.  
**Suggestion:** Add a debug assertion (behind a flag) that validates all returned values are finite numbers where expected.

### W6. Hash-based vertex welding has collision potential
**File:** `src/geometry/mesh-ops.js` L26-28  
**Issue:** The spatial hash `((kx * 73856093) ^ (ky * 19349663) ^ (kz * 83492791)) | 0` can produce collisions between different grid cells. The code handles this by storing `[kx, ky, kz, newCount]` and doing a linear scan within buckets — correct, but for pathological meshes the linear scan could be O(n).  
**Suggestion:** This is fine for the expected mesh sizes (<100k verts). No action needed.

### W7. `section-body` max-height transition won't work for dynamically injected effects
**File:** `css/styles.css` L90-91  
**Issue:** `.section-body { transition: max-height 0.3s ease; }` relies on `max-height` for animation, but no explicit `max-height` is ever set on the element. The `.collapsed` state sets `max-height: 0 !important`, and the expanded state has no `max-height` — so the open-transition won't animate (it snaps open). This is a known CSS limitation.  
**Fix:** Either use JS to set `max-height = scrollHeight + 'px'` on expand, or switch to a `details/summary` element, or accept the snap-open behavior.

### W8. `scene.js` creates HDRI with non-deterministic noise
**File:** `src/scene.js` L107-112  
**Issue:** `Math.random()` is used to add noise to the procedural HDRI sky. This means the environment changes subtly on every page reload, which might cause minor inconsistencies in automated tests or screenshots.  
**Suggestion:** Use a seeded RNG for reproducibility if needed.

---

## 🔵 Suggestions

### S1. Effect controls lack `randomRange` metadata
**Issue:** The generic randomization in `randomizeAll()` uses the full slider range. Effects like `erosionIterations` (0–20) should have a `randomRange` to limit how far randomization goes.  
**Proposal:** Add optional `randomRange: { min, max }` to control definitions; fall back to slider `min`/`max` if absent.

### S2. Consider a `resetUI()` helper to sync all slider displays
**Issue:** `syncAllSliderDisplays()` is duplicated in concept across `app.js`, `exporters.js` (in `loadParams`), and `ui.js`. The logic for computing `decimals` from `step` is repeated 4× across the codebase.  
**Proposal:** Extract a shared `syncSliderDisplay(sliderId)` utility.

### S3. Effect registry could validate at registration time
**Issue:** If an effect is registered with a duplicate `id`, missing `controls`, or invalid `phase`, nothing catches it until runtime. This would be easy to miss during development.  
**Proposal:** Add validation in `register()` — throw or `console.warn` on: duplicate IDs, unknown phases, controls with missing `id`/`type`.

### S4. `buildOBJString` uses string concatenation in a loop
**File:** `src/utils.js` L118-141  
**Issue:** For large meshes (50k+ verts), repeated `obj += ...` creates many intermediate strings. Array-push + join would be faster.  
**Proposal:** `const lines = []; ... lines.push(\`v ...\`); ... return lines.join('\n');`

### S5. `applyShapePreset()` in `ui.js` is fully hardcoded
**File:** `src/ui.js` L40-77  
**Issue:** Every new preset field must be manually added to `applyShapePreset()`. The function could iterate over the preset's keys instead.  
**Proposal:** `for (const [key, val] of Object.entries(p)) { if (key === 'baseShape') { ... } else { setSlider(key, val); } }`

### S6. Textures are 256×256 — consider making this configurable
**File:** `src/textures.js` L18  
**Issue:** Texture resolution is hardcoded to 256. For LOD-0 game assets, 512 or 1024 might be desired; for thumbnails, 128 could be faster.  
**Suggestion:** Add a `textureResolution` param (or at least a constant at the top of the file).

### S7. `exportGLB` and `exportAllZip` duplicate material creation logic
**File:** `src/exporters.js` L24-34 and L214-224  
**Issue:** The export material construction (with `hasVC` check, PBR properties) is duplicated verbatim.  
**Fix:** Extract a `createExportMaterial(params, textures)` helper.

### S8. Consider lazy-importing JSZip
**File:** `index.html` L558  
**Issue:** JSZip (30KB gzipped) is loaded via `<script>` on every page load, but only used when the user clicks "Download All (ZIP)". A dynamic `import()` would speed up initial load.  
**Suggestion:** `const JSZip = (await import('...')).default;` inside `exportAllZip()`.

### S9. `crackDisplace` and `crackNearTest` share duplicated noise lookups
**File:** `src/geometry/displacement.js`  
**Issue:** The `planar`, `vertical`, and `horizontal` algorithms compute identical noise-based plane orientations in both `crackDisplace` and `crackNearTest`. Any change to one must be mirrored to the other.  
**Suggestion:** Extract shared config objects (plane dirs, warp params) computed once and passed to both functions.

### S10. Post-process effects don't set `needsUpdate` on index/normal attributes
**Issue:** Most geometry effects (edge-chipping, undercuts, thermal-erosion) modify `position.array` and set `pos.needsUpdate = true`, but `geo.computeVertexNormals()` is deferred to the registry's phase-transition check. If a geometry-phase effect is the *last* effect to run, normals may not be recomputed.  
**Observation:** Actually, the registry handles this correctly — `runPostProcessEffects` checks if a phase transition from `geometry` → `color` occurred and recomputes normals. But if *only* geometry effects run (no color effects follow), the normals from the last geometry effect won't be recomputed before the function returns. The caller (`generateRockGeometry`) doesn't call `computeVertexNormals()` after `runPostProcessEffects` either.  
**Fix:** Add a final `geo.computeVertexNormals()` call either at the end of `runPostProcessEffects` or in `generateRockGeometry` after calling it.

---

## ⚪ Nits

### N1. `import * as THREE from 'three'` in files that don't use it
**Files:** `src/geometry/effects/spike-removal.js` (imports `THREE` but has no Three.js-specific calls other than `pos.needsUpdate`; `THREE` namespace is never referenced directly).  
**Fix:** Remove unused import.

### N2. Inconsistent `return geo` in effects
**Issue:** Some geometry effects return `geo` explicitly (edge-chipping, undercuts, thermal-erosion, spike-removal), while color effects return nothing. This is technically fine since the registry handles both patterns, but it's inconsistent.  
**Suggestion:** Pick one style and document it — either always return `geo`, or never return (for effects that mutate in-place).

### N3. `index.html.bak` left in the repo root
**Issue:** The backup file from the refactor should be gitignored or deleted.  
**Fix:** Verify it's in `.gitignore` (it is via `*.bak`), or delete it.

### N4. CSS `transition: max-height 0.3s ease` on `.section-body` does nothing
As noted in W7, the transition has no `max-height` value to transition from.

### N5. Magic numbers in effects
**Issue:** Various effects use unexplained constants (e.g., `15` in edge-chipping noise scale, `0.35` in undercut height threshold, `0.04` talus threshold). Consider naming these as constants at the top of each effect file for readability.

---

## Architecture Notes

### What's Good

- **Plugin registry pattern** — The effect plugin system (`register()` + self-registering files) is excellent. Adding new effects requires zero changes to existing code beyond a single side-effect import line.
- **Lazy resource provisioning** — The `ctx.adj` getter and `ctx.noise(offset)` caching in the registry runner prevent redundant adjacency builds and noise instance creation.
- **Module boundaries** — Each file has a clear, singular responsibility. No circular dependencies.
- **No build tools** — The project runs directly from `file://` (with a local server for modules) via native `importmap`. This is a feature, not a limitation — it makes the project extremely accessible.
- **JSDoc annotations** — Typedefs in the registry module are thorough and aid IDE autocomplete.

### Areas for Improvement

- **Error boundaries** — No `try/catch` anywhere in the generation pipeline. A NaN in one slider could cascade through the entire geometry, producing invisible or corrupted meshes. Consider wrapping `generateRockGeometry()` in a try/catch with a user-visible error message.
- **Undo/History** — There's no way to undo parameter changes. A simple stack of `collectParams()` snapshots would be cheap.
- **Worker thread** — The entire geometry pipeline runs on the main thread. For high-detail rocks (detail=4 + subdivisions), this blocks the UI. A Web Worker with transferable ArrayBuffers would help.
- **Accessibility** — No ARIA labels or keyboard navigation for the sidebar controls. The `onclick="toggleSection(this)"` inline handlers prevent keyboard activation.

---

## Priority Recommendations

1. **Fix B3** (duplicate `setupHDRI` call) — trivial, wastes GPU memory
2. **Fix B2** (remove unused import) — trivial cleanup
3. **Fix S10** (missing final `computeVertexNormals`) — could cause lighting artifacts
4. **Implement S1** (randomRange) — prevents slow random generations from high erosion iterations
5. **Fix W1** (randomize range limits) — directly affects UX
