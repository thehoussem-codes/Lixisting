import * as THREE from 'three';

/**
 * Textures dessinées par code (aucune image importée) : petites, à gros pixels,
 * pour le rendu rétro. Elles sont GÉNÉRIQUES et ne reproduisent pas de lieu précis.
 */
function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  return [element, element.getContext('2d')!];
}

export type FacadeStyle = 'apartment' | 'house' | 'modern';

/** Un motif = une travée de mur (3,2 m de large) sur un étage (3 m de haut). */
export function createFacadeTexture(style: FacadeStyle): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  if (style === 'apartment') {
    ctx.fillStyle = '#d6d6d6'; ctx.fillRect(0, 60, 64, 4);     // dalle entre étages
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(18, 10, 28, 36);   // encadrement
    ctx.fillStyle = '#35506a'; ctx.fillRect(21, 13, 22, 30);   // vitre
    ctx.fillStyle = '#5f7f9c'; ctx.fillRect(21, 13, 22, 9);    // reflet
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(31, 13, 2, 30);    // montant
    ctx.fillStyle = '#c4c4c4'; ctx.fillRect(10, 46, 44, 4);    // dalle du balcon
    ctx.fillStyle = '#7d7d7d';                                 // garde-corps
    for (let x = 11; x < 54; x += 5) ctx.fillRect(x, 38, 1, 8);
    ctx.fillRect(10, 37, 44, 1);
  } else if (style === 'house') {
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, 61, 64, 3);
    ctx.fillStyle = '#3f5d4a'; ctx.fillRect(16, 18, 9, 26); ctx.fillRect(39, 18, 9, 26); // volets
    ctx.fillStyle = '#2f4458'; ctx.fillRect(25, 18, 14, 26);   // vitre
    ctx.fillStyle = '#d8d2c4'; ctx.fillRect(31, 18, 2, 26);
    ctx.fillStyle = '#bdb7aa'; ctx.fillRect(22, 44, 20, 3);    // appui
  } else {
    ctx.fillStyle = '#c9ced3'; ctx.fillRect(0, 56, 64, 8);     // allège
    ctx.fillStyle = '#2c4a63'; ctx.fillRect(2, 8, 60, 46);     // bandeau vitré
    ctx.fillStyle = '#4f7391'; ctx.fillRect(2, 8, 60, 12);
    ctx.fillStyle = '#aab2ba'; ctx.fillRect(0, 8, 2, 48); ctx.fillRect(62, 8, 2, 48); ctx.fillRect(31, 8, 2, 46);
  }
  return finish(element);
}

/** Chaussée : asphalte moucheté ; avec lignes de rive et ligne centrale pour les grands axes. */
export function createRoadTexture(major: boolean): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 128);
  ctx.fillStyle = major ? '#43444a' : '#4b4c52';
  ctx.fillRect(0, 0, 64, 128);
  let seed = major ? 11 : 29;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(Math.floor(random() * 64), Math.floor(random() * 128), 2, 2);
  }
  ctx.fillStyle = '#2f3035'; ctx.fillRect(0, 0, 2, 128); ctx.fillRect(62, 0, 2, 128); // caniveau
  if (major) {
    ctx.fillStyle = '#e8e6da';
    ctx.fillRect(4, 0, 1, 128); ctx.fillRect(59, 0, 1, 128);  // lignes de rive
    ctx.fillRect(31, 0, 2, 48);                                // ligne centrale discontinue
  }
  const texture = finish(element);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Trottoir : dalles claires. */
export function createPavementTexture(): THREE.CanvasTexture {
  const [element, ctx] = canvas(32, 32);
  ctx.fillStyle = '#c9c2b4'; ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#b3ac9e';
  ctx.fillRect(0, 0, 32, 1); ctx.fillRect(0, 16, 32, 1); ctx.fillRect(0, 0, 1, 32); ctx.fillRect(16, 0, 1, 32);
  return finish(element);
}
