/**
 * Constantes vitales : unités, bornes de plausibilité et signalement des valeurs anormales.
 * Le signalement est descriptif (« FC élevée ») et ne pose aucun diagnostic.
 */
import { glycemieMmol, imc, num } from '../engine/calc.ts';
import type { Constantes } from '../../shared/types.ts';

export type Niveau = 'info' | 'attention' | 'critique';

export interface AlerteConstante {
  champ: keyof Constantes;
  niveau: Niveau;
  message: string;
}

export interface ConstanteDef {
  id: keyof Constantes;
  label: string;
  court: string;
  unit: string;
  min: number;
  max: number;
  ref: string;
  step?: string;
}

export const CONSTANTES_DEF: ConstanteDef[] = [
  { id: 'temperature', label: 'Température', court: 'T°', unit: '°C', min: 25, max: 45, ref: '36,1 – 37,8', step: '0.1' },
  { id: 'pas', label: 'PA systolique', court: 'PAS', unit: 'mmHg', min: 40, max: 300, ref: '90 – 139' },
  { id: 'pad', label: 'PA diastolique', court: 'PAD', unit: 'mmHg', min: 20, max: 200, ref: '60 – 89' },
  { id: 'fc', label: 'Fréquence cardiaque', court: 'FC', unit: 'bpm', min: 15, max: 300, ref: '60 – 100' },
  { id: 'fr', label: 'Fréquence respiratoire', court: 'FR', unit: 'cpm', min: 3, max: 80, ref: '12 – 20' },
  { id: 'spo2', label: 'Saturation pulsée en O₂', court: 'SpO₂', unit: '%', min: 40, max: 100, ref: '≥ 95 (88–92 si hypercapnie chronique)' },
  { id: 'glycemie', label: 'Glycémie capillaire', court: 'Glyc.', unit: '', min: 0.1, max: 60, ref: '0,70 – 1,10 g/L à jeun', step: '0.01' },
  { id: 'poids', label: 'Poids', court: 'Poids', unit: 'kg', min: 1, max: 350, ref: '', step: '0.1' },
  { id: 'taille', label: 'Taille', court: 'Taille', unit: 'cm', min: 40, max: 250, ref: '' },
  { id: 'eva', label: 'Douleur (EVA / EN)', court: 'EVA', unit: '/10', min: 0, max: 10, ref: '0' },
  { id: 'glasgow', label: 'Score de Glasgow', court: 'GCS', unit: '/15', min: 3, max: 15, ref: '15' },
  { id: 'diurese', label: 'Diurèse', court: 'Diurèse', unit: 'mL/24 h', min: 0, max: 15000, ref: '≥ 0,5 mL/kg/h' },
];

export const CONSTANTE_BY_ID = Object.fromEntries(CONSTANTES_DEF.map((c) => [c.id, c])) as Record<keyof Constantes, ConstanteDef>;

/** Valeurs hors bornes de plausibilité (erreur de saisie probable) */
export function erreursSaisie(c: Constantes): AlerteConstante[] {
  const out: AlerteConstante[] = [];
  for (const def of CONSTANTES_DEF) {
    const v = num(c[def.id]);
    if (v === null) continue;
    let max = def.max;
    let min = def.min;
    if (def.id === 'glycemie' && c.glycemieUnite === 'g/L') { min = 0.1; max = 10; }
    if (v < min || v > max) {
      out.push({ champ: def.id, niveau: 'attention', message: `${def.label} : valeur ${String(v).replace('.', ',')} ${def.unit} hors des bornes plausibles — vérifier la saisie.` });
    }
    if ((def.id === 'eva' || def.id === 'glasgow') && !Number.isInteger(v)) {
      out.push({ champ: def.id, niveau: 'attention', message: `${def.label} : un nombre entier est attendu.` });
    }
  }
  const pas = num(c.pas);
  const pad = num(c.pad);
  if (pas !== null && pad !== null && pad >= pas) {
    out.push({ champ: 'pad', niveau: 'attention', message: 'La PA diastolique est supérieure ou égale à la systolique — vérifier la saisie.' });
  }
  return out;
}

