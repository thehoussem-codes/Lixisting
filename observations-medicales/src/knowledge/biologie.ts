/**
 * Bibliothèque des analyses biologiques usuelles (adulte).
 * Les valeurs de référence sont indicatives : celles du laboratoire priment et peuvent être saisies.
 * Chaque analyte a une unité canonique ; les autres unités proposées ont un facteur de conversion
 * vers l'unité canonique afin de comparer la valeur aux bornes.
 */

export interface Unite {
  u: string;
  /** Facteur multiplicatif vers l'unité canonique */
  f: number;
}

export interface Analyte {
  id: string;
  label: string;
  /** Unités proposées ; la première est l'unité canonique (f = 1) */
  unites: Unite[];
  min?: number;
  max?: number;
  /** Bornes différentes selon le sexe */
  minF?: number;
  maxF?: number;
  /** Libellés d'interprétation descriptifs (pas de diagnostic) */
  bas?: string;
  haut?: string;
  note?: string;
}

const A = (id: string, label: string, unites: Unite[], ref: Partial<Analyte> = {}): Analyte => ({ id, label, unites, ...ref });
const U = (u: string, f = 1): Unite => ({ u, f });

export const ANALYTES: Analyte[] = [
  // Hémogramme
  A('hb', 'Hémoglobine', [U('g/dL'), U('g/L', 0.1)], { min: 13, max: 17, minF: 12, maxF: 16, bas: 'basse', haut: 'élevée' }),
  A('ht', 'Hématocrite', [U('%')], { min: 40, max: 52, minF: 36, maxF: 47 }),
  A('vgm', 'VGM', [U('fL')], { min: 80, max: 100, bas: 'bas (microcytose)', haut: 'élevé (macrocytose)' }),
  A('ccmh', 'CCMH', [U('g/dL')], { min: 32, max: 36 }),
  A('gb', 'Leucocytes', [U('G/L'), U('/mm³', 0.001)], { min: 4, max: 10 }),
  A('pnn', 'Polynucléaires neutrophiles', [U('G/L'), U('/mm³', 0.001)], { min: 1.5, max: 7 }),
  A('lympho', 'Lymphocytes', [U('G/L'), U('/mm³', 0.001)], { min: 1, max: 4 }),
  A('eosino', 'Polynucléaires éosinophiles', [U('G/L'), U('/mm³', 0.001)], { max: 0.5 }),
  A('mono', 'Monocytes', [U('G/L'), U('/mm³', 0.001)], { min: 0.2, max: 1 }),
  A('plq', 'Plaquettes', [U('G/L'), U('/mm³', 0.001)], { min: 150, max: 400 }),
  A('reticulo', 'Réticulocytes', [U('G/L')], { min: 20, max: 120 }),
  // Inflammation
  A('crp', 'CRP', [U('mg/L')], { max: 5 }),
  A('vs', 'VS (1re heure)', [U('mm')], { note: 'Normale ≈ âge/2 (homme), (âge+10)/2 (femme).' }),
  A('pct', 'Procalcitonine', [U('ng/mL'), U('µg/L')], { max: 0.5 }),
  A('fibrinogene', 'Fibrinogène', [U('g/L')], { min: 2, max: 4 }),
  A('ferritine', 'Ferritine', [U('µg/L'), U('ng/mL')], { min: 30, max: 300, minF: 15, maxF: 200 }),
  // Ionogramme et rein
  A('na', 'Sodium (natrémie)', [U('mmol/L')], { min: 135, max: 145 }),
  A('k', 'Potassium (kaliémie)', [U('mmol/L')], { min: 3.5, max: 5 }),
  A('cl', 'Chlore', [U('mmol/L')], { min: 98, max: 107 }),
  A('hco3', 'Bicarbonates', [U('mmol/L')], { min: 22, max: 29 }),
  A('protides', 'Protides totaux', [U('g/L')], { min: 60, max: 80 }),
  A('uree', 'Urée', [U('mmol/L'), U('g/L', 16.65)], { min: 2.5, max: 7.5 }),
  A('creat', 'Créatinine', [U('µmol/L'), U('mg/L', 8.84), U('mg/dL', 88.4)], { min: 60, max: 110, minF: 45, maxF: 90 }),
  A('glycemie', 'Glycémie veineuse', [U('mmol/L'), U('g/L', 5.551), U('mg/dL', 0.0555)], { min: 3.9, max: 6.1, note: 'Valeurs à jeun.' }),
  A('ca', 'Calcium total', [U('mmol/L'), U('mg/L', 0.02495)], { min: 2.2, max: 2.6 }),
  A('phos', 'Phosphore', [U('mmol/L'), U('mg/L', 0.0323)], { min: 0.8, max: 1.45 }),
  A('mg', 'Magnésium', [U('mmol/L'), U('mg/L', 0.0411)], { min: 0.7, max: 1.05 }),
  A('ac_urique', 'Acide urique', [U('µmol/L'), U('mg/L', 5.95)], { min: 150, max: 420, minF: 140, maxF: 360 }),
  A('albumine', 'Albumine', [U('g/L')], { min: 35, max: 50 }),
  // Bilan hépatique
  A('asat', 'ASAT', [U('UI/L')], { max: 40 }),
  A('alat', 'ALAT', [U('UI/L')], { max: 40 }),
  A('ggt', 'GGT', [U('UI/L')], { max: 55, maxF: 38 }),
  A('pal', 'Phosphatases alcalines', [U('UI/L')], { min: 40, max: 130 }),
  A('bilit', 'Bilirubine totale', [U('µmol/L'), U('mg/L', 1.71), U('mg/dL', 17.1)], { max: 17 }),
  A('bilic', 'Bilirubine conjuguée', [U('µmol/L'), U('mg/L', 1.71)], { max: 5 }),
  A('lipase', 'Lipase', [U('UI/L')], { max: 60 }),
  A('ldh', 'LDH', [U('UI/L')], { max: 250 }),
  A('cpk', 'CPK', [U('UI/L')], { max: 190, maxF: 170 }),
  // Coagulation
  A('tp', 'Taux de prothrombine', [U('%')], { min: 70, max: 100 }),
  A('inr', 'INR', [U('')], { min: 0.8, max: 1.2, note: 'Cible thérapeutique 2–3 sous AVK (hors valve mécanique).' }),
  A('tca', 'TCA (ratio)', [U('')], { max: 1.2 }),
  A('ddimeres', 'D-dimères', [U('µg/L FEU'), U('ng/mL FEU'), U('mg/L FEU', 1000)], { max: 500, note: 'Seuil ajusté à l’âge après 50 ans : âge × 10 µg/L.' }),
  // Cardiaque
  A('tropo', 'Troponine', [U('ng/L'), U('µg/L', 1000)], { note: 'Seuil (99e percentile) propre à la technique du laboratoire : le saisir.' }),
  A('bnp', 'BNP', [U('pg/mL'), U('ng/L')], { max: 100 }),
  A('ntprobnp', 'NT-proBNP', [U('pg/mL'), U('ng/L')], { max: 300, note: 'Seuils d’exclusion d’IC aiguë : < 300 pg/mL ; seuils d’inclusion selon l’âge.' }),
  A('lactates', 'Lactates', [U('mmol/L')], { max: 2 }),
  // Lipides et glucides
  A('ct', 'Cholestérol total', [U('mmol/L'), U('g/L', 2.586)], { max: 5.2 }),
  A('ldl', 'LDL-cholestérol', [U('mmol/L'), U('g/L', 2.586)], { note: 'Cible selon le niveau de risque cardiovasculaire.' }),
  A('hdl', 'HDL-cholestérol', [U('mmol/L'), U('g/L', 2.586)], { min: 1.0 }),
  A('tg', 'Triglycérides', [U('mmol/L'), U('g/L', 1.142)], { max: 1.7 }),
  A('hba1c', 'HbA1c', [U('%')], { max: 6, note: 'Objectif individualisé chez le diabétique.' }),
  // Hormonologie
  A('tsh', 'TSH', [U('mUI/L')], { min: 0.4, max: 4 }),
  A('t4l', 'T4 libre', [U('pmol/L')], { min: 10, max: 22 }),
  A('cortisol', 'Cortisol (8 h)', [U('nmol/L')], { min: 140, max: 690 }),
  A('bhcg', 'β-hCG', [U('UI/L')], { note: 'Négatif < 5 UI/L.' }),
  A('vitd', '25-OH vitamine D', [U('ng/mL'), U('nmol/L', 0.4)], { min: 30 }),
  A('b12', 'Vitamine B12', [U('pmol/L')], { min: 150 }),
  A('folates', 'Folates', [U('nmol/L')], { min: 7 }),
  // Gaz du sang
  A('ph', 'pH artériel', [U('')], { min: 7.35, max: 7.45 }),
  A('pao2', 'PaO2', [U('mmHg'), U('kPa', 7.5)], { min: 80, max: 100 }),
  A('paco2', 'PaCO2', [U('mmHg'), U('kPa', 7.5)], { min: 35, max: 45 }),
  A('sao2', 'SaO2', [U('%')], { min: 95 }),
  // Immunologie
  A('aan', 'Anticorps antinucléaires', [U('titre')], { note: 'Significatif ≥ 1/160 chez l’adulte.' }),
  A('c3', 'Complément C3', [U('g/L')], { min: 0.9, max: 1.8 }),
  A('c4', 'Complément C4', [U('g/L')], { min: 0.1, max: 0.4 }),
];

