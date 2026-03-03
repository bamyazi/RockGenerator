/**
 * Shared utility functions used across multiple modules.
 *
 * @module utils
 */
import { collectEffectParams } from './geometry/post-process-registry.js';

/** Read a numeric value from a DOM input by id. */
export function getVal(id) {
  return parseFloat(document.getElementById(id).value);
}

/** Convert a hex colour string (#rrggbb) to normalised {r, g, b}. */
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/**
 * Collect all UI parameter values into a single plain object.
 * Used by the generator, exporters, and params save/load.
 */
export function collectParams() {
  return {
    baseShape: document.getElementById('baseShape').value,
    baseSize: getVal('baseSize'),
    widthScale: getVal('widthScale'),
    heightScale: getVal('heightScale'),
    depthScale: getVal('depthScale'),
    detail: Math.round(getVal('detail')),
    flatness: getVal('flatness'),
    domainWarp: getVal('domainWarp'),
    warpScale: getVal('warpScale'),
    warpOctaves: Math.round(getVal('warpOctaves')),
    taperTop: getVal('taperTop'),
    taperBottom: getVal('taperBottom'),
    twist: getVal('twist'),
    skewX: getVal('skewX'),
    skewZ: getVal('skewZ'),
    concavity: getVal('concavity'),
    concavityDir: Math.round(getVal('concavityDir')),
    bulge: getVal('bulge'),
    macroStrength: getVal('macroStrength'),
    macroScale: getVal('macroScale'),
    macroOctaves: Math.round(getVal('macroOctaves')),
    macroRidge: getVal('macroRidge'),
    mesoStrength: getVal('mesoStrength'),
    mesoScale: getVal('mesoScale'),
    mesoOctaves: Math.round(getVal('mesoOctaves')),
    mesoSubdivs: Math.round(getVal('mesoSubdivs')),
    sharpness: getVal('sharpness'),
    microStrength: getVal('microStrength'),
    microScale: getVal('microScale'),
    microOctaves: Math.round(getVal('microOctaves')),
    microSubdivs: Math.round(getVal('microSubdivs')),
    erosion: getVal('erosion'),
    crackAlgo: document.getElementById('crackAlgo').value,
    crackDepth: getVal('crackDepth'),
    crackWidth: getVal('crackWidth'),
    crackDensity: getVal('crackDensity'),
    crackSubdivs: Math.round(getVal('crackSubdivs')),
    pitting: getVal('pitting'),
    pitSize: getVal('pitSize'),
    bumpIntensity: getVal('bumpIntensity'),
    normalStrength: getVal('normalStrength'),
    microNormalScale: getVal('microNormalScale'),
    microNormalStrength: getVal('microNormalStrength'),
    rockType: document.getElementById('rockType').value,
    textureScale: getVal('textureScale'),
    colorVariation: getVal('colorVariation'),
    textureDetail: Math.round(getVal('textureDetail')),
    colorPrimary: document.getElementById('colorPrimary').value,
    colorSecondary: document.getElementById('colorSecondary').value,
    metalness: getVal('metalness'),
    roughnessMap: getVal('roughnessMap'),
    strataStrength: getVal('strataStrength'),
    mineralDensity: getVal('mineralDensity'),
    weathering: getVal('weathering'),
    grainScale: getVal('grainScale'),
    grainStrength: getVal('grainStrength'),
    roughnessVariation: getVal('roughnessVariation'),
    colorTertiary: document.getElementById('colorTertiary').value,
    sssStrength: getVal('sssStrength'),
    sssColor: document.getElementById('sssColor').value,
    useHDRI: document.getElementById('useHDRI').checked,
    seed: Math.round(getVal('seed')),
    enableDecimation: false,
    decimation: getVal('decimation'),
    // Merge in all registered post-process effect params
    ...collectEffectParams(),
  };
}

// ── Export helpers (shared by multiple exporters) ─────────────────────

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Convert a Three.js CanvasTexture to a PNG Blob (async). */
export async function texToBlob(tex) {
  const c = document.createElement('canvas');
  c.width = tex.image.width;
  c.height = tex.image.height;
  c.getContext('2d').drawImage(tex.image, 0, 0);
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}

/**
 * Build a Wavefront OBJ string from a Three.js BufferGeometry.
 * Shared by OBJ export, Godot export, and ZIP export.
 */
export function buildOBJString(geometry, comment = 'Rock Generator OBJ Export') {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const index = geometry.index;

  let obj = `# ${comment}\no Rock\n`;

  for (let i = 0; i < pos.count; i++)
    obj += `v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}\n`;
  if (norm)
    for (let i = 0; i < norm.count; i++)
      obj += `vn ${norm.getX(i)} ${norm.getY(i)} ${norm.getZ(i)}\n`;
  if (uv)
    for (let i = 0; i < uv.count; i++)
      obj += `vt ${uv.getX(i)} ${uv.getY(i)}\n`;

  const writeFace = (a, b, c) => {
    if (uv && norm) return `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`;
    if (norm)       return `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    return `f ${a} ${b} ${c}\n`;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3)
      obj += writeFace(index.getX(i)+1, index.getX(i+1)+1, index.getX(i+2)+1);
  } else {
    for (let i = 0; i < pos.count; i += 3)
      obj += writeFace(i+1, i+2, i+3);
  }

  return obj;
}
