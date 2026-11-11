/** Format du fichier public/world/annaba.json (produit par tools/build_world.py). */
export interface WorldPlace { name: string; x: number; n: number }

export interface WorldData {
  meta: { buildings: number; buildings_height_estimated: number; roads: number; rect_m: number[] };
  places: WorldPlace[];
  /** Polygones de terre ferme : x, n, x, n... (mètres ; n = vers le nord). */
  land: number[][];
  areas: { k: string; p: number[] }[];
  roads: { k: string; w: number; p: number[] }[];
  rails: { p: number[] }[];
  buildings: { h: number; p: number[]; n?: string }[];
  /** Réseau routier : nodes = x, n... ; edges = départ, arrivée, sens unique (0/1), axe rapide (0/1)... */
  graph: { nodes: number[]; edges: number[] };
}

export async function loadWorldData(): Promise<WorldData> {
  const response = await fetch(`${import.meta.env.BASE_URL}world/annaba.json?v=${__BUILD_ID__}`);
  if (!response.ok) throw new Error(`Carte introuvable (${response.status})`);
  return (await response.json()) as WorldData;
}