export const ANALYTE_BY_ID: Record<string, Analyte> = Object.fromEntries(ANALYTES.map((a) => [a.id, a]));

export interface Panel {
  id: string;
  label: string;
  analytes: string[];
}

export const PANELS: Panel[] = [
  { id: 'nfs', label: 'NFS (hémogramme)', analytes: ['hb', 'vgm', 'ccmh', 'gb', 'pnn', 'lympho', 'eosino', 'plq'] },
  { id: 'inflam', label: 'Syndrome inflammatoire (CRP, VS, PCT)', analytes: ['crp', 'vs', 'pct', 'fibrinogene'] },
  { id: 'iono', label: 'Ionogramme sanguin', analytes: ['na', 'k', 'cl', 'hco3', 'protides'] },
  { id: 'renal', label: 'Fonction rénale', analytes: ['uree', 'creat'] },
  { id: 'hepat', label: 'Bilan hépatique', analytes: ['asat', 'alat', 'ggt', 'pal', 'bilit', 'bilic', 'albumine'] },
  { id: 'lipase', label: 'Lipasémie', analytes: ['lipase'] },
  { id: 'lipides', label: 'Bilan lipidique', analytes: ['ct', 'ldl', 'hdl', 'tg'] },
  { id: 'gly', label: 'Glycémie et HbA1c', analytes: ['glycemie', 'hba1c'] },
  { id: 'coag', label: 'Bilan de coagulation', analytes: ['tp', 'inr', 'tca', 'fibrinogene'] },
  { id: 'cardiaque', label: 'Marqueurs cardiaques', analytes: ['tropo', 'bnp', 'ntprobnp', 'ddimeres', 'cpk'] },
  { id: 'phosphocalc', label: 'Bilan phosphocalcique', analytes: ['ca', 'phos', 'mg', 'albumine', 'vitd'] },
  { id: 'hormonal', label: 'Bilan hormonal', analytes: ['tsh', 't4l', 'cortisol', 'bhcg'] },
  { id: 'martial', label: 'Bilan martial et vitaminique', analytes: ['ferritine', 'b12', 'folates', 'reticulo'] },
  { id: 'gds', label: 'Gaz du sang artériel', analytes: ['ph', 'pao2', 'paco2', 'hco3', 'sao2', 'lactates'] },
  { id: 'immuno', label: 'Examens immunologiques', analytes: ['aan', 'c3', 'c4'] },
  { id: 'libre', label: 'Autre (saisie libre)', analytes: [] },
];

