/**
 * Contexte clinique dérivé d'une observation : âge, sexe, symptômes, constantes numériques,
 * biologie en unités canoniques, signes recherchés pertinents… Utilisé par la rédaction,
 * le contrôle de complétude, les scores et les rappels contextuels.
 */
import type { FState, Observation } from '../../shared/types.ts';
import { ageAt, glycemieMmol, imc, num } from './calc.ts';
import { SYMPTOME_BY_ID, type SymptomDef } from '../knowledge/symptomes.ts';
import { ANALYTE_BY_ID } from '../knowledge/biologie.ts';
import { FIELDS, FINDINGS } from '../knowledge/registry.ts';

export interface Vitals {
  t: number | null;
  pas: number | null;
  pad: number | null;
  fc: number | null;
  fr: number | null;
  spo2: number | null;
  o2: boolean;
  glyMmol: number | null;
  poids: number | null;
  taille: number | null;
  imc: number | null;
  eva: number | null;
  gcs: number | null;
}

export interface Ctx {
  obs: Observation;
  age: number | null;
  sexe: 'M' | 'F' | '';
  symptomes: string[];
  symptomDefs: SymptomDef[];
  vit: Vitals;
  /** Signe présent */
  has: (id: string) => boolean;
  /** Signe absent après recherche */
  abs: (id: string) => boolean;
  state: (id: string) => FState | undefined;
  field: (id: string) => string;
  /** Catégorie d'antécédent médical présente */
  atcd: (cat: string) => boolean;
  /** Texte libre clinique en minuscules (recherche de mots-clés) */
  texte: string;
  /** Dernière valeur biologique en unité canonique */
  bio: (id: string) => number | null;
  /** Éléments d'examen recommandés par les symptômes */
  focus: Set<string>;
  /** Signes associés suggérés par les symptômes */
  associes: Set<string>;
  /** Appareils prioritaires */
  appareilsPrioritaires: Set<string>;
  femmeAgeProcreer: boolean;
}

export function buildContext(obs: Observation): Ctx {
  const age = ageAt(obs.identite.dateNaissance, obs.admission.date?.slice(0, 10));
  const sexe = obs.identite.sexe;
  const c = obs.constantes;
  const poids = num(c.poids);
  const taille = num(c.taille);
  const gly = num(c.glycemie);
  const vit: Vitals = {
    t: num(c.temperature),
    pas: num(c.pas),
    pad: num(c.pad),
    fc: num(c.fc),
    fr: num(c.fr),
    spo2: num(c.spo2),
    o2: c.o2 === 'o2',
    glyMmol: gly === null ? null : glycemieMmol(gly, c.glycemieUnite || 'g/L'),
    poids,
    taille,
    imc: imc(poids, taille),
    eva: num(c.eva),
    gcs: num(c.glasgow),
  };

  const symptomes = obs.hdm.symptomes.map((s) => s.type);
  const symptomDefs = symptomes.map((s) => SYMPTOME_BY_ID[s]).filter(Boolean);
  const focus = new Set<string>();
  const associes = new Set<string>();
  const appareilsPrioritaires = new Set<string>();
  for (const d of symptomDefs) {
    d.focus.forEach((f) => focus.add(f));
    d.associes.forEach((f) => associes.add(f));
    d.appareils.forEach((a) => appareilsPrioritaires.add(a));
  }

  const state = (id: string): FState | undefined => {
    const def = FINDINGS[id];
    if (def?.sex && sexe && def.sex !== sexe) return 'na';
    return obs.findings[id]?.s;
  };

  // Biologie : dernière valeur saisie de chaque analyte, convertie en unité canonique
  const bioMap = new Map<string, { v: number; date: string }>();
  for (const p of obs.examens.bio) {
    for (const v of p.valeurs) {
      const n = num(v.valeur);
      if (n === null || !v.analyte) continue;
      const a = ANALYTE_BY_ID[v.analyte];
      const u = a?.unites.find((x) => x.u === v.unite);
      const canon = u ? n * u.f : n;
      const prev = bioMap.get(v.analyte);
      if (!prev || (p.date || '') >= prev.date) bioMap.set(v.analyte, { v: canon, date: p.date || '' });
    }
  }

  const textes: string[] = [
    obs.motif.principal, obs.motif.symptomes, obs.motif.formulation, obs.motif.secondaires.join(' '),
    obs.hdm.recit,
    ...Object.values(obs.atcd.medicaux).flatMap((cat) => cat.entries.map((e) => `${e.nom} ${e.traitement} ${e.complications}`)),
    ...obs.atcd.traitements.entries.map((m) => m.nom),
    obs.examens.ecg.rythme, obs.examens.ecg.interpretation, obs.examens.ecg.autres,
    obs.discussion.diagnosticPrincipal, obs.discussion.syndromes,
  ];

  const femmeAgeProcreer = sexe === 'F' && age !== null && age >= 12 && age <= 55 && obs.atcd.gyneco.menopause !== 'oui';

  return {
    obs,
    age,
    sexe,
    symptomes,
    symptomDefs,
    vit,
    has: (id) => state(id) === 'p',
    abs: (id) => state(id) === 'a',
    state,
    field: (id) => obs.fields[id] ?? '',
    atcd: (cat) => obs.atcd.medicaux[cat]?.s === 'p',
    texte: textes.join(' \n ').toLowerCase(),
    bio: (id) => bioMap.get(id)?.v ?? null,
    focus,
    associes,
    appareilsPrioritaires,
    femmeAgeProcreer,
  };
}

/** Un élément (signe ou champ) est-il documenté ? */
export function estDocumente(obs: Observation, id: string): boolean {
  if (FINDINGS[id]) return obs.findings[id]?.s !== undefined;
  if (FIELDS[id]) return (obs.fields[id] ?? '') !== '';
  return false;
}

/** Libellé d'un signe ou d'un champ */
export function libelle(id: string): string {
  return FINDINGS[id]?.label ?? FIELDS[id]?.label ?? id;
}