/** Signalement des constantes potentiellement préoccupantes (sans diagnostic). */
export function alertesConstantes(c: Constantes, opts: { hypercapnieChronique?: boolean } = {}): AlerteConstante[] {
  const out: AlerteConstante[] = [];
  const add = (champ: keyof Constantes, niveau: Niveau, message: string) => out.push({ champ, niveau, message });

  const t = num(c.temperature);
  if (t !== null) {
    if (t >= 40) add('temperature', 'critique', `Température très élevée (${fr(t)} °C ≥ 40 °C).`);
    else if (t >= 38) add('temperature', 'attention', `Température élevée (${fr(t)} °C ≥ 38 °C).`);
    else if (t < 35) add('temperature', 'critique', `Température basse (${fr(t)} °C < 35 °C).`);
    else if (t < 36) add('temperature', 'attention', `Température basse (${fr(t)} °C < 36 °C).`);
  }
  const pas = num(c.pas);
  const pad = num(c.pad);
  if (pas !== null) {
    if (pas < 90) add('pas', 'critique', `PA systolique basse (${pas} mmHg < 90 mmHg).`);
    else if (pas >= 180) add('pas', 'critique', `PA systolique très élevée (${pas} mmHg ≥ 180 mmHg).`);
    else if (pas >= 140) add('pas', 'attention', `PA systolique élevée (${pas} mmHg ≥ 140 mmHg).`);
  }
  if (pad !== null) {
    if (pad >= 110) add('pad', 'critique', `PA diastolique très élevée (${pad} mmHg ≥ 110 mmHg).`);
    else if (pad >= 90) add('pad', 'attention', `PA diastolique élevée (${pad} mmHg ≥ 90 mmHg).`);
    else if (pad < 50) add('pad', 'attention', `PA diastolique basse (${pad} mmHg < 50 mmHg).`);
  }
  if (pas !== null && pad !== null) {
    const m = (pas + 2 * pad) / 3;
    if (m < 65) add('pas', 'critique', `PA moyenne basse (${Math.round(m)} mmHg < 65 mmHg).`);
  }
  const fc = num(c.fc);
  if (fc !== null) {
    if (fc > 130) add('fc', 'critique', `FC très élevée (${fc} bpm > 130).`);
    else if (fc > 100) add('fc', 'attention', `FC élevée (${fc} bpm > 100).`);
    else if (fc < 40) add('fc', 'critique', `FC très basse (${fc} bpm < 40).`);
    else if (fc < 50) add('fc', 'attention', `FC basse (${fc} bpm < 50).`);
  }
  if (fc !== null && pas !== null && pas > 0 && fc / pas >= 1) {
    add('fc', 'critique', `Index de choc (FC/PAS) ≥ 1 (${fr(fc / pas, 2)}).`);
  }
  const fr_ = num(c.fr);
  if (fr_ !== null) {
    if (fr_ >= 30) add('fr', 'critique', `FR très élevée (${fr_} cpm ≥ 30).`);
    else if (fr_ > 20) add('fr', 'attention', `FR élevée (${fr_} cpm > 20).`);
    else if (fr_ < 8) add('fr', 'critique', `FR très basse (${fr_} cpm < 8).`);
    else if (fr_ < 12) add('fr', 'attention', `FR basse (${fr_} cpm < 12).`);
  }
  const sp = num(c.spo2);
  if (sp !== null) {
    const seuil = opts.hypercapnieChronique ? 88 : 94;
    const sousO2 = c.o2 === 'o2' ? ' sous oxygène' : '';
    if (sp < (opts.hypercapnieChronique ? 85 : 90)) add('spo2', 'critique', `SpO₂ basse (${sp} %${sousO2}).`);
    else if (sp < seuil) add('spo2', 'attention', `SpO₂ inférieure à ${seuil} % (${sp} %${sousO2}).`);
  }
  if (c.spo2 && !c.o2) add('spo2', 'info', 'Préciser si la SpO₂ est mesurée en air ambiant ou sous oxygène.');
  const g = num(c.glycemie);
  if (g !== null) {
    const mmol = glycemieMmol(g, c.glycemieUnite || 'g/L');
    const aff = `${fr(g, 2)} ${c.glycemieUnite || 'g/L'}`;
    if (mmol < 3) add('glycemie', 'critique', `Glycémie capillaire très basse (${aff}).`);
    else if (mmol < 3.9) add('glycemie', 'attention', `Glycémie capillaire basse (${aff} < 0,70 g/L).`);
    else if (mmol >= 13.9) add('glycemie', 'critique', `Glycémie capillaire très élevée (${aff} ≥ 2,50 g/L) — rechercher une cétose.`);
    else if (mmol >= 10) add('glycemie', 'attention', `Glycémie capillaire élevée (${aff} ≥ 1,80 g/L).`);
  }
  const gcs = num(c.glasgow);
  if (gcs !== null) {
    if (gcs <= 8) add('glasgow', 'critique', `Score de Glasgow ≤ 8 (${gcs}/15) — protection des voies aériennes à évaluer.`);
    else if (gcs < 15) add('glasgow', 'attention', `Score de Glasgow abaissé (${gcs}/15).`);
  }
  const eva = num(c.eva);
  if (eva !== null && eva >= 7) add('eva', 'attention', `Douleur intense (EVA ${eva}/10).`);
  const p = num(c.poids);
  const d = num(c.diurese);
  if (d !== null) {
    if (d < 100) add('diurese', 'critique', `Diurèse très basse (${d} mL/24 h).`);
    else if (p && d / p / 24 < 0.5) add('diurese', 'attention', `Diurèse < 0,5 mL/kg/h (${fr(d / p / 24, 2)} mL/kg/h).`);
    else if (d < 500) add('diurese', 'attention', `Diurèse < 500 mL/24 h (${d} mL).`);
    else if (d > 3000) add('diurese', 'info', `Diurèse > 3 L/24 h (${d} mL).`);
  }
  const bmi = imc(p, num(c.taille));
  if (bmi !== null && (bmi < 18.5 || bmi >= 30)) add('poids', 'info', `IMC à ${fr(bmi)} kg/m².`);
  return out;
}

function fr(n: number, d = 1): string {
  return String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
}
