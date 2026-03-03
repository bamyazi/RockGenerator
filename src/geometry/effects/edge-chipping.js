/**
 * Edge chipping — chips convex edges to create breakage appearance.
 *
 * @module geometry/effects/edge-chipping
 */
import { register } from '../post-process-registry.js';

register({
  id: 'edgeChipping',
  name: 'Edge Chipping',
  order: 110,
  phase: 'geometry',
  needsAdjacency: true,
  needsNormals: true,
  modifiesGeometry: true,

  controls: [
    { type: 'slider', id: 'edgeChipping', label: 'Edge Chipping', min: 0, max: 1, step: 0.05, default: 0 },
  ],

  driftIds: ['edgeChipping'],

  shouldRun(params) {
    return params.edgeChipping > 0;
  },

  process(geo, params, ctx) {
    const strength = params.edgeChipping;
    const baseSize = params.baseSize;
    const noise = ctx.noise(2222);
    const adj = ctx.adj;

    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const arr = pos.array;
    const normArr = norm.array;
    const count = pos.count;
    const aOff = adj.offsets, aData = adj.data;

    for (let i = 0; i < count; i++) {
      const start = aOff[i], end = aOff[i + 1];
      if (end - start < 2) continue;
      const i3 = i * 3;
      const vx = arr[i3], vy = arr[i3 + 1], vz = arr[i3 + 2];
      const nx = normArr[i3], ny = normArr[i3 + 1], nz = normArr[i3 + 2];

      let avgNx = 0, avgNy = 0, avgNz = 0;
      let avgPx = 0, avgPy = 0, avgPz = 0;
      for (let j = start; j < end; j++) {
        const n3 = aData[j] * 3;
        avgNx += normArr[n3]; avgNy += normArr[n3 + 1]; avgNz += normArr[n3 + 2];
        avgPx += arr[n3];     avgPy += arr[n3 + 1];     avgPz += arr[n3 + 2];
      }
      const invN = 1 / (end - start);
      avgNx *= invN; avgNy *= invN; avgNz *= invN;
      avgPx *= invN; avgPy *= invN; avgPz *= invN;

      const convexity = 1 - (nx * avgNx + ny * avgNy + nz * avgNz);
      if (convexity > 0.05) {
        let dx = avgPx - vx, dy = avgPy - vy, dz = avgPz - vz;
        const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dLen < 0.0001) continue;
        dx /= dLen; dy /= dLen; dz /= dLen;
        const chipNoise = noise.noise3D(vx * 15, vy * 15, vz * 15) * 0.5 + 0.5;
        const chipAmount = convexity * strength * baseSize * 0.08 * chipNoise;
        arr[i3]     += dx * chipAmount;
        arr[i3 + 1] += dy * chipAmount;
        arr[i3 + 2] += dz * chipAmount;
      }
    }

    pos.needsUpdate = true;
    return geo;
  },
});
