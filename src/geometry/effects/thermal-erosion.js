/**
 * Thermal erosion simulation — moves material downhill.
 *
 * @module geometry/effects/thermal-erosion
 */
import { register } from '../post-process-registry.js';

register({
  id: 'thermalErosion',
  name: 'Thermal Erosion',
  order: 130,
  phase: 'geometry',
  needsAdjacency: true,
  needsNormals: false,
  modifiesGeometry: true,

  controls: [
    { type: 'slider', id: 'erosionIterations', label: 'Erosion Iters', min: 0, max: 20, step: 1, default: 0 },
  ],

  shouldRun(params) {
    return params.erosionIterations > 0;
  },

  process(geo, params, ctx) {
    const iterations = Math.round(params.erosionIterations);
    const baseSize = params.baseSize;
    const adj = ctx.adj;

    const pos = geo.attributes.position;
    const arr = pos.array;
    const count = pos.count;
    const aOff = adj.offsets, aData = adj.data;
    const talusThreshold = baseSize * 0.04;
    const transferRate = 0.3;
    const heights = new Float32Array(count);

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        heights[i] = Math.sqrt(arr[i3] * arr[i3] + arr[i3 + 1] * arr[i3 + 1] + arr[i3 + 2] * arr[i3 + 2]);
      }
      for (let i = 0; i < count; i++) {
        const start = aOff[i], end = aOff[i + 1];
        if (start === end) continue;
        const i3 = i * 3;
        const iHeight = heights[i];
        let maxDiff = 0, maxNb = -1;
        for (let j = start; j < end; j++) {
          const diff = iHeight - heights[aData[j]];
          if (diff > talusThreshold && diff > maxDiff) { maxDiff = diff; maxNb = aData[j]; }
        }
        if (maxNb >= 0) {
          const transfer = Math.min(maxDiff * 0.5, talusThreshold) * transferRate;
          const invILen = 1 / (iHeight || 1);
          arr[i3]     -= arr[i3]     * invILen * transfer;
          arr[i3 + 1] -= arr[i3 + 1] * invILen * transfer;
          arr[i3 + 2] -= arr[i3 + 2] * invILen * transfer;
          const n3 = maxNb * 3;
          const invNLen = 1 / (heights[maxNb] || 1);
          const deposit = transfer * 0.6;
          arr[n3]     += arr[n3]     * invNLen * deposit;
          arr[n3 + 1] += arr[n3 + 1] * invNLen * deposit;
          arr[n3 + 2] += arr[n3 + 2] * invNLen * deposit;
        }
      }
    }

    pos.needsUpdate = true;
    return geo;
  },
});
