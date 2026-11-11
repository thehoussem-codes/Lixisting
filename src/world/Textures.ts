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

export type FacadeStyle = 'apartment' | 'house' | 'tower' | 'school' | 'public' | 'industrial' | 'mosque' | 'shop' | 'ground' | 'colonial' | 'arcade' | 'station';

/** Largeur réelle (m) couverte par un motif : 4 travées pour les rez-de-chaussée, 1 sinon. */
export const FACADE_WIDTH: Record<FacadeStyle, number> = {
  apartment: 3.2, house: 3.2, tower: 3.2, school: 4, public: 3.2, industrial: 3, mosque: 4, shop: 12.8, ground: 12.8,
  colonial: 3, arcade: 3.4, station: 5,
};

export function createFacadeTexture(style: FacadeStyle): THREE.CanvasTexture {
  const wide = style === 'shop' || style === 'ground';
  const [element, ctx] = canvas(wide ? 256 : 64, 64);
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
    case 'colonial': // immeuble haussmannien du Cours : haute fenêtre à encadrement doré, persiennes, corniche
      rect('#e9c66a', 0, 0, 64, 3); rect('#f4f0e4', 0, 3, 64, 2);                 // corniche dorée entre étages
      rect('#e3bd55', 19, 9, 26, 3); rect('#e3bd55', 19, 9, 2, 46); rect('#e3bd55', 43, 9, 2, 46); // encadrement
      rect('#dfe3e6', 21, 12, 22, 43);                                           // menuiserie claire
      rect('#3a4f60', 23, 14, 8, 39); rect('#3a4f60', 33, 14, 8, 39);            // vitres
      rect('#6f8798', 23, 14, 8, 8); rect('#6f8798', 33, 14, 8, 8);
      rect('#e3bd55', 28, 4, 8, 5);                                              // clef sculptée au-dessus de la baie
      rect('#d9d4c6', 0, 58, 64, 6);                                             // nez de dalle du balcon
      break;
    case 'arcade': // rez-de-chaussée à arcades : piliers de pierre, baies sombres en retrait
      rect('#d9d2c0', 0, 0, 64, 7); rect('#c2baa6', 0, 7, 64, 2);
      rect('#1f2529', 12, 14, 40, 50);
      ctx.fillStyle = '#1f2529'; ctx.beginPath(); ctx.arc(32, 16, 20, Math.PI, 0); ctx.fill();
      rect('#34424c', 16, 30, 32, 34); rect('#56493a', 20, 36, 10, 28); rect('#2f6f9f', 16, 26, 32, 5);
      rect('#cfc7b3', 0, 9, 12, 55); rect('#cfc7b3', 52, 9, 12, 55);             // piliers
      rect('#b8b09c', 0, 56, 12, 8); rect('#b8b09c', 52, 56, 12, 8);
      break;
    case 'station': { // gare : grande baie en arc à claustra blanc et vert
      rect('#efe6d2', 0, 0, 64, 64);
      ctx.fillStyle = '#f7f5ee'; ctx.beginPath(); ctx.arc(32, 26, 21, Math.PI, 0); ctx.fill(); ctx.fillRect(11, 26, 42, 34);
      ctx.fillStyle = '#5c9a7a'; ctx.beginPath(); ctx.arc(32, 26, 18, Math.PI, 0); ctx.fill(); ctx.fillRect(14, 26, 36, 34);
      ctx.fillStyle = '#f7f5ee';
      for (let y = 10; y < 60; y += 5) ctx.fillRect(14, y, 36, 1);
      for (let x = 16; x < 50; x += 5) ctx.fillRect(x, 8, 1, 52);
      ctx.fillStyle = '#26333a'; ctx.fillRect(22, 34, 20, 26); ctx.fillStyle = '#f7f5ee'; ctx.fillRect(31, 34, 2, 26);
      rect('#d8cdb4', 0, 60, 64, 4);
      break;
    }
    case 'shop': // 4 travées : vitrine avec enseigne, entrée d'immeuble, rideau baissé, vitrine à store
      rect('#e6e2d8', 0, 0, 256, 5);
      rect('#2f6f9f', 6, 8, 52, 9); rect('#e9eef2', 12, 11, 40, 3);
      rect('#1d2a33', 8, 20, 48, 42); rect('#3d5566', 10, 22, 28, 32); rect('#6b5a45', 40, 22, 14, 40);
      rect('#b9b2a2', 82, 14, 28, 50); rect('#5b4632', 85, 17, 22, 47); rect('#3d2f22', 95, 17, 2, 47);
      rect('#8f979d', 134, 18, 52, 44); for (let y = 20; y < 62; y += 4) rect('#737b81', 134, y, 52, 1);
      rect('#a8432f', 198, 8, 52, 9); rect('#f4e9d8', 204, 11, 40, 3);
      rect('#1d2a33', 200, 24, 48, 38); rect('#3d5566', 202, 26, 44, 28);
      for (let x = 198; x < 250; x += 8) { rect('#c9482f', x, 17, 4, 7); rect('#f1ead9', x + 4, 17, 4, 7); }
      rect('#5a5a5a', 0, 62, 256, 2);
      break;
    case 'ground': // 4 travées d'habitation : une porte d'entrée, trois fenêtres à barreaux
      rect('#dcd6c8', 0, 0, 256, 5);
      rect('#b9b2a2', 20, 14, 26, 50); rect('#5b4632', 23, 17, 20, 47); rect('#3d2f22', 32, 17, 2, 47); rect('#c8b27a', 36, 40, 2, 3);
      for (const x0 of [83, 147, 211]) {
        rect('#9aa0a6', x0, 20, 26, 24); rect('#2f4458', x0 + 3, 23, 20, 18);
        for (let x = x0 + 5; x < x0 + 23; x += 4) rect('#444444', x, 23, 1, 18);
      }
      rect('#cfc8b8', 0, 58, 256, 6);
      break;
  }
  return finish(element);
}

