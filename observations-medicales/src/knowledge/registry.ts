import type { DetailDef, FieldDef, FindingDef, Genre, RefItem, SpecialId, SpecialItem } from './types.ts';

/** Registre global des signes : un même signe partagé entre plusieurs rubriques garde un état unique. */
export const FINDINGS: Record<string, FindingDef> = {};
export const FIELDS: Record<string, FieldDef> = {};

let currentHome = 'eg';
let currentNature: 'fonctionnel' | 'physique' = 'physique';

export function setHome(home: string) {
  currentHome = home;
}
export function setNature(n: 'fonctionnel' | 'physique') {
  currentNature = n;
}

function lowerFirst(s: string): string {
  if (s.length > 1 && s[1] === s[1].toUpperCase() && /[A-Z]/.test(s[1])) return s; // sigle (B3, TJ...)
  return s.charAt(0).toLowerCase() + s.slice(1);
}

type FOpts = Partial<Pick<FindingDef, 't' | 'ha' | 'hint' | 'details' | 'sex'>>;

/** Déclare un signe (présent / absent / non recherché). */
export function F(id: string, label: string, g: Genre, opts: FOpts = {}): FindingDef {
  if (FINDINGS[id]) throw new Error(`Signe déjà défini : ${id}`);
  const def: FindingDef = {
    kind: 'f',
    id,
    label,
    t: opts.t ?? lowerFirst(label),
    g,
    ha: opts.ha,
    hint: opts.hint,
    details: opts.details,
    sex: opts.sex,
    home: currentHome,
    nature: currentNature,
  };
  FINDINGS[id] = def;
  return def;
}

/** Référence à un signe déjà déclaré dans une autre rubrique (état partagé). */
export function R(id: string): RefItem {
  return { kind: 'ref', id };
}

type FieldOpts = Partial<Omit<FieldDef, 'kind' | 'id' | 'label' | 'type' | 'home'>>;

/** Champ à choix unique. */
export function S(id: string, label: string, options: string[], opts: FieldOpts = {}): FieldDef {
  return field(id, label, 'select', { options, ...opts });
}
/** Champ à choix multiples. */
export function M(id: string, label: string, options: string[], opts: FieldOpts = {}): FieldDef {
  return field(id, label, 'multi', { options, ...opts });
}
/** Champ texte. */
export function T(id: string, label: string, opts: FieldOpts = {}): FieldDef {
  return field(id, label, 'text', opts);
}
/** Champ numérique. */
export function N(id: string, label: string, unit: string, opts: FieldOpts = {}): FieldDef {
  return field(id, label, 'number', { unit, ...opts });
}

function field(id: string, label: string, type: FieldDef['type'], opts: FieldOpts): FieldDef {
  if (FIELDS[id]) throw new Error(`Champ déjà défini : ${id}`);
  const def: FieldDef = { kind: 'fd', id, label, type, home: currentHome, ...opts };
  FIELDS[id] = def;
  return def;
}

export function SP(id: SpecialId): SpecialItem {
  return { kind: 'sp', id };
}

/* Détails structurés réutilisables */
export const D = {
  cote: (): DetailDef => ({ id: 'cote', label: 'Côté', type: 'select', options: ['à droite', 'à gauche', 'des deux côtés'], p: '{v}' }),
  loc: (label = 'Localisation'): DetailDef => ({ id: 'loc', label, type: 'text' }),
  depuis: (): DetailDef => ({ id: 'depuis', label: 'Depuis', type: 'text', p: 'depuis {v}' }),
  text: (id: string, label: string, p?: string): DetailDef => ({ id, label, type: 'text', p }),
  sel: (id: string, label: string, options: string[], p?: string): DetailDef => ({ id, label, type: 'select', options, p }),
  num: (id: string, label: string, unit: string, p?: string): DetailDef => ({ id, label, type: 'number', unit, p }),
};
