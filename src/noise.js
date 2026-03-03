/**
 * Simplex Noise — optimised hot-path implementation.
 *
 * Provides 3D simplex noise, FBM (fractional Brownian motion) and
 * Worley / cellular noise used throughout the rock generator.
 *
 * @module noise
 */
export class SimplexNoise {
  constructor(seed = 0) {
    this.grad3 = new Int8Array([
      1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
      1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
      0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
    ]);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    const rng = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise3D(x, y, z) {
    const perm = this.perm;
    const pm12 = this.permMod12;
    const grad3 = this.grad3;
    const F3 = 1/3, G3 = 1/6;
    const s = (x+y+z)*F3;
    const i = Math.floor(x+s), j = Math.floor(y+s), k = Math.floor(z+s);
    const t = (i+j+k)*G3;
    const x0 = x-(i-t), y0 = y-(j-t), z0 = z-(k-t);
    let i1,j1,k1,i2,j2,k2;
    if(x0>=y0){
      if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}
      else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}
      else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}
    } else {
      if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}
      else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}
      else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}
    }
    const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+0.5, y3=y0-1+0.5, z3=z0-1+0.5;
    const ii=i&255, jj=j&255, kk=k&255;
    let n = 0, t0, t1, t2, t3, gi;

    t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) { t0 *= t0; gi = pm12[ii+perm[jj+perm[kk]]] * 3; n += t0*t0*(grad3[gi]*x0+grad3[gi+1]*y0+grad3[gi+2]*z0); }
    t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) { t1 *= t1; gi = pm12[ii+i1+perm[jj+j1+perm[kk+k1]]] * 3; n += t1*t1*(grad3[gi]*x1+grad3[gi+1]*y1+grad3[gi+2]*z1); }
    t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) { t2 *= t2; gi = pm12[ii+i2+perm[jj+j2+perm[kk+k2]]] * 3; n += t2*t2*(grad3[gi]*x2+grad3[gi+1]*y2+grad3[gi+2]*z2); }
    t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) { t3 *= t3; gi = pm12[ii+1+perm[jj+1+perm[kk+1]]] * 3; n += t3*t3*(grad3[gi]*x3+grad3[gi+1]*y3+grad3[gi+2]*z3); }
    return 32 * n;
  }

  fbm(x, y, z, octaves, lacunarity, persistence) {
    let value = 0, amplitude = 1, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise3D(x*frequency, y*frequency, z*frequency);
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    const invMax = persistence === 0.5
      ? 1 / (2 - Math.pow(0.5, octaves - 1))
      : (1 - persistence) / (1 - Math.pow(persistence, octaves));
    return value * invMax;
  }

  /** Returns squared distances (callers sqrt only if needed). */
  worley3DRaw(x, y, z) {
    const perm = this.perm;
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let f1sq = Infinity, f2sq = Infinity;
    let cpx = 0, cpy = 0, cpz = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = ix + dx, cy = iy + dy, cz = iz + dz;
          const a = perm[(cx & 255)];
          const b = perm[(a + (cy & 255)) & 255];
          const c = perm[(b + (cz & 255)) & 255];
          const px = cx + perm[(c + 37) & 255] / 255;
          const py = cy + perm[(c + 91) & 255] / 255;
          const pz = cz + perm[(c + 173) & 255] / 255;
          const ddx = x - px, ddy = y - py, ddz = z - pz;
          const distSq = ddx*ddx + ddy*ddy + ddz*ddz;
          if (distSq < f1sq) { f2sq = f1sq; f1sq = distSq; cpx = px; cpy = py; cpz = pz; }
          else if (distSq < f2sq) { f2sq = distSq; }
        }
      }
    }
    return { f1sq, f2sq, cpx, cpy, cpz };
  }

  /** Returns sqrt distances + edge (convenience wrapper). */
  worley3D(x, y, z) {
    const r = this.worley3DRaw(x, y, z);
    const f1 = Math.sqrt(r.f1sq), f2 = Math.sqrt(r.f2sq);
    return { f1, f2, edge: f2 - f1, cpx: r.cpx, cpy: r.cpy, cpz: r.cpz };
  }
}
