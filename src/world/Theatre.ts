import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, cap, extrude, findFootprint, lowestGround } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Théâtre régional Azzedine Medjoubi (Cours de la Révolution, côté ouest, façade tournée vers l'est).
 *
 * Emprise : OpenStreetMap (way 341076691, « Théatre Azzedine Medjoubi »), avant-corps de la façade compris.
 * Apparence d'après les photos de Houssem (panorama du Cours, entrée de nuit de gala, carte postale ancienne) :
 * - grand volume blanc ivoire de style années 1950, angles avant arrondis, mince corniche plate débordante ;
 * - au centre, cadre blanc en saillie entourant cinq hautes baies vitrées bleues à petits bois blancs ;
 * - cartouche doré (armoiries en relief) au-dessus des baies ;
 * - rez-de-chaussée en retrait, jaune, porté par quatre colonnes jaunes, sous une marquise noire au bord
 *   arrondi portant le nom en lettres dorées ; perron de marches devant les portes ;
 * - derrière la façade, le comble en pyramide gris (carte postale) ;
 * - parvis dallé dégagé, sans arbre devant la façade ; potelets noirs à chaînes et lanternes au bord du trottoir.
 * Hauteurs mesurées à vue sur les photos (pas de relevé) : façade 18 m, corps 13 m, pyramide jusqu'à 23 m.
 */

export const THEATRE_NAME = 'المسرح الجهوي عز الدين مجوبي';
export const THEATRE_CENTROID: [number, number] = [72.1, 473.2]; // centre de l'emprise OSM dans annaba.json

const FRONT_X = 92.6;                 // façade principale (avant-corps OSM : x 82–93, n 459–487)
const FRONT_N0 = 459.5, FRONT_N1 = 486.5;
const IVORY = new THREE.Color(0xeee6d2);
const YELLOW = new THREE.Color(0xe2bd57);
const WHITE = new THREE.Color(0xf7f5ef);
const GOLD = new THREE.Color(0xc9a03c);
const STONE = new THREE.Color(0xd6d0c3);
const BLACK = new THREE.Color(0x1b1b1d);

/** Enduit ivoire lisse, très légèrement nuancé. */
function render(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
    let seed = 11;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(${170 + r() * 50},${160 + r() * 50},${140 + r() * 40},0.10)`; ctx.fillRect(r() * 128, r() * 128, 3 + r() * 12, 2 + r() * 6); }
    ctx.fillStyle = 'rgba(150,140,120,0.10)'; ctx.fillRect(0, 126, 128, 2); // joints d'enduit tous les 4 m
  });
}

/** Une haute baie : verre bleu réfléchissant, petits bois blancs (3 colonnes, 5 rangs). */
function windowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 192, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 192);
    g.addColorStop(0, '#6fa6dc'); g.addColorStop(0.5, '#3f78b8'); g.addColorStop(1, '#5d93cf');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 192);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(64, 0); ctx.lineTo(64, 30); ctx.lineTo(0, 80); ctx.fill();
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, 64, 4); ctx.fillRect(0, 188, 64, 4); ctx.fillRect(0, 0, 4, 192); ctx.fillRect(60, 0, 4, 192);
    for (const x of [21, 41]) ctx.fillRect(x, 0, 2, 192);
    for (const y of [38, 76, 114, 152]) ctx.fillRect(0, y, 64, 2);
  }, false);
}

/** Cartouche doré en relief (armoiries) : motif ornemental, sans texte inventé. */
function crestTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 96, (ctx) => {
    ctx.clearRect(0, 0, 256, 96);
    ctx.strokeStyle = '#a77c22'; ctx.fillStyle = '#d7b04c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(128, 48, 34, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0d27a'; ctx.beginPath(); ctx.ellipse(128, 48, 20, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#c99a33';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(128 + s * 36, 48);
      ctx.bezierCurveTo(128 + s * 70, 10, 128 + s * 100, 80, 128 + s * 124, 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128 + s * 40, 62);
      ctx.bezierCurveTo(128 + s * 70, 90, 128 + s * 96, 30, 128 + s * 118, 70); ctx.stroke();
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(128 + s * (56 + k * 18), 30 + (k % 2) * 36, 5, 0, Math.PI * 2); ctx.fillStyle = '#e3bd5c'; ctx.fill(); }
    }
  });
}

/** Bandeau noir de la marquise, nom du théâtre en lettres dorées. */
function marqueeTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 64, (ctx) => {
    ctx.fillStyle = '#18181a'; ctx.fillRect(0, 0, 1024, 64);
    ctx.fillStyle = '#b8902f'; ctx.fillRect(0, 2, 1024, 2); ctx.fillRect(0, 60, 1024, 2);
    ctx.fillStyle = '#e6c35c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Noto Naskh Arabic", "Geeza Pro", "Al Bayan", Arial, sans-serif';
    ctx.direction = 'rtl';
    ctx.fillText(THEATRE_NAME, 512, 34);
  }, false);
}

export interface Theatre { ground: (x: number, z: number) => number | null; keepTree: (x: number, n: number) => boolean; extra: ['ficus', number, number, number][]; }

export function buildTheatre(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): Theatre | null {
  const ring = findFootprint(data, THEATRE_CENTROID[0], THEATRE_CENTROID[1]);
  if (!ring) return null;
  const base = lowestGround(ring, ground) - 0.3;
  const front = ground(FRONT_X + 3, -473) + 0.2;      // trottoir du parvis
  const hall = front + 1.05;                            // niveau des portes, en haut du perron
  const shell = new MeshBuilder(), trim = new MeshBuilder();

  // --- Corps principal (salle et scène) : emprise OSM sans l'avant-corps, 13 m.
  void ring;
  const body: Ring = [[30, 492], [30, 455], [84, 455], [84, 492]]; // corps OSM (sans l'avant-corps)
  extrude(shell, body, base, base + 13, IVORY, 4, () => 1);
  cap(trim, body, base + 13, new THREE.Color(0xcfcac0), 1);
  extrude(trim, body, base + 12.7, base + 13.2, WHITE, 4, () => 1.01);

  // --- Avant-corps de façade, 18 m, angles avant arrondis (rayon 3 m).
  const R = 3, front0: Ring = [[78, FRONT_N0], [FRONT_X - R, FRONT_N0]];
  for (let k = 1; k < 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI / 2; front0.push([FRONT_X - R + Math.cos(a) * R, FRONT_N0 + R + Math.sin(a) * R]); }
  front0.push([FRONT_X, FRONT_N0 + R], [FRONT_X, FRONT_N1 - R]);
  for (let k = 1; k < 6; k++) { const a = (k / 6) * Math.PI / 2; front0.push([FRONT_X - R + Math.cos(a) * R, FRONT_N1 - R + Math.sin(a) * R]); }
  front0.push([FRONT_X - R, FRONT_N1], [78, FRONT_N1]);
  const top = base + 18;
  // Le rez-de-chaussée avant est en retrait : l'avant-corps plein commence au-dessus de la marquise.
  const recess = 2.2;
  const upper = front0;
  extrude(shell, upper, hall + 5.2, top, IVORY, 4, () => 1);
  const lower: Ring = upper.map(([x, n]) => [Math.min(x, FRONT_X - recess), n]);
  extrude(shell, lower, base, hall + 5.2, IVORY, 4, () => 1);
  cap(trim, upper, top, new THREE.Color(0xd4cfc4), 1);
  // Corniche mince et débordante.
  extrude(trim, upper, top, top + 0.45, WHITE, 4, () => 1.045);
  cap(trim, upper, top + 0.45, WHITE, 1.045);
  cap(trim, upper, top, WHITE, 1.045, false);
  // Sous-face de l'avant-corps au-dessus du retrait.
  boxAt(trim, FRONT_X - recess / 2, -(FRONT_N0 + FRONT_N1) / 2, recess, FRONT_N1 - FRONT_N0 - 0.2, hall + 5.0, hall + 5.2, WHITE);

  // Rez-de-chaussée jaune en retrait : mur, portes vitrées, colonnes.
  const gx = FRONT_X - recess;
  boxAt(trim, gx + 0.05, -473, 0.12, 20, front, hall + 5.0, YELLOW);
  for (let k = 0; k < 4; k++) {
    const n = 466.6 + k * 4.6;
    boxAt(trim, gx + 0.14, -n, 0.08, 2.8, hall, hall + 3.3, new THREE.Color(0x26303a));         // porte vitrée sombre
    boxAt(trim, gx + 0.16, -n, 0.06, 3.0, hall + 3.3, hall + 3.45, GOLD);                        // imposte dorée
  }
  const columns: [number, number][] = [];
  for (const n of [464.2, 469.8, 476.2, 481.8]) columns.push([FRONT_X + 0.9, n]);
  const columnGeometry = new THREE.CylinderGeometry(0.42, 0.42, hall + 5.0 - front, 14);
  const columnMaterial = new THREE.MeshLambertMaterial({ color: YELLOW });
  for (const [x, n] of columns) {
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(x, (front + hall + 5.0) / 2, -n);
    column.castShadow = true;
    scene.add(column);
    collider.addBuilding([x - 0.45, n - 0.45, x + 0.45, n - 0.45, x + 0.45, n + 0.45, x - 0.45, n + 0.45]);
  }
  // Perron : sept marches sur la largeur de l'entrée.
  const STEPS = 6;
  for (let k = 0; k < STEPS; k++) {
    const x0 = gx + 0.2, x1 = FRONT_X + 4.2 - k * 0.6;
    boxAt(trim, (x0 + x1) / 2, -473, x1 - x0, 22 - k * 0.3, front - 0.4, front + (k + 1) * (hall - front) / STEPS, k % 2 ? STONE : WHITE);
  }

  // --- Marquise noire au bord avant arrondi, nom du théâtre en lettres dorées.
  const marquee = new MeshBuilder();
  const arc: [number, number][] = [];
  const M0 = 462.5, M1 = 483.5, depth = 3.6;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, n = M0 + (M1 - M0) * t;
    arc.push([FRONT_X + 0.6 + depth * Math.sin(Math.PI * t) ** 0.35, n]);
  }
  const outline: Ring = [[gx, M0], ...arc, [gx, M1]];
  const my0 = hall + 4.9, my1 = hall + 5.9;
  cap(marquee, outline, my1, BLACK, 1);
  cap(marquee, outline, my0, new THREE.Color(0xf2efe6), 1, false); // sous-face claire
  const fasciaMaterial = new THREE.MeshLambertMaterial({ map: marqueeTexture(), emissive: 0x2a2010 });
  const fascia = new MeshBuilder();
  let total = 0;
  for (let k = 0; k + 1 < arc.length; k++) total += Math.hypot(arc[k + 1][0] - arc[k][0], arc[k + 1][1] - arc[k][1]);
  let along = 0;
  for (let k = 0; k + 1 < arc.length; k++) {
    const [ax, an] = arc[k], [bx, bn] = arc[k + 1];
    const l = Math.hypot(bx - ax, bn - an);
    // Face au théâtre (regard vers l'ouest), le sud est à gauche : l'arc va du sud au nord, comme la texture.
    const u0 = along / total, u1 = (along + l) / total;
    const a = fascia.vertex(ax, my0, -an, WHITE, 1, u0, 0), b = fascia.vertex(bx, my0, -bn, WHITE, 1, u1, 0);
    const c = fascia.vertex(bx, my1, -bn, WHITE, 1, u1, 1), d = fascia.vertex(ax, my1, -an, WHITE, 1, u0, 1);
    fascia.triangle(a, b, c); fascia.triangle(a, c, d);
    along += l;
  }
  const fasciaMesh = new THREE.Mesh(fascia.build(), fasciaMaterial);
  fasciaMaterial.side = THREE.DoubleSide;
  scene.add(fasciaMesh);

  // --- Grand cadre blanc en saillie et cinq hautes baies bleues.
  const panelN0 = 464, panelN1 = 482, wy0 = hall + 6.4, wy1 = hall + 15.2;
  boxAt(trim, FRONT_X + 0.25, -(panelN0 + 0.4), 0.5, 0.8, wy0 - 0.5, wy1 + 0.5, WHITE);
  boxAt(trim, FRONT_X + 0.25, -(panelN1 - 0.4), 0.5, 0.8, wy0 - 0.5, wy1 + 0.5, WHITE);
  boxAt(trim, FRONT_X + 0.25, -(panelN0 + panelN1) / 2, 0.5, panelN1 - panelN0, wy1, wy1 + 0.5, WHITE);
  boxAt(trim, FRONT_X + 0.25, -(panelN0 + panelN1) / 2, 0.5, panelN1 - panelN0, wy0 - 0.5, wy0, WHITE);
  const glass = new THREE.MeshStandardMaterial({ map: windowTexture(), roughness: 0.15, metalness: 0.35 });
  const pane = new THREE.PlaneGeometry(2.55, wy1 - wy0);
  for (let k = 0; k < 5; k++) {
    const n = panelN0 + 1.5 + k * 3.25 + 1.3;
    const mesh = new THREE.Mesh(pane, glass);
    mesh.position.set(FRONT_X + 0.04, (wy0 + wy1) / 2, -n);
    mesh.rotation.y = Math.PI / 2; // face à l'est
    scene.add(mesh);
    // Trumeaux blancs légèrement saillants entre les baies.
    if (k < 4) boxAt(trim, FRONT_X + 0.1, -(n + 1.62), 0.25, 0.65, wy0, wy1, WHITE);
  }
  // Cartouche doré au-dessus des baies.
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshLambertMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.2, emissive: 0x1a1404 }));
  crest.position.set(FRONT_X + 0.08, wy1 + 1.25, -473);
  crest.rotation.y = Math.PI / 2;
  scene.add(crest);

  // --- Comble en pyramide gris derrière la façade (carte postale), au-dessus de la salle.
  const roofRing: Ring = [[42, 461], [76, 461], [76, 486], [42, 486]];
  const roof = new MeshBuilder();
  extrude(roof, roofRing, base + 13, base + 20.5, new THREE.Color(0x7d848b), 4, (t) => 1 - 0.92 * t);
  cap(roof, roofRing, base + 20.5, new THREE.Color(0x7d848b), 0.08);
  // Cage de scène à l'arrière, un peu plus haute que le corps.
  boxAt(shell, 36, -473.5, 12, 30, base, base + 16, IVORY);
  boxAt(trim, 36, -473.5, 12.4, 30.4, base + 16, base + 16.4, WHITE);

  // --- Parvis : dallage clair dégagé, deux massifs de haies sur les côtés (là où sont les arbres), potelets à chaînes.
  const court = new MeshBuilder();
  const cx0 = FRONT_X + 0.5, cx1 = 108.5;
  for (let x = cx0; x < cx1; x += 3) for (let n = 452; n < 495; n += 3) {
    const x1 = Math.min(cx1, x + 3), n1 = Math.min(495, n + 3);
    const ids = [[x, n], [x1, n], [x1, n1], [x, n1]].map(([px, pn]) => court.vertex(px, ground(px, -pn) + 0.17, -pn, STONE, 1, px / 3, pn / 3));
    court.triangle(ids[0], ids[1], ids[2]); court.triangle(ids[0], ids[2], ids[3]);
  }
  const hedge = new THREE.Color(0x2f5a2c);
  for (const [n0, n1] of [[452.5, 459], [487, 494.5]]) {
    const xm = (cx0 + 2 + cx1 - 2) / 2, g = ground(xm, -(n0 + n1) / 2) + 0.17;
    boxAt(trim, xm, -(n0 + n1) / 2, cx1 - cx0 - 4, n1 - n0, g - 0.2, g + 0.35, new THREE.Color(0xbdb6a8)); // bordure
    boxAt(trim, xm, -(n0 + n1) / 2, cx1 - cx0 - 4.4, n1 - n0 - 0.4, g + 0.35, g + 0.9, hedge);
  }
  const posts = new MeshBuilder();
  for (let n = 452; n <= 495.01; n += 2.75) {
    if (n > 466 && n < 480) continue; // passage piéton face à l'entrée
    const g = ground(108.6, -n) + 0.17;
    boxAt(posts, 108.6, -n, 0.14, 0.14, g, g + 0.8, BLACK);
    boxAt(posts, 108.6, -n, 0.2, 0.2, g + 0.8, g + 0.9, BLACK);
    const next = n + 2.75;
    if (next <= 495.01 && !(next > 466 && next < 480)) { // chaîne en deux brins qui pendent
      const gn = ground(108.6, -next) + 0.17;
      boxAt(posts, 108.6, -(n + 0.69), 0.04, 1.42, g + 0.55, g + 0.6, BLACK, 0);
      boxAt(posts, 108.6, -(n + 2.06), 0.04, 1.42, gn + 0.55, gn + 0.6, BLACK, 0);
    }
  }
  // Deux lanternes de style ancien aux angles du parvis.
  for (const n of [450.5, 496.5]) {
    const g = ground(108.6, -n) + 0.17;
    boxAt(posts, 108.6, -n, 0.5, 0.5, g, g + 0.6, BLACK);
    boxAt(posts, 108.6, -n, 0.16, 0.16, g + 0.6, g + 4.2, BLACK);
    boxAt(posts, 108.6, -n, 0.5, 0.5, g + 4.2, g + 4.3, BLACK);
    boxAt(posts, 108.6, -n, 0.42, 0.42, g + 4.3, g + 4.95, new THREE.Color(0xf3e3a8));
    boxAt(posts, 108.6, -n, 0.56, 0.56, g + 4.95, g + 5.1, BLACK);
    collider.addBuilding([108.3, n - 0.3, 108.9, n - 0.3, 108.9, n + 0.3, 108.3, n + 0.3]);
  }

  const add = (builder: MeshBuilder, material: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.castShadow = shadow;
    scene.add(mesh);
  };
  add(shell, new THREE.MeshLambertMaterial({ vertexColors: true, map: render() }));
  add(trim, new THREE.MeshLambertMaterial({ vertexColors: true }));
  add(roof, new THREE.MeshLambertMaterial({ vertexColors: true }));
  add(marquee, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  add(posts, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const courtMesh = new THREE.Mesh(court.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  courtMesh.receiveShadow = true;
  scene.add(courtMesh);

  // Collisions : corps et avant-corps (le rez-de-chaussée en retrait reste accessible jusqu'aux portes).
  collider.addBuilding(body.flat());
  collider.addBuilding([78, FRONT_N0, gx, FRONT_N0, gx, FRONT_N1, 78, FRONT_N1]);
  for (const [n0, n1] of [[452.5, 459], [487, 494.5]]) collider.addBuilding([cx0 + 2, n0, cx1 - 2, n0, cx1 - 2, n1, cx0 + 2, n1]);

  // Sol praticable : parvis au niveau du trottoir, puis le perron monte jusqu'aux portes.
  const patch = (x: number, z: number): number | null => {
    const n = -z;
    if (n < 462 || n > 484 || x < gx || x > FRONT_X + 4.2) return null;
    const t = Math.min(1, Math.max(0, (FRONT_X + 4.2 - x) / (FRONT_X + 4.2 - (gx + 1.0))));
    return front + (hall - front) * t;
  };
  return {
    ground: patch,
    // Aucun arbre devant la façade : parvis dégagé entre la façade et la chaussée.
    keepTree: (x, n) => !(x > FRONT_X - 1 && x < 112 && n > FRONT_N0 && n < FRONT_N1),
    // Le second arbre des côtés du parvis (OSM : 101, 486), décalé hors de l'axe de la façade.
    extra: [['ficus', 101.5, 490.5, 0.95]],
  };
}
