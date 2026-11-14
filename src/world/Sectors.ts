import * as THREE from 'three';

/**
 * Découpe un grand maillage (terrain, chaussées, trottoirs… bâtis d'un seul tenant pour toute la ville) en
 * secteurs carrés. Chaque secteur devient un maillage à part, que le jeu n'affiche que s'il est assez proche du
 * joueur : sans cela, toute la ville serait dessinée à chaque image, même à 10 km.
 * Chaque triangle va dans le secteur de son centre ; l'apparence ne change pas.
 */
export function splitIntoSectors(mesh: THREE.Mesh, size: number): THREE.Mesh[] {
  const source = mesh.geometry;
  const position = source.attributes.position as THREE.BufferAttribute;
  const index = source.index;
  const triangles = (index ? index.count : position.count) / 3;
  const corner = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const buckets = new Map<string, number[]>();
  for (let t = 0; t < triangles; t++) {
    const a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(a, b, c);
  }
  const names = Object.keys(source.attributes);
  const out: THREE.Mesh[] = [];
  for (const corners of buckets.values()) {
    const remap = new Map<number, number>();
    const order: number[] = [];
    const indices = new Uint32Array(corners.length);
    for (let i = 0; i < corners.length; i++) {
      let id = remap.get(corners[i]);
      if (id === undefined) { id = order.length; remap.set(corners[i], id); order.push(corners[i]); }
      indices[i] = id;
    }
    const geometry = new THREE.BufferGeometry();
    for (const name of names) {
      const attribute = source.attributes[name] as THREE.BufferAttribute;
      const n = attribute.itemSize, from = attribute.array as ArrayLike<number>;
      const to = new (attribute.array.constructor as new (length: number) => Float32Array)(order.length * n);
      for (let i = 0; i < order.length; i++) for (let k = 0; k < n; k++) to[i * n + k] = from[order[i] * n + k];
      geometry.setAttribute(name, new THREE.BufferAttribute(to, n, attribute.normalized));
    }
    geometry.setIndex(new THREE.BufferAttribute(order.length > 65535 ? indices : new Uint16Array(indices), 1));
    geometry.computeBoundingSphere();
    const part = new THREE.Mesh(geometry, mesh.material);
    part.castShadow = mesh.castShadow; part.receiveShadow = mesh.receiveShadow;
    part.renderOrder = mesh.renderOrder; part.name = mesh.name;
    part.userData = { ...mesh.userData };
    out.push(part);
  }
  return out;
}
