/**
 * Rock type & shape presets.
 *
 * ── Adding a new rock type ──
 * 1. Add an entry to `rockPresets` below with primary/secondary colors & PBR values.
 * 2. Add a matching <option> to the #rockType <select> in index.html.
 *
 * ── Adding a new shape preset ──
 * 1. Add an entry to `shapePresets` below with the parameter overrides you want.
 * 2. Add a matching <option> to the #shapePreset <select> in index.html.
 *
 * @module presets
 */

// ── Rock Type Presets ───────────────────────────────────────────────────
export const rockPresets = {
  granite:    { primary: '#8a8a7e', secondary: '#5e5e52', metalness: 0.05, roughnessMap: 0.85 },
  sandstone:  { primary: '#c4a56e', secondary: '#a88a4e', metalness: 0.02, roughnessMap: 0.95 },
  slate:      { primary: '#5a6068', secondary: '#3e444a', metalness: 0.08, roughnessMap: 0.7  },
  limestone:  { primary: '#c8c0a8', secondary: '#a8a090', metalness: 0.03, roughnessMap: 0.9  },
  basalt:     { primary: '#3a3a3a', secondary: '#222222', metalness: 0.1,  roughnessMap: 0.75 },
  marble:     { primary: '#e8e4e0', secondary: '#c8c4c0', metalness: 0.15, roughnessMap: 0.4  },
  obsidian:   { primary: '#1a1a22', secondary: '#0a0a12', metalness: 0.6,  roughnessMap: 0.15 },
  mossy:      { primary: '#5a7a4a', secondary: '#3e5a32', metalness: 0.02, roughnessMap: 0.9  },
};

// ── Shape Presets (geological formations) ───────────────────────────────
export const shapePresets = {
  boulder: {
    baseShape:'sphere', widthScale:1.1, heightScale:0.9, depthScale:1.0,
    domainWarp:0.4, warpScale:1.2, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0, bulge:0,
    macroStrength:0.5, macroScale:0.9, macroRidge:0.3,
    mesoStrength:0.2, mesoScale:3, sharpness:0.2,
    flatness:0.3
  },
  slab: {
    baseShape:'box', widthScale:2.5, heightScale:0.25, depthScale:2.0,
    domainWarp:0.3, warpScale:1.5, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0, bulge:0,
    macroStrength:0.2, macroScale:1.0, macroRidge:0,
    mesoStrength:0.15, mesoScale:4, sharpness:0.4,
    flatness:0.8
  },
  stalactite: {
    baseShape:'cone', widthScale:0.4, heightScale:2.5, depthScale:0.4,
    domainWarp:0.25, warpScale:1.8, taperTop:0.8, taperBottom:0,
    twist:0.3, skewX:0.1, skewZ:0, concavity:0, bulge:-0.3,
    macroStrength:0.3, macroScale:1.2, macroRidge:0.2,
    mesoStrength:0.15, mesoScale:4, sharpness:0.1,
    flatness:0
  },
  stalagmite: {
    baseShape:'cone', widthScale:0.5, heightScale:2.0, depthScale:0.5,
    domainWarp:0.3, warpScale:1.5, taperTop:0.7, taperBottom:0,
    twist:0.2, skewX:0, skewZ:0.05, concavity:0, bulge:0.2,
    macroStrength:0.35, macroScale:1.0, macroRidge:0.25,
    mesoStrength:0.2, mesoScale:3.5, sharpness:0.15,
    flatness:0.5
  },
  column: {
    baseShape:'cylinder', widthScale:0.5, heightScale:3.0, depthScale:0.5,
    domainWarp:0.2, warpScale:1.0, taperTop:0.15, taperBottom:0.15,
    twist:0.4, skewX:0, skewZ:0, concavity:0, bulge:0.15,
    macroStrength:0.25, macroScale:0.8, macroRidge:0.1,
    mesoStrength:0.15, mesoScale:3, sharpness:0.1,
    flatness:0
  },
  ledge: {
    baseShape:'box', widthScale:2.5, heightScale:0.5, depthScale:1.2,
    domainWarp:0.35, warpScale:1.3, taperTop:0, taperBottom:0.3,
    twist:0, skewX:0, skewZ:-0.3, concavity:0.3, concavityDir:1, bulge:0,
    macroStrength:0.3, macroScale:1.0, macroRidge:0.2,
    mesoStrength:0.2, mesoScale:3.5, sharpness:0.3,
    flatness:0.6
  },
  overhang: {
    baseShape:'sphere', widthScale:1.8, heightScale:1.2, depthScale:1.0,
    domainWarp:0.5, warpScale:1.0, taperTop:0.4, taperBottom:0,
    twist:0, skewX:0.5, skewZ:0, concavity:0.6, concavityDir:1, bulge:0.3,
    macroStrength:0.4, macroScale:0.8, macroRidge:0.4,
    mesoStrength:0.2, mesoScale:3, sharpness:0.3,
    flatness:0.4
  },
  arch: {
    baseShape:'torus', widthScale:1.5, heightScale:1.5, depthScale:0.6,
    domainWarp:0.4, warpScale:1.2, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0, bulge:0,
    macroStrength:0.3, macroScale:1.0, macroRidge:0.3,
    mesoStrength:0.2, mesoScale:3, sharpness:0.2,
    flatness:0
  },
  spike: {
    baseShape:'cone', widthScale:0.25, heightScale:3.0, depthScale:0.25,
    domainWarp:0.15, warpScale:2.0, taperTop:0.9, taperBottom:0,
    twist:0.5, skewX:0.15, skewZ:0.1, concavity:0, bulge:-0.4,
    macroStrength:0.2, macroScale:1.5, macroRidge:0.15,
    mesoStrength:0.1, mesoScale:5, sharpness:0.1,
    flatness:0
  },
  rubble: {
    baseShape:'sphere', widthScale:0.8, heightScale:0.6, depthScale:1.1,
    domainWarp:0.7, warpScale:1.5, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0, bulge:0,
    macroStrength:0.6, macroScale:0.7, macroRidge:0.5,
    mesoStrength:0.3, mesoScale:3, sharpness:0.5,
    flatness:0.2
  },
  wall: {
    baseShape:'box', widthScale:3.0, heightScale:2.0, depthScale:0.3,
    domainWarp:0.5, warpScale:0.8, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0.4, concavityDir:4, bulge:0,
    macroStrength:0.35, macroScale:0.6, macroRidge:0.3,
    mesoStrength:0.25, mesoScale:3, sharpness:0.3,
    flatness:0
  },
  flowstone: {
    baseShape:'sphere', widthScale:1.5, heightScale:0.6, depthScale:1.3,
    domainWarp:0.6, warpScale:0.9, taperTop:0, taperBottom:0,
    twist:0, skewX:0, skewZ:0, concavity:0, bulge:0.4,
    macroStrength:0.3, macroScale:0.7, macroRidge:0,
    mesoStrength:0.15, mesoScale:2.5, sharpness:0,
    flatness:0.5
  },
};