export const PANEL_BY_ID: Record<string, Panel> = Object.fromEntries(PANELS.map((p) => [p.id, p]));

export const EXAMENS_AUTRES: Record<string, string[]> = {
  'Bactériologie': ['ECBU', 'Hémocultures', 'Coproculture', 'Prélèvement de gorge', 'Ponction lombaire (LCS)', 'Ponction pleurale', 'Ponction d’ascite', 'Ponction articulaire', 'Crachats / ECBC', 'Recherche de BK', 'Antigénuries', 'PCR'],
  'Imagerie': ['Radiographie thoracique', 'Radiographie (autre)', 'Échographie abdominale', 'Échographie cardiaque', 'Échographie-Doppler veineux', 'Échographie-Doppler artériel', 'Scanner cérébral', 'Scanner thoracique', 'Angioscanner thoracique', 'Scanner abdomino-pelvien', 'IRM cérébrale', 'IRM (autre)', 'Scintigraphie', 'TEP-scanner'],
  'Endoscopie': ['Fibroscopie œso-gastro-duodénale', 'Coloscopie', 'Fibroscopie bronchique', 'Cystoscopie'],
  'Autres explorations': ['EFR', 'EEG', 'EMG', 'Holter ECG', 'MAPA', 'Épreuve d’effort', 'Biopsie', 'Myélogramme', 'Fond d’œil'],
};

