import * as THREE from 'three';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import { createStoneWallTexture } from './Textures';

const STONE = new THREE.Color(0xd8cfbb), COPING = new THREE.Color(0xc4bba6);

/**
 * Murs de soutènement : là où une rue est taillée dans une colline, un mur de pierre retient le talus.
 * values : x0, n0, x1, n1, bas0, haut0, bas1, haut1 pour chaque tronçon (calculés par tools/build_terrain.py).
 */
export function buildWalls(scene: THREE.Scene, values: number[] | undefined, collider: Collider | null): number {
  if (!values?.length) return 0;
  const wall = new MeshBuilder(), cap = new MeshBuilder();
  let travelled = 0;
  for (let i = 0; i + 7 < values.length; i += 8) {
    const [x0, n0, x1, n1, b0, t0, b1, t1] = values.slice(i, i + 8);
    const z0 = -n0, z1 = -n1, length = Math.hypot(x1 - x0, z1 - z0);
    if (length < 0.01) continue;
    const u0 = travelled / 3, u1 = (travelled + length) / 3;
    travelled += length;
    const v = [wall.vertex(x0, b0, z0, STONE, 0.8, u0, b0 / 3), wall.vertex(x1, b1, z1, STONE, 0.8, u1, b1 / 3),
               wall.vertex(x1, t1, z1, STONE, 1, u1, t1 / 3), wall.vertex(x0, t0, z0, STONE, 1, u0, t0 / 3)];
    wall.triangle(v[0], v[1], v[2]); wall.triangle(v[0], v[2], v[3]);
    // Couronnement : une dalle qui déborde en tête de mur.
    const px = -(z1 - z0) / length * 0.3, pz = (x1 - x0) / length * 0.3;
    for (const [dy, shade] of [[0.25, 1.05], [0, 0.75]] as const) {
      const c = [cap.vertex(x0 - px, t0 + dy, z0 - pz, COPING, shade), cap.vertex(x1 - px, t1 + dy, z1 - pz, COPING, shade),
                 cap.vertex(x1 + px, t1 + dy, z1 + pz, COPING, shade), cap.vertex(x0 + px, t0 + dy, z0 + pz, COPING, shade)];
      cap.triangle(c[0], c[1], c[2]); cap.triangle(c[0], c[2], c[3]);
    }
    for (const side of [1, -1]) {
      const c = [cap.vertex(x0 + px * side, t0, z0 + pz * side, COPING, 0.9), cap.vertex(x1 + px * side, t1, z1 + pz * side, COPING, 0.9),
                 cap.vertex(x1 + px * side, t1 + 0.25, z1 + pz * side, COPING, 0.9), cap.vertex(x0 + px * side, t0 + 0.25, z0 + pz * side, COPING, 0.9)];
      cap.triangle(c[0], c[1], c[2]); cap.triangle(c[0], c[2], c[3]);
    }
    // Obstacle : on ne traverse pas le mur, ni à pied ni en voiture.
    const tx = px / 0.3 * 0.45, tz = pz / 0.3 * 0.45;
    collider?.addBuilding([x0 - tx, -(z0 - tz), x1 - tx, -(z1 - tz), x1 + tx, -(z1 + tz), x0 + tx, -(z0 + tz)]);
  }
  const stone = new THREE.Mesh(wall.build(), new THREE.MeshLambertMaterial({ map: createStoneWallTexture(), vertexColors: true, side: THREE.DoubleSide }));
  const coping = new THREE.Mesh(cap.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  stone.castShadow = coping.castShadow = true;
  scene.add(stone, coping);
  return values.length / 8;
}
