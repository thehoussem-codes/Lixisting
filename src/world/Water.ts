import * as THREE from 'three';
import { MOBILE } from '../engine/Mobile';

/**
 * La mer.
 * - Surface : nappe fine autour de la caméra, soulevée par quatre houles de Gerstner (crêtes pointues, creux
 *   larges) venant du nord-est, plus une étendue jusqu'à l'horizon. Les vagues s'amortissent dans les petits
 *   fonds ; l'écume se forme au bord de l'eau et sur les crêtes.
 * - Couleur : selon la vraie profondeur (EMODnet, carte public/world/sea.png) — turquoise transparent sur le
 *   sable, bleu profond au large ; reflet du ciel d'autant plus fort que le regard est rasant ; éclat du soleil.
 * - Fond : sable et herbiers visibles par transparence, descendant jusqu'aux grands fonds.
 * La même houle est calculée en JavaScript (waveHeight) pour que les bateaux flottent sur les vagues affichées.
 */

/** Houles : direction (x, z) vers laquelle elles avancent, longueur d'onde (m), amplitude (m), raideur, phase. */
export const WAVES: { dx: number; dz: number; length: number; amplitude: number; steepness: number; phase: number }[] = [
  { dx: -0.55, dz: 0.835, length: 42, amplitude: 0.32, steepness: 0.55, phase: 0.0 },
  { dx: -0.86, dz: 0.51, length: 25, amplitude: 0.18, steepness: 0.55, phase: 1.7 },
  { dx: -0.2, dz: 0.98, length: 15, amplitude: 0.09, steepness: 0.5, phase: 3.1 },
  { dx: 0.32, dz: 0.947, length: 9, amplitude: 0.05, steepness: 0.4, phase: 4.6 },
];
const GRAVITY = 9.81;

/** Hauteur de l'eau (m, au-dessus de 0) au point x, z à l'instant t ; damp = 0 (rivage) à 1 (large). */
export function waveHeight(x: number, z: number, t: number, damp = 1): number {
  let y = 0;
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.length, c = Math.sqrt(GRAVITY * k);
    y += w.amplitude * Math.sin(k * (w.dx * x + w.dz * z) - k * c * t + w.phase);
  }
  return y * damp;
}

/** Atténuation des vagues selon la profondeur (même formule que le shader). */
export function waveDamp(depth: number): number {
  const t = Math.min(1, Math.max(0, (depth - 0.5) / 8.5));
  return 0.22 + 0.78 * t * t * (3 - 2 * t);
}

/** Carte de la mer chargée depuis public/world/sea.json + sea.png : distance au rivage, profondeur, terre. */
export class SeaMap {
  constructor(
    readonly x0: number, readonly n0: number, readonly step: number, readonly cols: number, readonly rows: number,
    readonly depthMax: number, private pixels: Uint8ClampedArray, readonly texture: THREE.Texture,
  ) {}

