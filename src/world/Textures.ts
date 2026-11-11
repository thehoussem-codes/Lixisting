import * as THREE from 'three';

/**
 * Textures dessinées par code (aucune image importée) : petites, à gros pixels,
 * pour le rendu rétro. Elles donnent un STYLE par type de bâtiment ; elles ne
 * reproduisent pas la façade réelle d'un lieu précis.
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
  const ctx = element.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return [element, ctx];
}

export type FacadeStyle = 'apartment' | 'house' | 'tower' | 'school' | 'public' | 'industrial' | 'mosque' | 'shop' | 'ground';

/** Largeur réelle (m) couverte par un motif : 2 travées pour les rez-de-chaussée, 1 sinon. */
export const FACADE_WIDTH: Record<FacadeStyle, number> = {
  apartment: 3.2, house: 3.2, tower: 3.2, school: 4, public: 3.2, industrial: 3, mosque: 4, shop: 6.4, ground: 6.4,
};

export function createFacadeTexture(style: FacadeStyle): THREE.CanvasTexture {
  const wide = style === 'shop' || style === 'ground';
  const [element, ctx] = canvas(wide ? 128 : 64, 64);
  const rect = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  switch (style) {
    case 'apartment': // fenêtre + balcon à garde-corps
      rect('#d6d6d6', 0, 60, 64, 4);
      rect('#9aa0a6', 18, 10, 28, 36); rect('#35506a', 21, 13, 22, 30); rect('#5f7f9c', 21, 13, 22, 9); rect('#9aa0a6', 31, 13, 2, 30);
      rect('#c4c4c4', 10, 46, 44, 4);
      for (let x = 11; x < 54; x += 5) rect('#7d7d7d', x, 38, 1, 8);
      rect('#7d7d7d', 10, 37, 44, 1);
      break;
    case 'house': // petite fenêtre à volets
      rect('#e4e4e4', 0, 61, 64, 3);
      rect('#3f5d4a', 16, 18, 9, 26); rect('#3f5d4a', 39, 18, 9, 26);
      rect('#2f4458', 25, 18, 14, 26); rect('#d8d2c4', 31, 18, 2, 26); rect('#bdb7aa', 22, 44, 20, 3);
      break;
    case 'tower': // bandeau vitré
      rect('#c9ced3', 0, 56, 64, 8); rect('#2c4a63', 2, 8, 60, 46); rect('#4f7391', 2, 8, 60, 12);
      rect('#aab2ba', 0, 8, 2, 48); rect('#aab2ba', 62, 8, 2, 48); rect('#aab2ba', 31, 8, 2, 46);
      break;
    case 'school': // grandes baies de salle de classe, allège colorée
      rect('#b8693f', 0, 50, 64, 14);
      rect('#e9e4d6', 5, 8, 54, 40); rect('#3b5870', 7, 10, 50, 36); rect('#62829e', 7, 10, 50, 10);
      for (const x of [23, 40]) rect('#e9e4d6', x, 10, 2, 36);
      rect('#e9e4d6', 7, 27, 50, 2);
      break;
    case 'public': // style colonial : haute fenêtre à persiennes, corniche
      rect('#e3dccb', 0, 0, 64, 4); rect('#cfc7b4', 0, 4, 64, 1); rect('#e3dccb', 0, 60, 64, 4);
      rect('#d9d2c0', 17, 9, 30, 42);
      rect('#58788a', 20, 12, 11, 36); rect('#58788a', 33, 12, 11, 36);
      for (let y = 14; y < 48; y += 3) { rect('#466273', 20, y, 11, 1); rect('#466273', 33, y, 11, 1); }
      rect('#555555', 14, 49, 36, 1); for (let x = 15; x < 50; x += 4) rect('#555555', x, 43, 1, 6);
      break;
    case 'industrial': // tôle ondulée
      for (let x = 0; x < 64; x += 4) { rect('#ededed', x, 0, 2, 64); rect('#cfcfcf', x + 2, 0, 2, 64); }
      rect('#bdbdbd', 0, 60, 64, 4);
      break;
    case 'mosque': { // fenêtre en arc
      rect('#efeee8', 0, 60, 64, 4);
      ctx.fillStyle = '#2f6b4f';
      ctx.beginPath(); ctx.arc(32, 24, 9, Math.PI, 0); ctx.fill(); ctx.fillRect(23, 24, 18, 24);
      ctx.fillStyle = '#17362a';
      ctx.beginPath(); ctx.arc(32, 25, 6, Math.PI, 0); ctx.fill(); ctx.fillRect(26, 25, 12, 21);
      break;
    }
    case 'shop': // deux commerces : rideau métallique fermé, vitrine ouverte avec store
      rect('#e6e2d8', 0, 0, 128, 6);
      rect('#2f6f9f', 4, 8, 56, 10); rect('#e9eef2', 10, 11, 44, 4);
      rect('#8f979d', 6, 20, 52, 42); for (let y = 22; y < 62; y += 4) rect('#737b81', 6, y, 52, 1);
      rect('#a8432f', 68, 8, 56, 10); rect('#f4e9d8', 74, 11, 44, 4);
      rect('#1d2a33', 70, 24, 52, 38); rect('#3d5566', 72, 26, 22, 30); rect('#6b5a45', 98, 26, 22, 36);
      for (let x = 68; x < 124; x += 8) { rect('#c9482f', x, 18, 4, 7); rect('#f1ead9', x + 4, 18, 4, 7); }
      rect('#5a5a5a', 0, 62, 128, 2);
      break;
    case 'ground': // rez-de-chaussée d'habitation : porte d'entrée, fenêtre à barreaux
      rect('#dcd6c8', 0, 0, 128, 5);
      rect('#b9b2a2', 20, 14, 26, 50); rect('#5b4632', 23, 17, 20, 47); rect('#3d2f22', 32, 17, 2, 47); rect('#c8b27a', 36, 40, 2, 3);
      rect('#9aa0a6', 82, 20, 26, 24); rect('#2f4458', 85, 23, 20, 18);
      for (let x = 87; x < 105; x += 4) rect('#444444', x, 23, 1, 18);
      rect('#cfc8b8', 0, 58, 128, 6);
      break;
  }
  return finish(element);
}

/**
 * Chaussée : asphalte moucheté, bordures de trottoir peintes en rouge et blanc
 * (usage courant en Algérie : hypothèse de style, à confirmer rue par rue),
 * lignes de rive et ligne centrale discontinue pour les grands axes.
 */
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
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = (y / 16) % 2 === 0 ? '#c23b2e' : '#ecebe4';
    ctx.fillRect(0, y, 2, 16); ctx.fillRect(62, y, 2, 16);
  }
  if (major) {
    ctx.fillStyle = '#e8e6da';
    ctx.fillRect(5, 0, 1, 128); ctx.fillRect(58, 0, 1, 128);
    ctx.fillRect(31, 0, 2, 48);
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
