/** Outils de rédaction en français médical : articles, élisions, accords, énumérations. */
import type { Genre } from '../knowledge/types.ts';
import type { Sexe } from '../../shared/types.ts';

const VOYELLE = /^[aeiouyàâäéèêëîïôöùûüœæh]/i;

/** Le mot commence-t-il par une voyelle ou un h muet ? */
export function elide(mot: string, hAspire = false): boolean {
  if (!mot) return false;
  if (hAspire && /^h/i.test(mot)) return false;
  return VOYELLE.test(mot.trim());
}

/** « de X » / « d’X » */
export function de(mot: string, hAspire = false): string {
  return elide(mot, hAspire) ? `d’${mot}` : `de ${mot}`;
}

/** Article indéfini : « un X », « une X », « des X » */
export function article(t: string, g: Genre): string {
  if (g === 'm') return `un ${t}`;
  if (g === 'f') return `une ${t}`;
  return `des ${t}`;
}

/** « d’un X », « d’une X », « de X » (pluriel) */
export function deArticle(t: string, g: Genre, hAspire = false): string {
  if (g === 'm') return `d’un ${t}`;
  if (g === 'f') return `d’une ${t}`;
  return de(t, hAspire);
}

/** Accord d'un adjectif simple (règle générale) */
export function accord(adj: string, g: Genre): string {
  let a = adj;
  const fem = g === 'f' || g === 'fp';
  const plur = g === 'mp' || g === 'fp';
  if (fem && !a.endsWith('e')) {
    if (a.endsWith('if')) a = a.slice(0, -2) + 'ive';
    else if (a.endsWith('eux')) a = a.slice(0, -3) + 'euse';
    else if (a.endsWith('al')) a = a + 'e';
    else a = a + 'e';
  }
  if (plur && !/[sx]$/.test(a)) a = a.endsWith('al') && !fem ? a.slice(0, -2) + 'aux' : a + 's';
  return a;
}

/** Pronom sujet pour un groupe nominal */
export function pronom(g: Genre): string {
  return { m: 'Il', f: 'Elle', mp: 'Ils', fp: 'Elles' }[g];
}

/** Énumération : « a, b et c » */
export function liste(items: string[], conj = 'et'): string {
  const xs = items.filter((x) => x && x.trim());
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} ${conj} ${xs[xs.length - 1]}`;
}

/** Liste de compléments avec « de » répété : « de a, de b et d’c » */
export function listeDe(items: { t: string; ha?: boolean }[], conj: 'et' | 'ni' = 'et'): string {
  return liste(items.map((x) => de(x.t, x.ha)), conj);
}

export function cap(s: string): string {
  const t = s.trimStart();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Phrase : majuscule initiale, point final, espaces normalisés. */
export function phrase(s: string): string {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').replace(/,\s*,/g, ',').trim();
  if (!t) return '';
  t = cap(t);
  if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}

export function phrases(xs: (string | null | undefined | false)[]): string {
  return xs.filter((x): x is string => !!x && x.trim() !== '').map(phrase).join(' ');
}

/** Remplace {v} dans un gabarit */
export function gabarit(p: string, v: string): string {
  const val = /^-?\d+\.\d+$/.test(v.trim()) ? v.trim().replace('.', ',') : v;
  if (!p.includes('{v}')) return `${p} ${val}`;
  const tpl = elide(val) ? p.replace(/\bde \{v\}/, 'd’{v}') : p;
  return tpl.replace('{v}', val);
}

const FEMININ: Record<string, string> = {
  conscient: 'consciente', obnubilé: 'obnubilée', confus: 'confuse', somnolent: 'somnolente', stuporeux: 'stuporeuse',
  comateux: 'comateuse', agité: 'agitée', orienté: 'orientée', désorienté: 'désorientée', hydraté: 'hydratée',
  dépendant: 'dépendante', âgé: 'âgée', admis: 'admise', hospitalisé: 'hospitalisée', né: 'née', hypotendu: 'hypotendue',
};

/** Accorde au féminin les adjectifs qualifiant le patient (« conscient » -> « consciente »). */
export function feminiser(texte: string): string {
  return texte.replace(/[\p{L}]+/gu, (m) => FEMININ[m] ?? m);
}

export interface Patient {
  sujet: string; // « le patient »
  Sujet: string; // « Le patient »
  il: string;
  Il: string;
  e: string; // accord
  civ: string; // M. / Mme
  du: string; // « du patient »
}

export function patient(sexe: Sexe): Patient {
  if (sexe === 'F') return { sujet: 'la patiente', Sujet: 'La patiente', il: 'elle', Il: 'Elle', e: 'e', civ: 'Mme', du: 'de la patiente' };
  return { sujet: 'le patient', Sujet: 'Le patient', il: 'il', Il: 'Il', e: '', civ: sexe === 'M' ? 'M.' : '', du: 'du patient' };
}

/** Minuscule initiale (sauf sigle) */
export function minus(s: string): string {
  if (s.length > 1 && /[A-ZÉ]/.test(s[1])) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Empreinte rapide d'un texte (détection des textes générés modifiés depuis). */
export function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
