import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder';

/**
 * Zone de test de la physique (adresse ...?test=1) : un terrain d'essai FICTIF,
 * sans rapport avec Annaba, qui sert uniquement à régler la conduite.
 *
 * Devant le point de départ (vers les z positifs) :
 *  - au centre : un tremplin de 20 m qui monte à 3 m puis s'arrête net ;
 *  - à gauche (x de 20 à 40) : une longue côte à 17 %, un plateau, puis une falaise de 25 m ;
 *  - à droite (x de -40 à -20) : une piste de bosses de 25 cm ;
 *  - plus loin à droite : un petit tremplin et une colline arrondie de 12 m.
 */
export function testHeight(x: number, z: number): number {
  let h = 0;
  if (Math.abs(x) < 6 && z > 60 && z <= 80) h = ((z - 60) / 20) * 3;
  if (x > 20 && x < 40) {
    if (z > 0 && z <= 150) h = (z / 150) * 25;
    else if (z > 150 && z <= 200) h = 25;
  }
  if (x > -40 && x < -20 && z > 20 && z < 140) h = 0.125 * (1 - Math.cos((2 * Math.PI * (z - 20)) / 6));
  if (x > -70 && x < -58 && z > 40 && z <= 52) h = ((z - 40) / 12) * 1.2;
  const d = Math.hypot(x + 130, z - 110);
  return Math.max(h, 12 * Math.exp(-(d * d) / (2 * 40 * 40)) - 0.05);
}

export function buildTestTrack(scene: THREE.Scene): (x: number, z: number) => number {
  const SKY = 0xbfe0ee;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 250, 900);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(400, 500, 150);
  scene.add(sun);

  // Grille de 2 m : damier clair/foncé tous les 10 m, pour bien percevoir la vitesse.
  const STEP = 2, X0 = -220, X1 = 220, Z0 = -80, Z1 = 300;
  const cols = (X1 - X0) / STEP, rows = (Z1 - Z0) / STEP;
  const builder = new MeshBuilder();
  const light = new THREE.Color(0xb9b5a8), dark = new THREE.Color(0xa29e92), feature = new THREE.Color(0xd98a3d), mixed = new THREE.Color();
  const index: number[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = X0 + c * STEP, z = Z0 + r * STEP, h = testHeight(x, z);
      const checker = (Math.floor(x / 10) + Math.floor(z / 10)) % 2 === 0 ? light : dark;
      mixed.copy(checker).lerp(feature, Math.min(1, h / 3) * 0.7);
      index.push(builder.vertex(x, h, z, mixed));
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = index[r * (cols + 1) + c], b = a + 1, d = a + cols + 1, e = d + 1;
      builder.triangle(a, d, b);
      builder.triangle(b, d, e);
    }
  }
  scene.add(new THREE.Mesh(builder.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  return testHeight;
}
