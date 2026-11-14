import * as THREE from 'three';

/**
 * La mer : une nappe animée autour de la caméra (vagues calculées par la carte graphique)
 * et une grande étendue fixe jusqu'à l'horizon. L'eau est légèrement transparente :
 * près du rivage on voit le sable descendre sous la surface, ce qui donne la teinte
 * turquoise des petits fonds, puis le bleu profond au large.
 */
const NEAR_SIZE = 720, NEAR_CELLS = 144;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  varying vec3 vWorld;
  varying float vFade;

  float waveHeight(vec2 p) {
    return 0.16 * sin(p.x * 0.11 + uTime * 1.1)
         + 0.11 * sin(p.y * 0.17 - uTime * 0.9 + 1.3)
         + 0.07 * sin((p.x + p.y) * 0.29 + uTime * 1.7);
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Les vagues s'aplatissent vers le bord de la nappe, pour se raccorder à l'étendue fixe.
    vFade = 1.0 - smoothstep(${(NEAR_SIZE * 0.3).toFixed(1)}, ${(NEAR_SIZE * 0.48).toFixed(1)}, distance(world.xz, uCenter.xz));
    world.y += waveHeight(world.xz) * vFade;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSun;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying float vFade;

  void main() {
    // Pente de la surface : grandes vagues + clapotis fin.
    vec2 p = vWorld.xz;
    float dx = 0.0176 * cos(p.x * 0.11 + uTime * 1.1) + 0.0203 * cos((p.x + p.y) * 0.29 + uTime * 1.7)
             + 0.05 * cos(p.x * 1.3 + p.y * 0.7 + uTime * 2.3) + 0.04 * cos(p.x * 2.9 - p.y * 2.1 - uTime * 3.1);
    float dz = 0.0187 * cos(p.y * 0.17 - uTime * 0.9 + 1.3) + 0.0203 * cos((p.x + p.y) * 0.29 + uTime * 1.7)
             + 0.05 * cos(p.y * 1.1 - p.x * 0.6 - uTime * 2.0) + 0.04 * cos(p.y * 3.3 + p.x * 1.9 + uTime * 2.7);
    vec3 normal = normalize(vec3(-dx, 1.0, -dz));

    vec3 toEye = cameraPosition - vWorld;
    float distanceToEye = length(toEye);
    vec3 view = toEye / distanceToEye;
    // Vue rasante : on voit surtout le reflet du ciel. Vue plongeante : la couleur de l'eau.
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
    vec3 water = mix(uDeep, uShallow, clamp(0.5 + 2.0 * (normal.x + normal.z), 0.0, 1.0));
    vec3 color = mix(water, uSky, 0.04 + 0.6 * fresnel);
    // Éclats de soleil.
    float glint = pow(max(dot(reflect(-normalize(uSun), normal), view), 0.0), 90.0);
    color += vec3(1.0, 0.95, 0.8) * glint * 0.9;

    float fogDepth = uFogDensity * distanceToEye;
    float fog = 1.0 - exp(-fogDepth * fogDepth); // même formule que le brouillard exponentiel de la scène
    color = mix(color, uFogColor, fog);
    gl_FragColor = vec4(color, mix(0.72, 1.0, max(fresnel, fog)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Water {
  private near: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, fogColor: number, fogDensity: number) {
    const uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uShallow: { value: new THREE.Color(0x1fb3c4) },
      uDeep: { value: new THREE.Color(0x06528f) },
      uSky: { value: new THREE.Color(0xcfe8f2) },
      uSun: { value: new THREE.Vector3(400, 500, 150) },
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

    // Au-delà de la nappe animée : une étendue plate jusqu'à l'horizon, avec un trou au centre.
    const far = new THREE.Mesh(new THREE.RingGeometry(NEAR_SIZE * 0.47, 6500, 48, 1), this.material);
    far.rotation.x = -Math.PI / 2;
    far.frustumCulled = false;
    far.renderOrder = 1;
    this.far = far;
    scene.add(far);
  }

  private far: THREE.Mesh;

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
