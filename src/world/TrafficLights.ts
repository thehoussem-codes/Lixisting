import * as THREE from 'three';
import type { WorldData } from './WorldData';

const CYCLE = 26;   // durée d'un cycle complet (secondes)
const GREEN = 10, AMBER = 2.5;

type Light = 'green' | 'amber' | 'red';

/**
 * Feux tricolores, aux emplacements réels répertoriés dans OpenStreetMap.
 * À chaque carrefour, les rues sont réparties en deux groupes selon leur orientation
 * (plutôt nord-sud ou plutôt est-ouest) : quand un groupe est au vert, l'autre est au rouge.
 */
export class TrafficLights {
  private lamps: { mesh: THREE.Mesh; group: number; kind: Light; offset: number }[] = [];
  private offsets = new Map<number, number>(); // décalage de cycle de chaque carrefour
  private time = 0;
  private on: Record<Light, THREE.Material> = {
    green: new THREE.MeshBasicMaterial({ color: 0x35e063 }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffb020 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  };
  private off = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });

  constructor(scene: THREE.Scene, data: WorldData, ground: (x: number, z: number) => number) {
    const nodes = data.graph.nodes, edges = data.graph.edges;
    const pole = new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), head = new THREE.BoxGeometry(0.34, 1.0, 0.3), bulb = new THREE.SphereGeometry(0.13, 8, 6);
    const metal = new THREE.MeshLambertMaterial({ color: 0x2b2d2f });
    for (let s = 0; s < data.signals.length; s += 3) {
      const x = data.signals[s], z = -data.signals[s + 1], node = data.signals[s + 2];
      const offset = (s * 7.3) % CYCLE;
      this.offsets.set(node, offset);
      // Une rue qui arrive au carrefour = un feu, posé à droite de la voie, 6 m avant le carrefour.
      const approaches: [number, number][] = [];
      for (let e = 0; e < edges.length && node >= 0; e += 4) {
        const other = edges[e] === node ? edges[e + 1] : edges[e + 1] === node ? edges[e] : -1;
        if (other < 0) continue;
        const dx = nodes[other * 2] - x, dz = -nodes[other * 2 + 1] - z, length = Math.hypot(dx, dz);
        if (length > 0.5) approaches.push([dx / length, dz / length]);
      }
      if (approaches.length === 0) approaches.push([1, 0]);
      for (const [dx, dz] of approaches) {
        // (dx, dz) pointe du carrefour vers la rue ; la circulation arrive en sens inverse.
        const px = x + dx * 6 + dz * 3.6, pz = z + dz * 6 - dx * 3.6, py = ground(px, pz) + 0.2;
        const group = Math.abs(dx) > Math.abs(dz) ? 0 : 1;
        const post = new THREE.Mesh(pole, metal);
        post.position.set(px, py + 1.7, pz);
        const box = new THREE.Mesh(head, metal);
        box.position.set(px, py + 3.7, pz);
        box.rotation.y = Math.atan2(dx, dz);
        scene.add(post, box);
        (['red', 'amber', 'green'] as Light[]).forEach((kind, i) => {
          const mesh = new THREE.Mesh(bulb, this.off);
          mesh.position.set(px + dx * 0.16, py + 4.02 - i * 0.32, pz + dz * 0.16);
          scene.add(mesh);
          this.lamps.push({ mesh, group, kind, offset });
        });
      }
    }
  }

  private phase(group: number, offset: number): Light {
    const t = (this.time + offset + group * (CYCLE / 2)) % CYCLE;
    return t < GREEN ? 'green' : t < GREEN + AMBER ? 'amber' : 'red';
  }

  /** Couleur du feu pour une voiture qui arrive au point `node` en roulant dans la direction (dx, dz). null = pas de feu ici. */
  stateFor(node: number, dx: number, dz: number): Light | null {
    const offset = this.offsets.get(node);
    return offset === undefined ? null : this.phase(Math.abs(dx) > Math.abs(dz) ? 0 : 1, offset);
  }

  update(dt: number): void {
    this.time += dt;
    for (const lamp of this.lamps) {
      lamp.mesh.material = this.phase(lamp.group, lamp.offset) === lamp.kind ? this.on[lamp.kind] : this.off;
    }
  }
}