  static async load(base: string, version: string): Promise<SeaMap> {
    const meta = await (await fetch(`${base}world/sea.json?v=${version}`)).json();
    const image = new Image();
    image.src = `${base}world/sea.png?v=${version}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = meta.cols; canvas.height = meta.rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, meta.cols, meta.rows).data;
    const texture = new THREE.Texture(image);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return new SeaMap(meta.x0, meta.n0, meta.step, meta.cols, meta.rows, meta.depthMax, pixels, texture);
  }

  /** Valeurs au point x, n (coordonnées du jeu), interpolées entre les pixels. */
  sample(x: number, n: number): { shore: number; depth: number; land: boolean } {
    const fx = Math.min(Math.max((x - this.x0) / this.step - 0.5, 0), this.cols - 1.001);
    const fy = Math.min(Math.max((this.n0 + this.rows * this.step - n) / this.step - 0.5, 0), this.rows - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, p = this.pixels, w = this.cols;
    const at = (c: number, r: number, k: number) => p[(r * w + c) * 4 + k];
    const lerp = (k: number) => (at(ix, iy, k) * (1 - ax) + at(ix + 1, iy, k) * ax) * (1 - ay) + (at(ix, iy + 1, k) * (1 - ax) + at(ix + 1, iy + 1, k) * ax) * ay;
    const g = lerp(1) / 255;
    return { shore: lerp(0), depth: this.depthMax * g * g, land: lerp(2) > 127 };
  }

  /** Rectangle couvert, pour le shader : x0, n0 (sud), largeur, hauteur. */
  rect(): THREE.Vector4 {
    return new THREE.Vector4(this.x0, this.n0, this.cols * this.step, this.rows * this.step);
  }
}

const NEAR_SIZE = 640, NEAR_CELLS = MOBILE ? 110 : 220;

const GERSTNER = /* glsl */ `
  uniform float uTime;
  const float G = 9.81;
  const int WAVE_COUNT = ${WAVES.length};
  const vec2 WAVE_DIR[${WAVES.length}] = vec2[](${WAVES.map((w) => `vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)})`).join(', ')});
  const float WAVE_LEN[${WAVES.length}] = float[](${WAVES.map((w) => w.length.toFixed(2)).join(', ')});
  const float WAVE_AMP[${WAVES.length}] = float[](${WAVES.map((w) => w.amplitude.toFixed(3)).join(', ')});
  const float WAVE_Q[${WAVES.length}] = float[](${WAVES.map((w) => w.steepness.toFixed(3)).join(', ')});
  const float WAVE_PHASE[${WAVES.length}] = float[](${WAVES.map((w) => w.phase.toFixed(3)).join(', ')});
  uniform sampler2D uSea;
  uniform vec4 uSeaRect;
  vec2 seaUv(vec2 xz) { return vec2((xz.x - uSeaRect.x) / uSeaRect.z, (-xz.y - uSeaRect.y) / uSeaRect.w); }
  float seaDepth(vec3 s) { return 400.0 * s.g * s.g; }
  float waveDamp(float depth) { return 0.22 + 0.78 * smoothstep(0.5, 9.0, depth); }
`;

const vertexShader = /* glsl */ `
  ${GERSTNER}
  uniform vec3 uCenter;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Les vagues s'aplatissent vers le bord de la nappe, pour se raccorder à l'étendue fixe.
    float fade = 1.0 - smoothstep(${(NEAR_SIZE * 0.3).toFixed(1)}, ${(NEAR_SIZE * 0.48).toFixed(1)}, distance(world.xz, uCenter.xz));
    float damp = waveDamp(seaDepth(texture2D(uSea, seaUv(world.xz)).rgb)) * fade;
    vec3 offset = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;
    for (int i = 0; i < WAVE_COUNT; i++) {
      float k = 6.28318 / WAVE_LEN[i], c = sqrt(G / k), a = WAVE_AMP[i] * damp;
      float f = k * dot(WAVE_DIR[i], world.xz) - k * c * uTime + WAVE_PHASE[i];
      float q = WAVE_Q[i] / (k * ${WAVES.reduce((s, w) => s + w.amplitude, 0).toFixed(3)} * float(WAVE_COUNT));
      offset.xz += q * a * WAVE_DIR[i] * cos(f);
      offset.y += a * sin(f);
      n.xz -= WAVE_DIR[i] * k * a * cos(f);
      n.y -= q * k * a * sin(f);
      crest += WAVE_AMP[i] * sin(f);
    }
    world.xyz += offset;
    vWorld = world.xyz;
    vNormal = n;
    vCrest = crest / ${WAVES.reduce((s, w) => s + w.amplitude, 0).toFixed(3)} * damp;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${GERSTNER}
  uniform sampler2D uRipples;
  uniform vec3 uSun;
  uniform vec3 uZenith;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  vec3 ripple(vec2 uv) { return texture2D(uRipples, uv).xyz * 2.0 - 1.0; }
  // Couleurs écrites en sRGB (comme dans un logiciel de dessin), converties en linéaire pour le rendu.
  vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec3 sea = texture2D(uSea, seaUv(vWorld.xz)).rgb;
    float shore = sea.r * 255.0;
    float depth = seaDepth(sea);

    // Normale : houle (vertex) + deux couches de rides qui glissent en sens contraires.
    vec3 r1 = ripple(mat2(0.8, -0.6, 0.6, 0.8) * vWorld.xz / 19.0 + uTime * vec2(0.013, 0.021));
    vec3 r2 = ripple(mat2(0.96, 0.28, -0.28, 0.96) * vWorld.xz / 6.5 - uTime * vec2(0.031, -0.017));
    vec3 normal = normalize(normalize(vNormal) + vec3(r1.x + r2.x * 0.6, 0.0, r1.y + r2.y * 0.6) * 0.22);

    vec3 toEye = cameraPosition - vWorld;
    float distanceToEye = length(toEye);
    vec3 view = toEye / distanceToEye;
    vec3 sun = normalize(uSun);
    float cosTheta = max(dot(normal, view), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

    // Couleur de l'eau selon la profondeur réelle.
    vec3 c0 = srgb(vec3(0.22, 0.72, 0.72)), c1 = srgb(vec3(0.06, 0.50, 0.68)), c2 = srgb(vec3(0.04, 0.32, 0.55)), c3 = srgb(vec3(0.02, 0.19, 0.38));
    vec3 water = mix(c0, c1, smoothstep(0.0, 6.0, depth));
    water = mix(water, c2, smoothstep(5.0, 35.0, depth));
    water = mix(water, c3, smoothstep(30.0, 180.0, depth));
    water *= 0.78 + 0.22 * max(dot(normal, sun), 0.0);
    // Lumière qui traverse les crêtes, vue à contre-jour.
    float back = pow(max(dot(view, -sun) * 0.5 + 0.5, 0.0), 3.0) * max(vCrest, 0.0);
    water += srgb(vec3(0.30, 0.62, 0.56)) * back * 0.6;

    // Reflet du ciel : dégradé horizon -> zénith selon la direction réfléchie.
    vec3 reflected = reflect(-view, normal);
    vec3 sky = mix(uZenith, uFogColor, 0.3 * (1.0 - clamp(reflected.y, 0.0, 1.0)));
    vec3 color = mix(water, sky, min(fresnel, 0.45));
    // Soleil : éclat net + reflet large.
    vec3 halfway = normalize(sun + view);
    float spec = pow(max(dot(normal, halfway), 0.0), 420.0) * 3.0 + pow(max(dot(normal, halfway), 0.0), 50.0) * 0.12;
    color += srgb(vec3(1.0, 0.95, 0.82)) * spec;

    // Écume : liseré au bord de l'eau, rouleaux qui avancent vers la plage, moutons sur les crêtes.
    float grain = texture2D(uRipples, mat2(0.6, 0.8, -0.8, 0.6) * vWorld.xz / 17.0 + uTime * vec2(0.01, 0.02)).a * 0.6
                + texture2D(uRipples, mat2(0.92, -0.39, 0.39, 0.92) * vWorld.xz / 5.3 - uTime * vec2(0.02, 0.01) + 0.37).a * 0.4;
    float rim = 1.0 - smoothstep(0.0, 2.2, shore);
    float rollers = smoothstep(0.72, 1.0, sin(shore * 0.55 + uTime * 1.35 + grain * 2.5) * 0.5 + 0.5) * (1.0 - smoothstep(2.0, 16.0, shore));
    float caps = smoothstep(0.95, 1.12, vCrest * 0.7 + grain * 0.5) * smoothstep(8.0, 20.0, depth);
    float foam = clamp(max(rim * (0.55 + 0.45 * grain), max(rollers * 0.75, caps * 0.6)) * (0.55 + 0.45 * grain), 0.0, 1.0);
    color = mix(color, srgb(vec3(0.94, 0.97, 0.98)), foam);

    // Transparence : on voit le fond dans les petits fonds, plus du tout au large.
    float alpha = clamp(1.0 - exp(-depth * 0.2), 0.3, 1.0);
    alpha = max(alpha, max(min(fresnel, 0.45) * 1.2, foam));

    float fogDepth = uFogDensity * distanceToEye;
    float fog = 1.0 - exp(-fogDepth * fogDepth); // même formule que le brouillard exponentiel de la scène
    color = mix(color, uFogColor, fog);
    gl_FragColor = vec4(color, max(alpha, fog));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Carte de rides tuilable (somme de sinus à fréquences entières) : normale en RGB, hauteur en A. */
function rippleTexture(): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4);
  const waves = [[3, 1, 0.0, 1.0], [-2, 5, 1.3, 0.7], [7, -4, 2.1, 0.45], [-9, -7, 0.4, 0.3], [13, 6, 4.0, 0.2], [5, 14, 2.6, 0.18]];
  const h = (x: number, y: number) => waves.reduce((s, [kx, ky, p, a]) => s + a * Math.sin(2 * Math.PI * (kx * x + ky * y) / size + p), 0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    data[i] = (-dx / l * 0.5 + 0.5) * 255; data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    data[i + 3] = Math.min(255, Math.max(0, (h(x, y) / 2.8 * 0.5 + 0.5) * 255));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Fond marin : sable clair près du bord, plus sombre en profondeur, taches d'herbiers (posidonies). */
function buildSeabed(scene: THREE.Scene, map: SeaMap): void {
  const stride = MOBILE ? 3 : 2, reach = MOBILE ? 450 : 800;
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  const ids = new Map<number, number>();
  const sand = new THREE.Color(0xcdbb8e), deep = new THREE.Color(0x6f6a55), grass = new THREE.Color(0x3e5a3c), c = new THREE.Color();
  const id = (col: number, row: number): number => {
    const key = row * map.cols + col;
    const known = ids.get(key);
    if (known !== undefined) return known;
    const x = map.x0 + (col + 0.5) * map.step, n = map.n0 + map.rows * map.step - (row + 0.5) * map.step;
    const s = map.sample(x, n);
    if (s.shore > reach) { ids.set(key, -1); return -1; }
    // Sous la plage : juste sous le sable (caché par le terrain) ; au bord : pente un peu au-dessus du talus du
    // terrain (qu'elle masque), puis la vraie profondeur.
    const y = s.land ? -0.35 : -Math.max(0.15 + 2.2 * Math.min(1, s.shore / 24), Math.min(s.depth, 60));
    const patch = Math.sin(x * 0.031 + Math.sin(n * 0.017) * 2.0) * Math.sin(n * 0.027 - x * 0.011) > 0.35 && s.depth > 4 && s.depth < 28;
    c.copy(sand).lerp(deep, Math.min(1, s.depth / 25));
    if (patch) c.lerp(grass, 0.75);
    positions.push(x, y, -n); colors.push(c.r, c.g, c.b);
    ids.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  for (let row = 0; row + stride < map.rows; row += stride) for (let col = 0; col + stride < map.cols; col += stride) {
    const a = id(col, row), b = id(col + stride, row), d = id(col, row + stride), e = id(col + stride, row + stride);
    if (a >= 0 && b >= 0 && d >= 0) index.push(a, d, b);
    if (b >= 0 && d >= 0 && e >= 0) index.push(b, d, e);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = false;
  mesh.name = 'fond marin';
  if (new URLSearchParams(window.location.search).get('fond') !== '0') scene.add(mesh);
}

export class Water {
  private near: THREE.Mesh;
  private far: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  /** Carte de la mer (profondeur, rivage) ; null tant qu'elle n'est pas chargée. */
  sea: SeaMap | null = null;

  constructor(scene: THREE.Scene, fogColor: number, fogDensity: number) {
    // En attendant la carte : eau profonde partout (pixel 1 × 1).
    const placeholder = new THREE.DataTexture(new Uint8Array([255, 200, 0, 255]), 1, 1, THREE.RGBAFormat);
    placeholder.needsUpdate = true;
    const uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uSea: { value: placeholder as THREE.Texture },
      uSeaRect: { value: new THREE.Vector4(-1e5, -1e5, 2e5, 2e5) },
      uRipples: { value: rippleTexture() },
      uSun: { value: new THREE.Vector3(0.6, 0.75, 0.25) },
      uZenith: { value: new THREE.Color(0x5f97cf) },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogDensity: { value: fogDensity },
    };
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(NEAR_SIZE, NEAR_SIZE, NEAR_CELLS, NEAR_CELLS);
    geometry.rotateX(-Math.PI / 2);
    this.near = new THREE.Mesh(geometry, this.material);
    this.near.frustumCulled = false;
    this.near.renderOrder = 1;
    scene.add(this.near);

    // Au-delà de la nappe animée : une étendue jusqu'à l'horizon, avec un trou au centre.
    const far = new THREE.Mesh(new THREE.RingGeometry(NEAR_SIZE * 0.47, 9000, 64, 1), this.material);
    far.rotation.x = -Math.PI / 2;
    far.frustumCulled = false;
    far.renderOrder = 1;
    this.far = far;
    scene.add(far);

    SeaMap.load(import.meta.env.BASE_URL, __BUILD_ID__).then((map) => {
      this.sea = map;
      this.material.uniforms.uSea.value = map.texture;
      this.material.uniforms.uSeaRect.value = map.rect();
      buildSeabed(scene, map);
    }).catch((error) => console.warn('Carte de la mer indisponible :', error));
  }

  /** Direction du soleil (vers le soleil), pour les reflets. */
  setSun(direction: THREE.Vector3): void {
    this.material.uniforms.uSun.value.copy(direction);
  }

  /** Hauteur de l'eau au point x, z (monde) à l'instant t, vagues comprises (amorties dans les petits fonds). */
  heightAt(x: number, z: number, t: number): number {
    const damp = this.sea ? waveDamp(this.sea.sample(x, -z).depth) : 1;
    return waveHeight(x, z, t, damp);
  }

  /** À appeler à chaque image : la nappe suit la caméra par pas entiers, pour que les vagues ne glissent pas. */
  update(time: number, camera: THREE.Vector3): void {
    const cell = NEAR_SIZE / NEAR_CELLS;
    const x = Math.round(camera.x / cell) * cell, z = Math.round(camera.z / cell) * cell;
    this.near.position.set(x, 0, z);
    this.far.position.set(x, 0, z);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCenter.value.set(x, 0, z);
  }
}
