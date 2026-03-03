/**
 * Procedural texture generation (diffuse, normal, roughness maps).
 *
 * @module textures
 */
import * as THREE from 'three';
import { SimplexNoise } from './noise.js';
import { hexToRgb } from './utils.js';

/**
 * Generate procedural PBR textures for a rock.
 *
 * @param {Object} params - Full parameter object.
 * @returns {{ diffuseTexture: THREE.CanvasTexture, normalTexture: THREE.CanvasTexture, roughnessTexture: THREE.CanvasTexture }}
 */
export function generateTextures(params) {
  const size = 256;
  const diffuseCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  diffuseCanvas.width = diffuseCanvas.height = size;
  normalCanvas.width = normalCanvas.height = size;
  roughCanvas.width = roughCanvas.height = size;
  const dCtx = diffuseCanvas.getContext('2d');
  const nCtx = normalCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');

  const dImg = dCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const dData = dImg.data;
  const nData = nImg.data;
  const rData = rImg.data;

  const noise = new SimplexNoise(params.seed + 1000);
  const pCol = hexToRgb(params.colorPrimary);
  const sCol = hexToRgb(params.colorSecondary);
  const tCol = hexToRgb(params.colorTertiary || '#4a4a3e');
  const sc = params.textureScale;
  const variation = params.colorVariation;
  const octaves = params.textureDetail;
  const colorOctaves = Math.min(octaves, 3);
  const isGranite = params.rockType === 'granite' || params.rockType === 'limestone';
  const isMarble = params.rockType === 'marble';
  const isMossy = params.rockType === 'mossy';
  const isSlate = params.rockType === 'slate';
  const isObsidian = params.rockType === 'obsidian';
  const isSandstone = params.rockType === 'sandstone';
  const isBasalt = params.rockType === 'basalt';
  const bumpStrength = params.bumpIntensity;
  const roughnessBase = params.roughnessMap;
  const normOctaves = Math.min(octaves, 2);
  const eps = sc / size;
  const invSize = 1 / size;
  const microNormScale = params.microNormalScale;
  const microNormStrength = params.microNormalStrength;
  const hasCrackNorm = params.crackDepth > 0;
  const crackDens = params.crackDensity;
  const crackW = params.crackWidth;
  const crackNormStr = params.crackDepth * 4;

  const strataStr = params.strataStrength || 0;
  const mineralDens = params.mineralDensity || 0;
  const weatherAmt = params.weathering || 0;
  const grainSc = params.grainScale || 6;
  const grainStr = params.grainStrength || 0.3;
  const roughVar = params.roughnessVariation || 0.15;
  const hasStrata = strataStr > 0;
  const hasMinerals = mineralDens > 0;
  const hasWeather = weatherAmt > 0;
  const hasGrain = grainStr > 0;
  const hasVariation = variation > 0;

  for (let y = 0; y < size; y++) {
    const ny = y * invSize * sc;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x * invSize * sc;

      const n1 = noise.fbm(nx, ny, 0, colorOctaves, 2.0, 0.5) * 0.5 + 0.5;

      const blend = n1 * (1 + variation) - variation * 0.5;
      const blendClamped = blend < 0 ? 0 : blend > 1 ? 1 : blend;
      const blendInv = 1 - blendClamped;
      let r = pCol.r * blendClamped + sCol.r * blendInv;
      let g = pCol.g * blendClamped + sCol.g * blendInv;
      let b = pCol.b * blendClamped + sCol.b * blendInv;

      if (hasVariation) {
        const n2 = noise.fbm(nx + 5.2, ny + 1.3, 0, colorOctaves, 2.0, 0.5) * 0.5 + 0.5;
        const micro = (n2 - 0.5) * variation;
        r += micro * 0.3 + (tCol.r - 0.5) * micro * 0.15;
        g += micro * 0.24 + (tCol.g - 0.5) * micro * 0.15;
        b += micro * 0.18 + (tCol.b - 0.5) * micro * 0.15;
      }

      // ── Worley grain pattern ──
      let grainWorley = null;
      if (hasGrain) {
        grainWorley = noise.worley3D(nx * grainSc, ny * grainSc, 0.5);
        const edgeV = grainWorley.edge;
        const grainDark = (1 - Math.min(edgeV * 4, 1)) * grainStr * 0.2;
        r -= grainDark; g -= grainDark; b -= grainDark * 0.85;
        const cellTint = noise.noise3D(grainWorley.cpx * 7.3, grainWorley.cpy * 7.3, grainWorley.cpz * 7.3) * grainStr * 0.08;
        r += cellTint; g += cellTint * 0.7; b += cellTint * 0.5;
      }

      // ── Strata / sedimentary layering ──
      let cachedStrataWarp = 0;
      if (hasStrata) {
        cachedStrataWarp = noise.noise3D(nx * 1.5, ny * 0.5, 1.7) * 2;
        const strataPhase = ny * 6 + cachedStrataWarp;
        const strata = Math.sin(strataPhase * Math.PI) * 0.5 + 0.5;
        const sBlend = strata * strataStr * 0.4;
        const sInv = 1 - sBlend;
        r = r * sInv + tCol.r * sBlend;
        g = g * sInv + tCol.g * sBlend;
        b = b * sInv + tCol.b * sBlend;
        const boundary = Math.abs(Math.cos(strataPhase * Math.PI));
        if (boundary > 0.97) {
          const lineStr = (boundary - 0.97) * 33 * strataStr * 0.3;
          r -= lineStr; g -= lineStr; b -= lineStr;
        }
      }

      // ── Mineral inclusions ──
      if (hasMinerals) {
        const threshold = 1 - mineralDens * 0.5;
        const mnrlBright = noise.noise3D(nx * 28, ny * 28, 7.7);
        if (mnrlBright > threshold) {
          const mp = (mnrlBright - threshold) / (1 - threshold);
          const mp2 = mp * mp;
          r += mp2 * 0.35; g += mp2 * 0.30; b += mp2 * 0.25;
        }
        const mnrlDark = noise.noise3D(nx * 32, ny * 32, 11.3);
        if (mnrlDark > threshold) {
          const mp = (mnrlDark - threshold) / (1 - threshold);
          const mp2 = mp * mp;
          r -= mp2 * 0.25; g -= mp2 * 0.22; b -= mp2 * 0.18;
        }
        const mnrlFleck = noise.noise3D(nx * 45, ny * 45, 19.1);
        if (mnrlFleck > threshold + 0.15) {
          const fp = (mnrlFleck - threshold - 0.15) * 6;
          r += fp * 0.15; g += fp * 0.18; b += fp * 0.2;
        }
      }

      // ── Rock-type specific patterns ──
      if (isGranite) {
        const speckle = noise.noise3D(nx * 20, ny * 20, 0);
        if (speckle > 0.4) {
          const sp = (speckle - 0.4) * 1.5;
          const spInv = 1 - sp;
          r = r * spInv + sp; g = g * spInv + sp; b = b * spInv + sp;
        }
      }
      if (isMarble) {
        const vein = Math.sin((nx * 4 + noise.fbm(nx * 2, ny * 2, 0, 2, 2, 0.5) * 3) * Math.PI);
        const veinStrength = vein > 0 ? Math.pow(vein, 8) * 0.7 : 0;
        r -= veinStrength * 0.3; g -= veinStrength * 0.3; b -= veinStrength * 0.25;
        const vein2 = Math.sin((nx * 8 + ny * 3 + noise.noise3D(nx * 5, ny * 5, 2.2) * 2) * Math.PI);
        const v2s = vein2 > 0 ? Math.pow(vein2, 12) * 0.25 : 0;
        r -= v2s * 0.2; g -= v2s * 0.18; b -= v2s * 0.15;
      }
      if (isSlate) {
        const foliation = noise.noise3D(nx * 2, ny * 15, 4.4) * 0.5 + 0.5;
        r += (foliation - 0.5) * 0.06;
        g += (foliation - 0.5) * 0.04;
        b += (foliation - 0.5) * 0.05;
      }
      if (isSandstone) {
        const sandGrain = noise.noise3D(nx * 35, ny * 35, 6.6);
        const sg = Math.abs(sandGrain) * 0.08;
        r += (sandGrain > 0 ? sg : -sg * 0.7);
        g += (sandGrain > 0 ? sg * 0.9 : -sg * 0.6);
        b += (sandGrain > 0 ? sg * 0.7 : -sg * 0.5);
      }
      let cachedBasaltVesicle = null;
      if (isBasalt) {
        const vRaw = noise.worley3DRaw(nx * 12, ny * 12, 2.8);
        cachedBasaltVesicle = vRaw.f1sq;
        if (vRaw.f1sq < 0.0064) {
          const f1 = Math.sqrt(vRaw.f1sq);
          const vStr = (0.08 - f1) * 12;
          r -= vStr * 0.05; g -= vStr * 0.05; b -= vStr * 0.04;
        }
      }
      if (isObsidian) {
        const flow = Math.sin((nx * 3 + ny * 0.5 + noise.noise3D(nx * 2, ny * 2, 8.1) * 1.5) * Math.PI * 2);
        const flowStr = flow * 0.04;
        r += flowStr; g += flowStr; b += flowStr * 1.3;
      }
      if (isMossy) {
        const moss = noise.fbm(nx * 1.5, ny * 1.5, 3.3, 3, 2, 0.5) * 0.5 + 0.5;
        if (moss > 0.4) {
          const mp = (moss - 0.4) * 1.5;
          const mpInv = 1 - mp;
          r = r * mpInv + 0.25 * mp;
          g = g * mpInv + 0.45 * mp;
          b = b * mpInv + 0.15 * mp;
        }
      }

      // ── Weathering / patina ──
      let cachedWeatherNoise = 0;
      if (hasWeather) {
        cachedWeatherNoise = noise.noise3D(nx * 0.8, ny * 0.8, 5.3) * 0.5 + 0.5;
        const weatherNoise = cachedWeatherNoise;
        const wBlend = weatherNoise * weatherAmt * 0.35;
        const avg = (r + g + b) / 3;
        r = r * (1 - wBlend) + (avg * 0.95 + 0.08) * wBlend;
        g = g * (1 - wBlend) + (avg * 0.90 + 0.05) * wBlend;
        b = b * (1 - wBlend) + (avg * 0.80 + 0.02) * wBlend;
        const stain = noise.noise3D(nx * 2.5, ny * 2.5, 9.1) * 0.5 + 0.5;
        if (stain > 0.6) {
          const sStr2 = (stain - 0.6) * 2.5 * weatherAmt * 0.15;
          r += sStr2 * 0.06; g += sStr2 * 0.02; b -= sStr2 * 0.03;
        }
      }

      // Clamp and write diffuse
      dData[idx]   = (r < 0 ? 0 : r > 1 ? 255 : (r * 255) | 0);
      dData[idx+1] = (g < 0 ? 0 : g > 1 ? 255 : (g * 255) | 0);
      dData[idx+2] = (b < 0 ? 0 : b > 1 ? 255 : (b * 255) | 0);
      dData[idx+3] = 255;

      // ── Normal map ──
      const hC = noise.fbm(nx, ny, 0.5, normOctaves, 2, 0.5);
      const hR = noise.fbm(nx + eps, ny, 0.5, normOctaves, 2, 0.5);
      const hD = noise.fbm(nx, ny + eps, 0.5, normOctaves, 2, 0.5);
      let ndx = (hC - hR) * bumpStrength;
      let ndy = (hC - hD) * bumpStrength;

      const mns = microNormScale;
      const mnStr = microNormStrength;
      if (mnStr > 0) {
        const mhC = noise.noise3D(nx * mns, ny * mns, 2.3);
        const mhR = noise.noise3D((nx + eps) * mns, ny * mns, 2.3);
        const mhD = noise.noise3D(nx * mns, (ny + eps) * mns, 2.3);
        ndx += (mhC - mhR) * mnStr;
        ndy += (mhC - mhD) * mnStr;
      }

      if (hasCrackNorm) {
        const cn = Math.abs(noise.noise3D(nx * crackDens, ny * crackDens, 3.7));
        if (cn < crackW * 2) {
          const cnR = Math.abs(noise.noise3D((nx + eps) * crackDens, ny * crackDens, 3.7));
          const cnD = Math.abs(noise.noise3D(nx * crackDens, (ny + eps) * crackDens, 3.7));
          ndx += (cn - cnR) * crackNormStr;
          ndy += (cn - cnD) * crackNormStr;
        }
      }

      if (hasGrain && grainWorley) {
        const gw = grainWorley;
        if (gw.f1 > 0.001) {
          const gdx = (nx * grainSc - gw.cpx) / gw.f1;
          const gdy = (ny * grainSc - gw.cpy) / gw.f1;
          const edgeFactor = Math.max(0, 1 - gw.edge * 5) * grainStr;
          ndx += gdx * edgeFactor * 0.6;
          ndy += gdy * edgeFactor * 0.6;
        }
      }

      if (hasStrata) {
        const shD = Math.cos((ny - eps * 0.5) * 6 * Math.PI + cachedStrataWarp * Math.PI);
        const shU = Math.cos((ny + eps * 0.5) * 6 * Math.PI + cachedStrataWarp * Math.PI);
        ndy += (shD - shU) * strataStr * 1.2;
      }

      const nLen = Math.sqrt(ndx * ndx + ndy * ndy + 1);
      const nnx = ndx / nLen * 0.5 + 0.5;
      const nny = ndy / nLen * 0.5 + 0.5;
      const nnz = 1 / nLen * 0.5 + 0.5;
      nData[idx]   = (nnx * 255) | 0;
      nData[idx+1] = (nny * 255) | 0;
      nData[idx+2] = (nnz * 255) | 0;
      nData[idx+3] = 255;

      // ── Height map (stored in roughness alpha) ──
      let heightVal = (hC + hR + hD) / 3 * 0.5 + 0.5;
      if (hasGrain && grainWorley) heightVal += (grainWorley.f1 - 0.3) * grainStr * 0.2;
      if (hasStrata) {
        const sp = ny * 6 + cachedStrataWarp;
        heightVal += Math.sin(sp * Math.PI) * strataStr * 0.08;
      }
      heightVal = heightVal < 0 ? 0 : heightVal > 1 ? 1 : heightVal;

      // ── Roughness map ──
      const n3 = noise.noise3D(nx * 3, ny * 3, 1.7) * 0.5 + 0.5;
      let rv = roughnessBase + (n3 - 0.5) * roughVar * 2;
      if (hasGrain && grainWorley) {
        const edgeSmooth = Math.min(grainWorley.edge * 5, 1);
        rv += (1 - edgeSmooth) * roughVar * 0.4;
      }
      if (hasWeather) rv += cachedWeatherNoise * weatherAmt * 0.12;
      if (isBasalt && cachedBasaltVesicle !== null && cachedBasaltVesicle < 0.0064) rv -= 0.15;
      if (isObsidian) rv += Math.sin((nx * 3 + ny * 0.5) * Math.PI * 2) * 0.05;
      const rc = (rv < 0 ? 0 : rv > 1 ? 255 : (rv * 255) | 0);
      const hc = (heightVal * 255) | 0;
      rData[idx] = rc;
      rData[idx+1] = rc;
      rData[idx+2] = rc;
      rData[idx+3] = hc;
    }
  }

  dCtx.putImageData(dImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const diffuseTexture = new THREE.CanvasTexture(diffuseCanvas);
  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  const roughnessTexture = new THREE.CanvasTexture(roughCanvas);

  [diffuseTexture, normalTexture, roughnessTexture].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    t.colorSpace = t === diffuseTexture ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  });

  return { diffuseTexture, normalTexture, roughnessTexture };
}
