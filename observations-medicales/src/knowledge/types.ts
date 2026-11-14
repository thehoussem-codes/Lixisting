/** Genre et nombre grammatical d'un terme (pour les articles et accords). */
export type Genre = 'm' | 'f' | 'mp' | 'fp';

export interface DetailDef {
  id: string;
  label: string;
  type: 'select' | 'text' | 'number' | 'multi';
  options?: string[];
  unit?: string;
  /** Gabarit de rédaction en ligne, ex. « stade {v} de la NYHA ». Sans gabarit : rendu entre parenthèses. */
  p?: string;
}

export interface FindingDef {
  kind: 'f';
  id: string;
  /** Libellé affiché dans les formulaires */
  label: string;
  /** Groupe nominal sans article, minuscule, utilisé dans la rédaction */
  t: string;
  g: Genre;
  /** h aspiré : pas d'élision (« de hernie ») */
  ha?: boolean;
  /** Aide sémiologique (définition, technique de recherche) */
  hint?: string;
  details?: DetailDef[];
  /** Applicable seulement à un sexe */
  sex?: 'F' | 'M';
  /** Appareil (ou 'hdm', 'eg') où le signe est rédigé */
  home: string;
  /** Interrogatoire (signe fonctionnel) ou examen (signe physique) */
  nature: 'fonctionnel' | 'physique';
}

export interface FieldDef {
  kind: 'fd';
  id: string;
  label: string;
  type: 'select' | 'text' | 'number' | 'multi' | 'textarea';
  options?: string[];
  /** Valeurs considérées comme normales (non reprises dans les signes positifs) */
  nl?: string[];
  /** Gabarit de rédaction avec {v} */
  p?: string;
  unit?: string;
  hint?: string;
  sex?: 'F' | 'M';
  home: string;
  placeholder?: string;
  /** Accord au féminin selon le sexe du patient */
  accord?: boolean;
}

export type SpecialId =
  | 'pouls' | 'paBras' | 'souffles' | 'mrc' | 'rot' | 'nerfs' | 'adenopathies' | 'articulations' | 'lesions';

export interface SpecialItem {
  kind: 'sp';
  id: SpecialId;
}

export interface RefItem {
  kind: 'ref';
  id: string;
}

export type BlockItem = FindingDef | FieldDef | SpecialItem | RefItem;

export type BlockKind = 'interrogatoire' | 'inspection' | 'palpation' | 'percussion' | 'auscultation' | 'examen' | 'signes';

export interface BlockDef {
  id: string;
  title: string;
  kind: BlockKind;
  items: BlockItem[];
  hint?: string;
  /** Examen à ne réaliser que si indiqué (toucher rectal, examen gynécologique) */
  siIndique?: boolean;
}

export interface AppareilDef {
  id: string;
  title: string;
  short: string;
  /** Titre utilisé dans la rédaction : « Examen cardiovasculaire » */
  redac: string;
  blocks: BlockDef[];
  avertissement?: string;
  /** Pertinence par défaut lorsque aucun symptôme ne l'oriente */
  defaut: 'indispensable' | 'recommande' | 'facultatif';
}
