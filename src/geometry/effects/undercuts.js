/**
 * Undercuts — carves inward at the base to simulate overhanging rock.
 *
 * @module geometry/effects/undercuts
 */
import { register } from '../post-process-registry.js';

register({
  id: 'undercut',
  name: 'Undercuts',
  order: 120,
  phase: 'geometry',
  needsAdjacency: false,
  needsNormals: false,
  modifiesGeometry: true,

  controls: [
    { type: 'slider', id: 'undercut', label: 'Undercut', min: 0, max: 1, step: 0.05, default: 0 },
  ],

  driftIds: ['undercut'],

  shouldRun(params) {
    return params.undercut > 0;
  },

  process(geo, params, ctx) {
    const strength = params.undercut;
    const baseSize = params.baseSize;
    const noise = ctx.noise(3333);

    const pos = geo.attributes.position;
    const arr = pos.array;
    const count = pos.count;

    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = arr[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const hRange = maxY - minY || 1;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = arr[i3], y = arr[i3 + 1], z = arr[i3 + 2];
      const t = (y - minY) / hRange;
      if (t < 0.35) {
        const xzDist = Math.sqrt(x * x + z * z);
        if (xzDist < 0.01) continue;
        const invDist = 1 / xzDist;
        const undercutNoise = noise.fbm(x * 3, y * 2, z * 3, 3, 2, 0.5) * 0.5 + 0.5;
        const depthFactor = (0.35 - t) / 0.35;
        const carveAmount = depthFactor * strength * baseSize * 0.15 * undercutNoise;
        arr[i3]     -= (x * invDist) * carveAmount;
        arr[i3 + 2] -= (z * invDist) * carveAmount;
        arr[i3 + 1] += carveAmount * 0.3;
      }
    }

    pos.needsUpdate = true;
    return geo;
  },
});
