/** Format du fichier public/world/annaba.json (produit par tools/build_world.py). */
/** cx, cn, ch : place de stationnement près du repère (position et direction de la voiture). */
export interface WorldPlace { name: string; x: number; n: number; cx: number; cn: number; ch: number }

export interface WorldData {
  meta: { buildings: number; buildings_height_estimated: number; roads: number; rect_m: number[] };
  places: WorldPlace[];
  /** Polygones de terre ferme : x, n, x, n... (mètres ; n = vers le nord). */
  land: number[][];
  areas: { k: string; p: number[] }[];
  /** w = largeur de chaussée, sw = largeur de trottoir de chaque côté (ajustées aux bâtiments voisins). */
  roads: { k: string; w: number; p: number[]; sw?: number }[];
  rails: { p: number[] }[];
  /** t = usage (house, apartment, tower, mosque, school...) ; s = commerces au rez-de-chaussée. */
  buildings: { h: number; t: string; p: number[]; n?: string; s?: number[]; c?: number }[];
  /** Réseau routier : nodes = x, n... ; edges = départ, arrivée, sens unique (0/1), axe rapide (0/1)... */
  graph: { nodes: number[]; edges: number[] };
}

export async function loadWorldData(): Promise<WorldData> {
  const response = await fetch(`${import.meta.env.BASE_URL}world/annaba.json?v=${__BUILD_ID__}`);
  if (!response.ok) throw new Error(`Carte introuvable (${response.status})`);
  return (await response.json()) as WorldData;
}
