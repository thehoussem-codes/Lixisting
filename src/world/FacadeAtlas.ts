import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACADE_WIDTH, type FacadeStyle, createFacadeTexture } from './Textures';

/**
 * Atlas des façades : toutes les textures de façade réunies dans une seule image, pour dessiner tous les murs
 * d'un bloc de ville en un seul envoi au processeur graphique (au lieu d'un par style : 10 à 20 par bloc).
 *
 * Chaque sommet porte le rectangle de son style dans l'atlas (attribut `atlas`) ; le shader replie la coordonnée
 * de texture dans ce rectangle (comme une texture qui se répète) et choisit le niveau de détail d'après la
 * coordonnée non repliée (textureGrad), sinon une ligne apparaîtrait à chaque répétition.
 * Une marge de 8 pixels autour de chaque case recopie le bord opposé : le filtrage ne mélange pas deux styles.
 */
const GUTTER = 8;
const ATLAS_WIDTH = 2048;

let atlas: { material: THREE.MeshLambertMaterial; rects: Map<FacadeStyle, [number, number, number, number]> } | null = null;

function buildAtlas(): NonNullable<typeof atlas> {
  const styles = Object.keys(FACADE_WIDTH) as FacadeStyle[];
  const images = styles.map((style) => {
    const texture = createFacadeTexture(style);
    const image = texture.image as HTMLCanvasElement;
    texture.dispose();
    // Cases de 256 px de haut au plus (1024 de large pour les rez-de-chaussée) : même finesse qu'avant.
    const scale = Math.min(1, 256 / image.height, 1024 / image.width);
    return { style, image, w: Math.round(image.width * scale), h: Math.round(image.height * scale) };
  });
  // Rangement en étagères, les plus hautes d'abord.
  const order = [...images].sort((a, b) => b.h - a.h || b.w - a.w);
  const placed = new Map<FacadeStyle, { x: number; y: number }>();
  let x = 0, y = 0, shelf = 0;
  for (const item of order) {
    const w = item.w + GUTTER * 2, h = item.h + GUTTER * 2;
    if (x + w > ATLAS_WIDTH) { x = 0; y += shelf; shelf = 0; }
    placed.set(item.style, { x: x + GUTTER, y: y + GUTTER });
    x += w; shelf = Math.max(shelf, h);
  }
  const height = 1 << Math.ceil(Math.log2(y + shelf));
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rects = new Map<FacadeStyle, [number, number, number, number]>();
  for (const item of images) {
    const at = placed.get(item.style)!;
    ctx.save();
    ctx.beginPath(); ctx.rect(at.x - GUTTER, at.y - GUTTER, item.w + GUTTER * 2, item.h + GUTTER * 2); ctx.clip();
    for (const dx of [-item.w, 0, item.w]) for (const dy of [-item.h, 0, item.h]) ctx.drawImage(item.image, at.x + dx, at.y + dy, item.w, item.h);
    ctx.restore();
    // Rectangle en coordonnées de texture (l'image est retournée à l'envoi : v = 0 en bas).
    rects.set(item.style, [at.x / ATLAS_WIDTH, 1 - (at.y + item.h) / height, item.w / ATLAS_WIDTH, item.h / height]);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: texture, name: 'facade:atlas' });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 atlas;\nvarying vec4 vAtlas;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAtlas = atlas;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vAtlas;')
      .replace('#include <map_fragment>', `
        vec2 atlasUv = vAtlas.xy + fract(vMapUv) * vAtlas.zw;
        vec4 sampledDiffuseColor = textureGrad(map, atlasUv, dFdx(vMapUv) * vAtlas.zw, dFdy(vMapUv) * vAtlas.zw);
        diffuseColor *= sampledDiffuseColor;`);
  };
  material.customProgramCacheKey = () => 'facade-atlas';
  return { material, rects };
}

/** Le matériau commun des façades (atlas). */
export function facadeAtlasMaterial(): THREE.MeshLambertMaterial {
  return (atlas ??= buildAtlas()).material;
}

/**
 * Réunit les murs de plusieurs styles (géométries de MeshBuilder : position, couleur, uv, normale) en une seule
 * géométrie pour le matériau de l'atlas. Les géométries d'entrée sont libérées.
 */
export function mergeFacades(parts: [FacadeStyle, THREE.BufferGeometry][]): THREE.BufferGeometry | null {
  const { rects } = (atlas ??= buildAtlas());
  const list: THREE.BufferGeometry[] = [];
  for (const [style, geometry] of parts) {
    const count = geometry.attributes.position.count;
    if (!count) continue;
    const rect = rects.get(style)!;
    const values = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) values.set(rect, i * 4);
    geometry.setAttribute('atlas', new THREE.BufferAttribute(values, 4));
    // Index 32 bits partout : mergeGeometries exige le même type d'index.
    if (geometry.index && !(geometry.index.array instanceof Uint32Array)) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(geometry.index.array), 1));
    list.push(geometry);
  }
  if (!list.length) return null;
  const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (list.length > 1) for (const geometry of list) geometry.dispose();
  if (!merged) return null;
  // Retour à des index 16 bits quand c'est possible (moitié moins de mémoire).
  if (merged.attributes.position.count <= 65535 && merged.index) merged.setIndex(new THREE.BufferAttribute(Uint16Array.from(merged.index.array), 1));
  return merged;
}
