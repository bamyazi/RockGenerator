/**
 * Main rock geometry generation pipeline.
 * Orchestrates all geometry sub-modules to produce a complete rock mesh.
 *
 * @module geometry/rock-generator
 */
import * as THREE from 'three';
import { SimplexNoise } from '../noise.js';
import { weldVertices, buildAdjacency, subdivideGeometry, adaptiveSubdivide } from './mesh-ops.js';
import { displaceVertices, crackDisplace, crackNearTest } from './displacement.js';
import { runPostProcessEffects } from './post-process-registry.js';

// Side-effect imports — each effect self-registers with the registry
import './effects/spike-removal.js';
import './effects/edge-chipping.js';
import './effects/undercuts.js';
import './effects/thermal-erosion.js';
import './effects/vertex-ao.js';
import './effects/curvature-color.js';
import './effects/moss.js';

/**
 * Generate a procedural rock geometry from the given parameter set.
 *
 * @param {Object} params - Full parameter object (see collectParams in utils.js).
 * @returns {THREE.BufferGeometry} The finished rock geometry.
 */
export function generateRockGeometry(params) {
  // ── Create base shape ──
  let geo;
  const r = params.baseSize;
  const d = Math.max(1, params.detail);
  const dClamped = Math.min(d, 3);
  switch (params.baseShape) {
    case 'box':
      geo = new THREE.BoxGeometry(r*2, r*2, r*2, d*2, d*2, d*2);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(r, r, r*2, d*6, d*2, false);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(r, r*2.5, d*6, d*2, false);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(r, r*0.4, d*4, d*8);
      break;
    default: // sphere
      geo = new THREE.IcosahedronGeometry(r, dClamped);
      break;
  }

  // ── Weld duplicate vertices (seams on Box/Cylinder/Cone/Torus) ──
  geo = weldVertices(geo);

  // ── Apply axis scaling ──
  {
    const pos = geo.attributes.position;
    const arr = pos.array;
    const ws = params.widthScale, hs = params.heightScale, ds = params.depthScale;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      arr[i3] *= ws;
      arr[i3+1] *= hs;
      arr[i3+2] *= ds;
    }
    pos.needsUpdate = true;
  }

  const noiseMacro = new SimplexNoise(params.seed);
  const noiseMeso  = new SimplexNoise(params.seed + 333);
  const noiseMicro = new SimplexNoise(params.seed + 777);
  const noiseCrack = new SimplexNoise(params.seed + 500);
  const noiseWarp  = new SimplexNoise(params.seed + 111);

  // ── Domain warping pass — breaks symmetry ──
  if (params.domainWarp > 0) {
    const pos = geo.attributes.position;
    const arr = pos.array;
    const ws = params.warpScale;
    const wo = params.warpOctaves;
    const wStr = params.domainWarp * params.baseSize;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = arr[i3], y = arr[i3+1], z = arr[i3+2];
      const wx = noiseWarp.fbm(x*ws + 0.0, y*ws + 3.1, z*ws + 7.2, wo, 2.0, 0.5) * wStr;
      const wy = noiseWarp.fbm(x*ws + 5.4, y*ws + 1.7, z*ws + 9.8, wo, 2.0, 0.5) * wStr;
      const wz = noiseWarp.fbm(x*ws + 8.6, y*ws + 4.3, z*ws + 2.5, wo, 2.0, 0.5) * wStr;
      arr[i3] = x + wx;
      arr[i3+1] = y + wy;
      arr[i3+2] = z + wz;
    }
    pos.needsUpdate = true;
  }

  // ── Taper, twist, skew, concavity, bulge ──
  {
    const pos = geo.attributes.position;
    const arr = pos.array;
    const count = pos.count;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = arr[i*3+1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const hRange = maxY - minY || 1;
    const invHRange = 1 / hRange;

    const hasTaperTop = params.taperTop > 0;
    const hasTaperBot = params.taperBottom > 0;
    const hasTwist = params.twist !== 0;
    const hasSkewX = params.skewX !== 0;
    const hasSkewZ = params.skewZ !== 0;
    const hasConcavity = params.concavity > 0;
    const hasBulge = params.bulge !== 0;
    const dirs = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
    const dir = hasConcavity ? (dirs[params.concavityDir] || dirs[0]) : null;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x = arr[i3], y = arr[i3+1], z = arr[i3+2];
      const t = (y - minY) * invHRange;

      if (hasTaperTop) {
        const scale = 1 - params.taperTop * t * t;
        x *= scale; z *= scale;
      }
      if (hasTaperBot) {
        const bt = 1 - t;
        const scale = 1 - params.taperBottom * bt * bt;
        x *= scale; z *= scale;
      }
      if (hasTwist) {
        const angle = params.twist * t * Math.PI;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const nx2 = x * cos - z * sin;
        const nz2 = x * sin + z * cos;
        x = nx2; z = nz2;
      }
      if (hasSkewX) x += params.skewX * (y - minY);
      if (hasSkewZ) z += params.skewZ * (y - minY);

      if (hasConcavity) {
        const len = Math.sqrt(x*x + y*y + z*z) || 1;
        const dot = (x*dir[0] + y*dir[1] + z*dir[2]) / len;
        if (dot > 0) {
          const strength = Math.pow(dot, 1.5) * params.concavity * params.baseSize;
          x -= dir[0] * strength;
          y -= dir[1] * strength;
          z -= dir[2] * strength;
        }
      }

      if (hasBulge) {
        const mid = 1 - Math.abs(t - 0.5) * 2;
        const scale = 1 + params.bulge * mid * mid;
        x *= scale; z *= scale;
      }

      arr[i3] = x; arr[i3+1] = y; arr[i3+2] = z;
    }
    pos.needsUpdate = true;
  }

  // ── PASS 1: Macro displacement (large bulges, lobes) ──
  if (params.macroStrength > 0) {
    displaceVertices(geo, noiseMacro, params.macroScale, params.macroStrength,
      params.macroOctaves, params.baseSize, { ridgeMix: params.macroRidge });
  }

  // ── Subdivide for medium features ──
  if (params.mesoStrength > 0) {
    for (let s = 0; s < params.mesoSubdivs; s++) geo = subdivideGeometry(geo);
    displaceVertices(geo, noiseMeso, params.mesoScale, params.mesoStrength,
      params.mesoOctaves, params.baseSize, { sharpness: params.sharpness });
  }

  // ── Subdivide for fine detail ──
  if (params.microStrength > 0) {
    for (let s = 0; s < params.microSubdivs; s++) geo = subdivideGeometry(geo);
    displaceVertices(geo, noiseMicro, params.microScale, params.microStrength,
      params.microOctaves, params.baseSize);
  }

  // ── Adaptive subdivision near cracks/pits ──
  const hasCracks = params.crackDepth > 0;
  const hasPitting = params.pitting > 0;
  if ((hasCracks || hasPitting) && params.crackSubdivs > 0) {
    const cs = params.crackDensity;
    const pitScale = params.pitSize;
    const pitThreshold = 0.15 + (1 - params.pitting) * 0.25;
    const pitNearThSq = (pitThreshold * 1.5) * (pitThreshold * 1.5);

    function nearDetail(x, y, z) {
      if (hasCracks && crackNearTest(x, y, z, params, noiseCrack, noiseWarp)) return true;
      if (hasPitting) {
        const pitRaw = noiseCrack.worley3DRaw(x * pitScale + 23.1, y * pitScale + 41.7, z * pitScale + 9.3);
        if (pitRaw.f1sq < pitNearThSq) return true;
      }
      return false;
    }

    for (let s = 0; s < params.crackSubdivs; s++) geo = adaptiveSubdivide(geo, nearDetail);
  }

  // ── Compute per-vertex normals for displacement direction ──
  geo.computeVertexNormals();
  const vtxNormals = geo.attributes.normal;

  // ── Post-processing pass (erosion, geometric cracks, pitting, flatness) ──
  const pos = geo.attributes.position;
  const posArr = pos.array;
  const normArr = vtxNormals.array;
  const vertCount = pos.count;
  const hasErosion = params.erosion > 0;
  const hasFlatness = params.flatness > 0;
  const flatY = hasFlatness ? -params.baseSize * params.heightScale * (1 - params.flatness * 0.5) : 0;

  for (let i = 0; i < vertCount; i++) {
    const i3 = i * 3;
    let x = posArr[i3], y = posArr[i3+1], z = posArr[i3+2];
    const lenSq = x*x + y*y + z*z;
    if (lenSq < 1e-8) continue;
    const invLen = 1 / Math.sqrt(lenSq);
    const len = lenSq * invLen;

    let dnx = normArr[i3], dny = normArr[i3+1], dnz = normArr[i3+2];
    const dnLenSq = dnx*dnx + dny*dny + dnz*dnz;
    if (dnLenSq > 1e-8) {
      const dnInv = 1 / Math.sqrt(dnLenSq);
      dnx *= dnInv; dny *= dnInv; dnz *= dnInv;
    } else {
      dnx = x*invLen; dny = y*invLen; dnz = z*invLen;
    }

    const rnx = x*invLen, rny = y*invLen, rnz = z*invLen;
    let displacement = 0;

    // Erosion
    if (hasErosion) {
      const erosionFactor = (rny > 0 ? rny : 0) * params.erosion;
      displacement -= (len - params.baseSize) * erosionFactor * 0.6;
    }

    // Geometric Cracks
    if (hasCracks) displacement -= crackDisplace(x, y, z, params, noiseCrack, noiseWarp);

    // Geometric Pitting
    if (hasPitting) {
      const pitScale = params.pitSize;
      const pitRaw = noiseCrack.worley3DRaw(x * pitScale + 23.1, y * pitScale + 41.7, z * pitScale + 9.3);
      const pitThreshold = 0.15 + (1 - params.pitting) * 0.25;
      const pitThSq = pitThreshold * pitThreshold;
      if (pitRaw.f1sq < pitThSq) {
        const f1 = Math.sqrt(pitRaw.f1sq);
        const t = f1 / pitThreshold;
        const tSmooth = 1 - t * t * (3 - 2 * t);
        const profile = tSmooth * Math.sqrt(Math.max(0, 1 - t * t));
        const pitNoise = noiseCrack.noise3D(x * 5.7, y * 5.7, z * 5.7) * 0.3 + 0.7;
        displacement -= profile * params.pitting * params.baseSize * 0.12 * pitNoise;
      }
      if (params.pitting > 0.3) {
        const pitRaw2 = noiseCrack.worley3DRaw(
          x * pitScale * 2.1 + 55.4, y * pitScale * 2.1 + 33.2, z * pitScale * 2.1 + 77.8
        );
        const pitThreshold2 = 0.12 + (1 - params.pitting) * 0.2;
        const pitThSq2 = pitThreshold2 * pitThreshold2;
        if (pitRaw2.f1sq < pitThSq2) {
          const f1_2 = Math.sqrt(pitRaw2.f1sq);
          const t2 = f1_2 / pitThreshold2;
          const t2s = 1 - t2 * t2 * (3 - 2 * t2);
          const profile2 = t2s * Math.sqrt(Math.max(0, 1 - t2 * t2));
          displacement -= profile2 * params.pitting * params.baseSize * 0.05;
        }
      }
    }

    // Apply displacement along vertex normal
    x += dnx * displacement;
    y += dny * displacement;
    z += dnz * displacement;

    // Flatness
    if (hasFlatness && y < flatY) y = flatY;

    posArr[i3] = x; posArr[i3+1] = y; posArr[i3+2] = z;
  }

  // ── Run registered post-processing effects ──
  geo = runPostProcessEffects(geo, params);

  return geo;
}
