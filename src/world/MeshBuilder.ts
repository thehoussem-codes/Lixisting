import * as THREE from 'three';

/**
 * Accumule des triangles colorés puis produit UNE seule géométrie.
 * Regrouper ainsi des milliers d'objets en un seul bloc est ce qui
 * permet au jeu de rester fluide (peu de "draw calls").
 */
export class MeshBuilder {
  // Tableaux typés qui grandissent par doublement : deux fois moins de mémoire que des tableaux JavaScript
  // ordinaires pendant la construction de la ville (sur téléphone, c'était ce pic de mémoire qui faisait planter).
  private pos = new Float32Array(3 * 256);
  private col = new Uint8Array(3 * 256);
  private uv = new Float32Array(2 * 256);
  private idx = new Uint32Array(3 * 256);
  private vertexCount = 0;
  private indexCount = 0;

  get isEmpty(): boolean {
    return this.indexCount === 0;
  }

  /** Nombre de sommets déjà posés (numéro du prochain sommet). */
  private get base(): number {
    return this.vertexCount;
  }

  /** Ajoute un sommet, renvoie son numéro. u, v : position dans la texture. */
  vertex(x: number, y: number, z: number, color: THREE.Color, shade = 1, u = 0, v = 0): number {
    const i = this.vertexCount;
    if (i * 3 + 3 > this.pos.length) {
      const grow = <T extends Float32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(a.length * 2); b.set(a); return b; };
      this.pos = grow(this.pos); this.col = grow(this.col); this.uv = grow(this.uv);
    }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const c = (value: number) => Math.max(0, Math.min(255, Math.round(value * shade * 255)));
    this.col[i * 3] = c(color.r); this.col[i * 3 + 1] = c(color.g); this.col[i * 3 + 2] = c(color.b);
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.vertexCount++;
    return i;
  }

  triangle(a: number, b: number, c: number): void {
    if (this.indexCount + 3 > this.idx.length) { const b2 = new Uint32Array(this.idx.length * 2); b2.set(this.idx); this.idx = b2; }
    this.idx[this.indexCount++] = a; this.idx[this.indexCount++] = b; this.idx[this.indexCount++] = c;
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
    const base = this.base;
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
    const base = this.base;
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

  /** Produit la géométrie et libère la mémoire de construction (le constructeur repart à vide). */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const n = this.vertexCount;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3, true)); // couleurs sur 1 octet
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    const indices = this.idx.subarray(0, this.indexCount);
    geometry.setIndex(new THREE.BufferAttribute(n <= 65535 ? Uint16Array.from(indices) : indices.slice(), 1));
    geometry.computeVertexNormals();
    this.pos = new Float32Array(3 * 256); this.col = new Uint8Array(3 * 256); this.uv = new Float32Array(2 * 256); this.idx = new Uint32Array(3 * 256);
    this.vertexCount = 0; this.indexCount = 0;
    return geometry;
  }
}