/** Statut d'une valeur par rapport aux bornes de référence */
export function statutValeur(
  valeur: number,
  unite: string,
  analyte: Analyte | undefined,
  refMin: number | null,
  refMax: number | null,
  sexe: 'M' | 'F' | '',
): 'bas' | 'haut' | 'normal' | null {
  // Bornes saisies par l'utilisateur : comparaison directe dans l'unité saisie
  if (refMin !== null || refMax !== null) {
    if (refMin !== null && valeur < refMin) return 'bas';
    if (refMax !== null && valeur > refMax) return 'haut';
    return 'normal';
  }
  if (!analyte) return null;
  const u = analyte.unites.find((x) => x.u === unite);
  if (!u) return null;
  const v = valeur * u.f;
  const min = sexe === 'F' && analyte.minF !== undefined ? analyte.minF : analyte.min;
  const max = sexe === 'F' && analyte.maxF !== undefined ? analyte.maxF : analyte.max;
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && v < min) return 'bas';
  if (max !== undefined && v > max) return 'haut';
  return 'normal';
}

/** Bornes affichables dans l'unité choisie */
export function bornesAffichees(analyte: Analyte | undefined, unite: string, sexe: 'M' | 'F' | ''): string {
  if (!analyte) return '';
  const u = analyte.unites.find((x) => x.u === unite);
  if (!u) return '';
  const min = sexe === 'F' && analyte.minF !== undefined ? analyte.minF : analyte.min;
  const max = sexe === 'F' && analyte.maxF !== undefined ? analyte.maxF : analyte.max;
  const conv = (x: number) => {
    const r = x / u.f;
    const d = r >= 100 ? 0 : r >= 10 ? 1 : r >= 1 ? 2 : 3;
    return String(Math.round(r * 10 ** d) / 10 ** d).replace('.', ',');
  };
  if (min !== undefined && max !== undefined) return `${conv(min)} – ${conv(max)}`;
  if (max !== undefined) return `< ${conv(max)}`;
  if (min !== undefined) return `> ${conv(min)}`;
  return '';
}
