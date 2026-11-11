import * as THREE from 'three';

/**
 * Accumule des triangles colorés puis produit UNE seule géométrie.
 * Regrouper ainsi des milliers d'objets en un seul bloc est ce qui
 * permet au jeu de rester fluide (peu de "draw calls").
 */
export class MeshBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  /** Ajoute un sommet, renvoie son numéro. u, v : position dans la texture. */
  vertex(x: number, y: number, z: number, color: THREE.Color, shade = 1, u = 0, v = 0): number {
    this.positions.push(x, y, z);
    this.colors.push(color.r * shade, color.g * shade, color.b * shade);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /**
   * Polygone horizontal à la hauteur y.
   * points : x, n, x, n... (n = nord). Dans le monde 3D, z = -n.
   */
  flatPolygon(points: number[], y: number, color: THREE.Color): void {
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < points.length; i += 2) contour.push(new THREE.Vector2(points[i], points[i + 1]));
    if (contour.length < 3) return;
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = this.positions.length / 3;
    for (const p of contour) this.vertex(p.x, y, -p.y, color);
    for (const face of faces) this.triangle(base + face[0], base + face[1], base + face[2]);
  }

  /**
   * Ruban de largeur donnée le long d'une ligne (routes, rails), posé sur le sol.
   * y : hauteur au-dessus du terrain. tile : longueur (m) d'un motif de texture.
   */
  ribbon(points: number[], width: number, y: number, color: THREE.Color,
         ground?: (x: number, z: number) => number, tile = 12): void {
    const count = points.length / 2;
    if (count < 2) return;
    const half = width / 2;
    const base = this.positions.length / 3;
    let travelled = 0;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2];
      const z = -points[i * 2 + 1];
      const prev = Math.max(i - 1, 0);
      const next = Math.min(i + 1, count - 1);
      // Direction avant et après le point, pour arrondir proprement les virages.
      let ax = x - points[prev * 2], az = z + points[prev * 2 + 1];
      let bx = points[next * 2] - x, bz = -points[next * 2 + 1] - z;
      const al = Math.hypot(ax, az) || 1, bl = Math.hypot(bx, bz) || 1;
      if (i > 0) travelled += Math.hypot(ax, az);
      ax /= al; az /= al; bx /= bl; bz /= bl;
      if (i === 0) { ax = bx; az = bz; }
      if (i === count - 1) { bx = ax; bz = az; }
      let nx = -(az + bz), nz = ax + bx;
      const nl = Math.hypot(nx, nz);
      if (nl < 1e-6) { nx = -az; nz = ax; } else { nx /= nl; nz /= nl; }
      // Dans un virage serré on élargit un peu, sans dépasser 2x.
      const cos = Math.max(0.5, Math.abs(nx * -az + nz * ax));
      const offset = half / cos;
      const lx = x + nx * offset, lz = z + nz * offset, rx = x - nx * offset, rz = z - nz * offset;
      this.vertex(lx, y + (ground ? ground(lx, lz) : 0), lz, color, 1, 0, travelled / tile);
      this.vertex(rx, y + (ground ? ground(rx, rz) : 0), rz, color, 1, 1, travelled / tile);
    }
    for (let i = 0; i < count - 1; i++) {
      const a = base + i * 2;
      this.triangle(a, a + 2, a + 1); // ordre choisi pour que la face visible soit vers le haut
      this.triangle(a + 1, a + 2, a + 3);
    }
  }

  /**
   * Disque posé sur le sol (carrefour, îlot). y : hauteur au-dessus du terrain.
   * La texture est plaquée selon la position dans le monde (un motif tous les `tile` mètres).
   */
  disc(x: number, z: number, radius: number, y: number, color: THREE.Color,
       ground: (x: number, z: number) => number, tile = 6, segments = 14, edgeColor = color): void {
    const center = this.vertex(x, ground(x, z) + y, z, color, 1, x / tile, z / tile);
    const ring: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      ring.push(this.vertex(px, ground(px, pz) + y, pz, edgeColor, 1, px / tile, pz / tile));
    }
    for (let i = 0; i < segments; i++) this.triangle(center, ring[(i + 1) % segments], ring[i]);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
