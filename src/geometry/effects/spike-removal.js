/**
 * Spike removal, inverted-triangle repair, and Laplacian smoothing.
 *
 * @module geometry/effects/spike-removal
 */
import * as THREE from 'three';
import { register } from '../post-process-registry.js';

register({
  id: 'spikeRemoval',
  name: 'Spike Removal & Smoothing',
  order: 100,
  phase: 'geometry',
  needsAdjacency: true,
  needsNormals: false,
  modifiesGeometry: true,

  controls: [
    { type: 'slider', id: 'spikeRemoval', label: 'Spike Removal', min: 0, max: 1, step: 0.05, default: 0.5 },
    { type: 'slider', id: 'smoothPasses', label: 'Smooth Passes', min: 0, max: 10, step: 1, default: 2 },
  ],

  shouldRun(params) {
    return params.spikeRemoval > 0 || params.smoothPasses > 0;
  },

  process(geo, params, ctx) {
    const spikeStrength = params.spikeRemoval;
    const passes = params.smoothPasses;
    const adj = ctx.adj;

    const pos = geo.attributes.position;
    const arr = pos.array;
    const count = pos.count;
    const idx = geo.index ? geo.index.array : null;
    const triCount = idx ? idx.length / 3 : count / 3;
    const aOff = adj.offsets, aData = adj.data;

    // ── Phase 1: Spike detection ──
    if (spikeStrength > 0) {
      for (let i = 0; i < count; i++) {
        const start = aOff[i], end = aOff[i + 1];
        const nbCount = end - start;
        if (nbCount < 2) continue;
        const i3 = i * 3;
        const vx = arr[i3], vy = arr[i3 + 1], vz = arr[i3 + 2];
        let cx = 0, cy = 0, cz = 0, avgEdgeLen = 0;
        for (let j = start; j < end; j++) {
          const n3 = aData[j] * 3;
          const nx = arr[n3], ny = arr[n3 + 1], nz = arr[n3 + 2];
          cx += nx; cy += ny; cz += nz;
          const dx = nx - vx, dy = ny - vy, dz = nz - vz;
          avgEdgeLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const inv = 1 / nbCount;
        cx *= inv; cy *= inv; cz *= inv;
        avgEdgeLen *= inv;
        if (avgEdgeLen < 1e-8) continue;
        const dcx = vx - cx, dcy = vy - cy, dcz = vz - cz;
        const distToCentroid = Math.sqrt(dcx * dcx + dcy * dcy + dcz * dcz);
        const spikeRatio = distToCentroid / avgEdgeLen;
        const threshold = 1.5 - spikeStrength * 0.8;
        if (spikeRatio > threshold) {
          const excess = Math.min((spikeRatio - threshold) / threshold, 1.0);
          const blend = excess * spikeStrength;
          const bInv = 1 - blend;
          arr[i3]     = vx * bInv + cx * blend;
          arr[i3 + 1] = vy * bInv + cy * blend;
          arr[i3 + 2] = vz * bInv + cz * blend;
        }
      }
    }

    // ── Phase 2: Fix inverted triangles + thin fins ──
    if (idx && spikeStrength > 0) {
      let comX = 0, comY = 0, comZ = 0;
      for (let i = 0; i < count; i++) { comX += arr[i * 3]; comY += arr[i * 3 + 1]; comZ += arr[i * 3 + 2]; }
      const invC = 1 / count;
      comX *= invC; comY *= invC; comZ *= invC;

      for (let t = 0; t < triCount; t++) {
        const t3 = t * 3;
        const a = idx[t3], b = idx[t3 + 1], c = idx[t3 + 2];
        const a3 = a * 3, b3 = b * 3, c3 = c * 3;
        const ax = arr[a3], ay = arr[a3 + 1], az = arr[a3 + 2];
        const bx = arr[b3], by = arr[b3 + 1], bz = arr[b3 + 2];
        const cx2 = arr[c3], cy2 = arr[c3 + 1], cz2 = arr[c3 + 2];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;
        const fnx = e1y * e2z - e1z * e2y;
        const fny = e1z * e2x - e1x * e2z;
        const fnz = e1x * e2y - e1y * e2x;
        const fcx = (ax + bx + cx2) / 3 - comX;
        const fcy = (ay + by + cy2) / 3 - comY;
        const fcz = (az + bz + cz2) / 3 - comZ;
        const dot = fnx * fcx + fny * fcy + fnz * fcz;

        if (dot < 0) {
          const blend = 0.5 * spikeStrength;
          const bInv = 1 - blend;
          for (let vi = 0; vi < 3; vi++) {
            const v = vi === 0 ? a : vi === 1 ? b : c;
            const s = aOff[v], e = aOff[v + 1];
            if (e - s < 2) continue;
            const v3 = v * 3;
            let mx = 0, my = 0, mz = 0;
            for (let j = s; j < e; j++) { const n3 = aData[j] * 3; mx += arr[n3]; my += arr[n3 + 1]; mz += arr[n3 + 2]; }
            const inv2 = 1 / (e - s);
            arr[v3]     = arr[v3]     * bInv + mx * inv2 * blend;
            arr[v3 + 1] = arr[v3 + 1] * bInv + my * inv2 * blend;
            arr[v3 + 2] = arr[v3 + 2] * bInv + mz * inv2 * blend;
          }
          continue;
        }

        // Thin fin check
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const bcx = cx2 - bx, bcy = cy2 - by, bcz = cz2 - bz;
        const cax = ax - cx2, cay = ay - cy2, caz = az - cz2;
        const lab = abx * abx + aby * aby + abz * abz;
        const lbc = bcx * bcx + bcy * bcy + bcz * bcz;
        const lca = cax * cax + cay * cay + caz * caz;
        const longest  = lab > lbc ? (lab > lca ? lab : lca) : (lbc > lca ? lbc : lca);
        const shortest = lab < lbc ? (lab < lca ? lab : lca) : (lbc < lca ? lbc : lca);
        if (shortest < 1e-12) continue;
        const aspect = longest / shortest;
        if (aspect > 25) {
          const mx = (ax + bx + cx2) / 3;
          const my = (ay + by + cy2) / 3;
          const mz = (az + bz + cz2) / 3;
          const blend = Math.min((aspect - 25) / 100, 0.8) * spikeStrength;
          arr[a3]     += (mx - arr[a3])     * blend;
          arr[a3 + 1] += (my - arr[a3 + 1]) * blend;
          arr[a3 + 2] += (mz - arr[a3 + 2]) * blend;
          arr[b3]     += (mx - arr[b3])     * blend;
          arr[b3 + 1] += (my - arr[b3 + 1]) * blend;
          arr[b3 + 2] += (mz - arr[b3 + 2]) * blend;
          arr[c3]     += (mx - arr[c3])     * blend;
          arr[c3 + 1] += (my - arr[c3 + 1]) * blend;
          arr[c3 + 2] += (mz - arr[c3 + 2]) * blend;
        }
      }
    }

    // ── Phase 3: Laplacian smoothing ──
    if (passes > 0) {
      const lambda = 0.3;
      const tmp = new Float32Array(count * 3);
      for (let p = 0; p < passes; p++) {
        tmp.set(arr);
        for (let i = 0; i < count; i++) {
          const start = aOff[i], end = aOff[i + 1];
          const nbCount = end - start;
          if (nbCount < 2) continue;
          const i3 = i * 3;
          let cx = 0, cy = 0, cz = 0;
          for (let j = start; j < end; j++) { const n3 = aData[j] * 3; cx += tmp[n3]; cy += tmp[n3 + 1]; cz += tmp[n3 + 2]; }
          const invN = 1 / nbCount;
          arr[i3]     = tmp[i3]     + (cx * invN - tmp[i3])     * lambda;
          arr[i3 + 1] = tmp[i3 + 1] + (cy * invN - tmp[i3 + 1]) * lambda;
          arr[i3 + 2] = tmp[i3 + 2] + (cz * invN - tmp[i3 + 2]) * lambda;
        }
      }
    }

    pos.needsUpdate = true;
    return geo;
  },
});