/** Garde-corps en fer forgé : barreaux noirs sur fond transparent. */
export function createRailTexture(): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = 32; element.height = 32;
  const ctx = element.getContext('2d')!;
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, 32, 3); ctx.fillRect(0, 27, 32, 3);
  for (let x = 2; x < 32; x += 6) ctx.fillRect(x, 0, 2, 30);
  ctx.beginPath(); ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 1.5;
  for (let x = 0; x < 32; x += 12) { ctx.moveTo(x, 20); ctx.quadraticCurveTo(x + 6, 6, x + 12, 20); }
  ctx.stroke();
  return finish(element);
}

/** Cadran d'horloge (tour de la gare). */
export function createClockTexture(): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = element.height = 64;
  const ctx = element.getContext('2d')!;
  ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4efe0'; ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillRect(31 + Math.sin(a) * 23, 31 - Math.cos(a) * 23, 2, 2); }
  ctx.strokeStyle = '#222'; ctx.lineCap = 'round';
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32 - 9, 32 - 9); ctx.stroke();   // 10 h
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32 + 14, 32 - 12); ctx.stroke();  // 10
  return finish(element);
}

/** Asphalte moucheté, sans aucun marquage. */
function asphalt(ctx: CanvasRenderingContext2D, width: number, height: number, base: string, seed: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < (width * height) / 9; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(Math.floor(random() * width), Math.floor(random() * height), 2, 2);
  }
}

/** Enrobé nu des carrefours. */
export function createAsphaltTexture(): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 64);
  asphalt(ctx, 64, 64, '#47484e', 53);
  return finish(element);
}

/**
 * Chaussée. Les bords portent la bordure de trottoir : béton gris par défaut,
 * peinte en rouge et blanc seulement sur les grands axes (painted = vrai).
 * Les grands axes ont aussi des lignes de rive et une ligne centrale discontinue.
 */
export function createRoadTexture(major: boolean, painted = false): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 128);
  asphalt(ctx, 64, 128, major ? '#43444a' : '#4b4c52', major ? 11 : 29);
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = painted ? ((y / 16) % 2 === 0 ? '#c23b2e' : '#ecebe4') : ((y / 16) % 2 === 0 ? '#b4b1a9' : '#aaa79f');
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

/** Trottoir. Ordinaire : dalles de béton gris. Soigné (avenues, places) : pavage bicolore. */
export function createPavementTexture(fine = false): THREE.CanvasTexture {
  const [element, ctx] = canvas(32, 32);
  if (fine) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#cfc6b4' : '#b9ad98';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 32; i += 8) { ctx.fillRect(i, 0, 1, 32); ctx.fillRect(0, i, 32, 1); }
  } else {
    ctx.fillStyle = '#b7b5ae'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#a3a19a';
    ctx.fillRect(0, 0, 32, 1); ctx.fillRect(0, 16, 32, 1); ctx.fillRect(0, 0, 1, 32); ctx.fillRect(16, 0, 1, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(3, 3, 9, 9); ctx.fillRect(20, 19, 8, 8);
  }
  return finish(element);
}
