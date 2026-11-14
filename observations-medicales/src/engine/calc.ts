/** Calculs automatiques (âge, IMC, PAM, paquets-années, DFG…). */

export function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Formatage décimal français : 1.5 -> « 1,5 » */
export function fmtNum(n: number, decimals = 1): string {
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(r).replace('.', ',');
}

/** Valeur saisie restituée telle quelle mais avec virgule décimale. */
export function fmtVal(v: string): string {
  return v.trim().replace(/(\d)\.(\d)/g, '$1,$2');
}

export function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ageAt(naissance: string, ref?: string): number | null {
  const n = parseDate(naissance);
  if (!n) return null;
  const r = parseDate(ref ?? '') ?? new Date();
  let age = r.getFullYear() - n.getFullYear();
  const m = r.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < n.getDate())) age--;
  return age;
}

/** Âge lisible : « 58 ans », « 8 mois », « 12 jours » */
export function ageLabel(naissance: string, ref?: string): string {
  const n = parseDate(naissance);
  if (!n) return '';
  const r = parseDate(ref ?? '') ?? new Date();
  const a = ageAt(naissance, ref);
  if (a === null || a < 0) return '';
  if (a >= 2) return `${a} ans`;
  const months = (r.getFullYear() - n.getFullYear()) * 12 + r.getMonth() - n.getMonth() - (r.getDate() < n.getDate() ? 1 : 0);
  if (months >= 1) return `${months} mois`;
  const days = Math.floor((r.getTime() - n.getTime()) / 86400000);
  return `${days} jour${days > 1 ? 's' : ''}`;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 12 novembre 2026 » */
export function fmtDateLong(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** « 12/11/2026 » */
export function fmtDate(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** « 14 h 30 » */
export function fmtHeure(s: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${Number(m[1])} h ${m[2]}`;
}

export function fmtDateTime(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  const hasTime = /T\d{2}:\d{2}/.test(s);
  return hasTime ? `${fmtDateLong(s)} à ${fmtHeure(s.slice(11, 16))}` : fmtDateLong(s);
}

/** Délai lisible entre deux dates : « 4 jours », « 3 semaines », « 2 mois » */
export function delai(debut: string, fin: string): string | null {
  const a = parseDate(debut);
  const b = parseDate(fin);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return null;
  const h = ms / 3600000;
  if (h < 1) return 'moins d’une heure';
  if (h < 48 && /T/.test(debut)) return `${Math.round(h)} heure${Math.round(h) > 1 ? 's' : ''}`;
  const j = Math.round(h / 24);
  if (j < 1) return 'moins d’un jour';
  if (j < 21) return `${j} jour${j > 1 ? 's' : ''}`;
  if (j < 60) return `${Math.round(j / 7)} semaines`;
  if (j < 730) return `${Math.round(j / 30.4)} mois`;
  return `${Math.floor(j / 365.25)} ans`;
}

export function imc(poidsKg: number | null, tailleCm: number | null): number | null {
  if (!poidsKg || !tailleCm) return null;
  const m = tailleCm / 100;
  return poidsKg / (m * m);
}

export function classeIMC(v: number): string {
  if (v < 16) return 'maigreur sévère';
  if (v < 17) return 'maigreur modérée';
  if (v < 18.5) return 'maigreur';
  if (v < 25) return 'corpulence normale';
  if (v < 30) return 'surpoids';
  if (v < 35) return 'obésité de classe I (modérée)';
  if (v < 40) return 'obésité de classe II (sévère)';
  return 'obésité de classe III (morbide)';
}

export function pam(pas: number | null, pad: number | null): number | null {
  if (pas === null || pad === null) return null;
  return (pas + 2 * pad) / 3;
}

export function surfaceCorporelle(poids: number | null, taille: number | null): number | null {
  if (!poids || !taille) return null;
  return Math.sqrt((poids * taille) / 3600); // Mosteller
}

export function paquetsAnnees(cigJour: number | null, annees: number | null): number | null {
  if (cigJour === null || annees === null) return null;
  return (cigJour / 20) * annees;
}

/** DFG estimé CKD-EPI 2021 (sans coefficient ethnique), créatinine en µmol/L. */
export function ckdEpi2021(creatUmol: number | null, age: number | null, sexe: 'M' | 'F' | ''): number | null {
  if (!creatUmol || age === null || !sexe) return null;
  const scr = creatUmol / 88.4;
  const f = sexe === 'F';
  const k = f ? 0.7 : 0.9;
  const a = f ? -0.241 : -0.302;
  let gfr = 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age);
  if (f) gfr *= 1.012;
  return gfr;
}

export function stadeKDIGO(dfg: number): string {
  if (dfg >= 90) return 'G1';
  if (dfg >= 60) return 'G2';
  if (dfg >= 45) return 'G3a';
  if (dfg >= 30) return 'G3b';
  if (dfg >= 15) return 'G4';
  return 'G5';
}

/** Clairance de Cockcroft-Gault (mL/min), créatinine en µmol/L. */
export function cockcroft(creatUmol: number | null, age: number | null, poids: number | null, sexe: 'M' | 'F' | ''): number | null {
  if (!creatUmol || age === null || !poids || !sexe) return null;
  const k = sexe === 'F' ? 1.04 : 1.23;
  return ((140 - age) * poids * k) / creatUmol;
}

/** Calcémie corrigée (mmol/L) = Ca + 0,025 × (40 − albumine g/L) */
export function calcemieCorrigee(ca: number | null, alb: number | null): number | null {
  if (ca === null || alb === null) return null;
  return ca + 0.025 * (40 - alb);
}

export function trouAnionique(na: number | null, cl: number | null, hco3: number | null): number | null {
  if (na === null || cl === null || hco3 === null) return null;
  return na - (cl + hco3);
}

/** Osmolarité plasmatique calculée (mOsm/L) = 2 × Na + glucose + urée (mmol/L) */
export function osmolarite(na: number | null, glc: number | null, uree: number | null): number | null {
  if (na === null || glc === null || uree === null) return null;
  return 2 * na + glc + uree;
}

/** Natrémie corrigée selon la glycémie (Katz) : Na + 1,6 × (glycémie mmol/L − 5,5) / 5,5 */
export function natremieCorrigee(na: number | null, glcMmol: number | null): number | null {
  if (na === null || glcMmol === null) return null;
  return na + (1.6 * (glcMmol - 5.5)) / 5.5;
}

/** Conversion glycémie g/L <-> mmol/L */
export function glycemieMmol(v: number, unite: string): number {
  if (unite === 'mmol/L') return v;
  if (unite === 'mg/dL') return v * 0.0555;
  return v * 5.551; // g/L
}
