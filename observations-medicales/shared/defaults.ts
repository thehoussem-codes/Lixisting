import type { Observation, PatientIdentity, ECG, Gyneco, Toxiques } from './types.ts';

let counter = 0;
export function uid(): string {
  counter = (counter + 1) % 1e6;
  return Date.now().toString(36) + '-' + counter.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export function emptyIdentity(): PatientIdentity {
  return {
    ipp: '',
    nom: '',
    prenom: '',
    dateNaissance: '',
    sexe: '',
    adresse: '',
    telephone: '',
    profession: '',
    situationFamiliale: '',
    origine: '',
    personnePrevenir: { nom: '', lien: '', telephone: '' },
  };
}

export function emptyGyneco(): Gyneco {
  return {
    gestite: '', parite: '', accouchementsVB: '', cesariennes: '', faussesCouches: '', ivg: '',
    ddr: '', cycles: '', menopause: '', ageMenopause: '', ths: '', contraception: '',
    grossesse: '', termeGrossesse: '', atcdGyneco: '',
  };
}

export function emptyToxiques(): Toxiques {
  return {
    tabac: '', cigJour: '', tabacAnnees: '', paquetsAnnees: '', tabacArret: '', tabacAutre: '',
    alcool: '', alcoolVerresJour: '', alcoolDetail: '', deta: {},
    substances: '', substancesDetail: '', expoPro: '', expoEnv: '', activitePhysique: '', alimentation: '',
  };
}

export function emptyECG(): ECG {
  return { date: '', realise: '', rythme: '', fc: '', axe: '', pr: '', qrs: '', qtc: '', st: '', ondeT: '', autres: '', interpretation: '' };
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function emptyObservation(identity?: Partial<PatientIdentity>): Observation {
  return {
    version: 1,
    identite: { ...emptyIdentity(), ...(identity ?? {}), personnePrevenir: { ...emptyIdentity().personnePrevenir, ...(identity?.personnePrevenir ?? {}) } },
    admission: { date: nowLocal(), service: '', medecin: '', mode: '', provenance: '', informateurs: [], fiabilite: '', fiabiliteDetail: '' },
    motif: { principal: '', secondaires: [], symptomes: '', dateDebut: '', circonstances: '', caractere: '', formulation: '' },
    atcd: {
      medicaux: {},
      medicauxAucun: false,
      chirurgicaux: { entries: [] },
      gyneco: emptyGyneco(),
      familiaux: { cats: {}, entries: [] },
      toxiques: emptyToxiques(),
      allergies: { statut: '', entries: [] },
      traitements: { statut: '', entries: [] },
    },
    hdm: { symptomes: [], traitementsAvant: { entries: [] }, recit: '', parcours: '' },
    findings: {},
    fields: {},
    constantes: {
      temperature: '', pas: '', pad: '', fc: '', fr: '', spo2: '', o2: '', o2Debit: '', glycemie: '', glycemieUnite: 'g/L',
      poids: '', taille: '', eva: '', glasgow: '', diurese: '', heure: '', autres: '',
    },
    appareils: {},
    specials: {
      pouls: {}, paBras: { droit: '', gauche: '' }, souffles: [], mrc: {}, rot: {}, nerfs: {},
      adenopathies: [], airesExaminees: [], articulations: [], lesions: [],
    },
    scores: {},
    examens: { bio: [], ecg: emptyECG(), autres: [] },
    syntheseNote: '',
    discussion: {
      syndromes: '', diagnosticPrincipal: '', argumentsPour: '', argumentsContre: '', differentiels: [], urgences: '',
      hypotheses: [], examensNecessaires: '', diagnosticRetenu: '', statutDiagnostic: '', commentaire: '',
    },
    cat: {
      mesures: [], mesuresDetail: '', traitements: [], examensDemandes: [], examensDetail: '', surveillance: [],
      surveillanceDetail: '', avis: [], orientation: '', orientationDetail: '', consignes: '', reevaluation: '',
    },
    redaction: { overrides: {}, verifies: {} },
  };
}

/** Complète une observation partielle (ancienne version, import) avec les valeurs par défaut. */
export function normalizeObservation(raw: unknown): Observation {
  const base = emptyObservation();
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return deepMerge(base, src) as Observation;
}

function deepMerge(base: unknown, src: unknown): unknown {
  if (src === undefined) return base;
  if (Array.isArray(base)) return Array.isArray(src) ? src : base;
  if (base && typeof base === 'object') {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return base;
    const out: Record<string, unknown> = { ...(src as Record<string, unknown>) };
    for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
      out[k] = deepMerge(v, (src as Record<string, unknown>)[k]);
    }
    return out;
  }
  return typeof src === typeof base || base === undefined ? src : base;
}
