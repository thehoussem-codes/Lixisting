import * as THREE from 'three';

/**
 * Carte de TEST, volontairement fictive : elle sert uniquement à vérifier
 * le rendu et les déplacements. Elle sera remplacée par les vraies données
 * d'Annaba (OpenStreetMap), jamais mélangée avec elles.
 */
export function buildTestWorld(scene: THREE.Scene): void {
  const SKY = 0x8fc7e8;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 60, 260);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb09a78, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  sun.position.set(60, 100, 40);
  scene.add(sun);

  const flat = (mesh: THREE.Mesh, y: number) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    scene.add(mesh);
    return mesh;
  };

  // Sol, route, mer.
  flat(new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0xcdb98a })), 0);
  flat(new THREE.Mesh(new THREE.PlaneGeometry(10, 600), new THREE.MeshLambertMaterial({ color: 0x3d3d42 })), 0.02);
  const sea = flat(new THREE.Mesh(new THREE.PlaneGeometry(300, 600), new THREE.MeshLambertMaterial({ color: 0x1f7fa8 })), 0.05);
  sea.position.x = -200;

  // Immeubles : une seule géométrie partagée, tailles et couleurs variées.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const colors = [0xf2e6cf, 0xe8c9a0, 0xd9d4c7, 0xc9d8e0, 0xf0d9b5];
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 24; i++) {
    const width = 10 + random() * 8;
    const height = 6 + random() * 20;
    const depth = 10 + random() * 8;
    const building = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }));
    building.scale.set(width, height, depth);
    building.position.set(i % 2 === 0 ? 22 : 44, height / 2, -220 + Math.floor(i / 2) * 40);
    scene.add(building);
  }

  // Palmiers low-poly le long de la route.
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 6, 5);
  const leavesGeometry = new THREE.ConeGeometry(2.2, 1.6, 6);
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x2f7d3a });
  for (let z = -240; z <= 240; z += 20) {
    for (const x of [-8, 8]) {
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(x, 3, z);
      const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
      leaves.position.set(x, 6.6, z);
      scene.add(trunk, leaves);
    }
  }
}
