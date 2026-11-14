/**
 * Bibliothèque des classifications et scores cliniques.
 * Chaque score propose : critères, calcul, interprétation (aide à la décision, jamais une conclusion),
 * critère de pertinence contextuelle et pré-remplissage à partir des données saisies.
 */
import type { Ctx } from '../engine/context.ts';
import { classeIMC, fmtNum } from '../engine/calc.ts';
import type { Niveau } from './constantes.ts';

export interface ScoreOption {
  v: string;
  label: string;
  pts: number;
}

export interface ScoreItem {
  id: string;
  label: string;
  type: 'select' | 'check' | 'number';
  options?: ScoreOption[];
  pts?: number;
  hint?: string;
  unit?: string;
}

export interface ScoreResult {
  total: number | null;
  /** Ex. « 7/15 », « Classe B » */
  valeur: string;
  interpretation: string;
  niveau: Niveau;
  complet: boolean;
  manquants: string[];
}

export interface ScoreDef {
  id: string;
  nom: string;
  categorie: string;
  description: string;
  items: ScoreItem[];
  compute: (inp: Inputs) => ScoreResult;
  pertinence: (ctx: Ctx) => string | null;
  prefill?: (ctx: Ctx) => Inputs;
  reference?: string;
}

export type Inputs = Record<string, string | undefined>;

/* ------------------------------------------------------------------ */
/* Aides à la construction                                              */
/* ------------------------------------------------------------------ */

const O = (v: string | number, label: string, pts: number = Number(v)): ScoreOption => ({ v: String(v), label, pts });
const C = (id: string, label: string, pts = 1, hint?: string): ScoreItem => ({ id, label, type: 'check', pts, hint });
const SEL = (id: string, label: string, options: ScoreOption[], hint?: string): ScoreItem => ({ id, label, type: 'select', options, hint });

interface Seuil {
  max: number;
  txt: string;
  niveau: Niveau;
}

function sumCompute(items: ScoreItem[], seuils: Seuil[], fmt: (t: number) => string): (inp: Inputs) => ScoreResult {
  return (inp) => {
    let total = 0;
    const manquants: string[] = [];
    for (const it of items) {
      const v = inp[it.id];
      if (v === undefined || v === '') {
        manquants.push(it.label);
        continue;
      }
      if (it.type === 'check') total += v === '1' ? it.pts ?? 1 : 0;
      else if (it.type === 'select') total += it.options?.find((o) => o.v === v)?.pts ?? 0;
    }
    const s = seuils.find((x) => total <= x.max) ?? seuils[seuils.length - 1];
    const complet = manquants.length === 0;
    return { total, valeur: fmt(total), interpretation: s.txt, niveau: s.niveau, complet, manquants };
  };
}

function classif(id: string, nom: string, categorie: string, description: string, options: { v: string; label: string; txt: string; niveau: Niveau }[], pertinence: ScoreDef['pertinence'], prefill?: ScoreDef['prefill']): ScoreDef {
  return {
    id, nom, categorie, description,
    items: [{ id: 'classe', label: 'Classe / stade', type: 'select', options: options.map((o, i) => O(o.v, o.label, i)) }],
    compute: (inp) => {
      const o = options.find((x) => x.v === inp.classe);
      if (!o) return { total: null, valeur: '', interpretation: '', niveau: 'info', complet: false, manquants: ['Classe / stade'] };
      return { total: null, valeur: o.v, interpretation: o.txt, niveau: o.niveau, complet: true, manquants: [] };
    },
    pertinence,
    prefill,
  };
}

const b = (x: boolean | null | undefined): string | undefined => (x === null || x === undefined ? undefined : x ? '1' : '0');
const anyPain = (ctx: Ctx) => ctx.symptomDefs.some((s) => s.douleur);
const kw = (ctx: Ctx, ...mots: string[]) => mots.some((m) => ctx.texte.includes(m));
const fa = (ctx: Ctx) => kw(ctx, 'fibrillation', 'flutter', ' acfa', 'fa ') || ctx.field('rythme_cardiaque').startsWith('irrég');
const conscienceAlteree = (ctx: Ctx) => {
  const c = ctx.field('conscience');
  return (c !== '' && c !== 'conscient') || (ctx.vit.gcs !== null && ctx.vit.gcs < 15);
};

/* ------------------------------------------------------------------ */
/* Scores                                                               */
/* ------------------------------------------------------------------ */

const glasgowItems: ScoreItem[] = [
  SEL('E', 'Ouverture des yeux (E)', [O(4, '4 – Spontanée'), O(3, '3 – À la demande / au bruit'), O(2, '2 – À la douleur'), O(1, '1 – Aucune')]),
  SEL('V', 'Réponse verbale (V)', [O(5, '5 – Orientée'), O(4, '4 – Confuse'), O(3, '3 – Inappropriée'), O(2, '2 – Incompréhensible'), O(1, '1 – Aucune')]),
  SEL('M', 'Réponse motrice (M)', [O(6, '6 – Obéit aux ordres'), O(5, '5 – Localise la douleur'), O(4, '4 – Évitement (retrait)'), O(3, '3 – Flexion anormale (décortication)'), O(2, '2 – Extension (décérébration)'), O(1, '1 – Aucune')]),
];

const nihssItems: ScoreItem[] = [
  SEL('1a', '1a. Niveau de conscience', [O(0, '0 – Vigilant'), O(1, '1 – Somnolent'), O(2, '2 – Stuporeux'), O(3, '3 – Coma')]),
  SEL('1b', '1b. Questions (mois, âge)', [O(0, '0 – Deux bonnes réponses'), O(1, '1 – Une bonne réponse'), O(2, '2 – Aucune bonne réponse')]),
  SEL('1c', '1c. Ordres (yeux, main)', [O(0, '0 – Deux ordres exécutés'), O(1, '1 – Un ordre exécuté'), O(2, '2 – Aucun')]),
  SEL('2', '2. Oculomotricité horizontale', [O(0, '0 – Normale'), O(1, '1 – Paralysie partielle'), O(2, '2 – Déviation forcée')]),
  SEL('3', '3. Champ visuel', [O(0, '0 – Normal'), O(1, '1 – Hémianopsie partielle'), O(2, '2 – Hémianopsie complète'), O(3, '3 – Cécité bilatérale')]),
  SEL('4', '4. Paralysie faciale', [O(0, '0 – Absente'), O(1, '1 – Mineure'), O(2, '2 – Partielle'), O(3, '3 – Complète')]),
  SEL('5a', '5a. Motricité MS gauche', [O(0, '0 – Pas de chute'), O(1, '1 – Chute avant 10 s'), O(2, '2 – Effort contre pesanteur'), O(3, '3 – Pas d’effort contre pesanteur'), O(4, '4 – Aucun mouvement')]),
  SEL('5b', '5b. Motricité MS droit', [O(0, '0 – Pas de chute'), O(1, '1 – Chute avant 10 s'), O(2, '2 – Effort contre pesanteur'), O(3, '3 – Pas d’effort contre pesanteur'), O(4, '4 – Aucun mouvement')]),
  SEL('6a', '6a. Motricité MI gauche', [O(0, '0 – Pas de chute'), O(1, '1 – Chute avant 5 s'), O(2, '2 – Effort contre pesanteur'), O(3, '3 – Pas d’effort contre pesanteur'), O(4, '4 – Aucun mouvement')]),
  SEL('6b', '6b. Motricité MI droit', [O(0, '0 – Pas de chute'), O(1, '1 – Chute avant 5 s'), O(2, '2 – Effort contre pesanteur'), O(3, '3 – Pas d’effort contre pesanteur'), O(4, '4 – Aucun mouvement')]),
  SEL('7', '7. Ataxie des membres', [O(0, '0 – Absente'), O(1, '1 – Un membre'), O(2, '2 – Deux membres')]),
  SEL('8', '8. Sensibilité', [O(0, '0 – Normale'), O(1, '1 – Hypoesthésie modérée'), O(2, '2 – Anesthésie sévère')]),
  SEL('9', '9. Langage', [O(0, '0 – Normal'), O(1, '1 – Aphasie modérée'), O(2, '2 – Aphasie sévère'), O(3, '3 – Mutisme / aphasie globale')]),
  SEL('10', '10. Dysarthrie', [O(0, '0 – Normale'), O(1, '1 – Modérée'), O(2, '2 – Sévère')]),
  SEL('11', '11. Extinction / négligence', [O(0, '0 – Absente'), O(1, '1 – Partielle'), O(2, '2 – Totale')]),
];

const news2Compute = (inp: Inputs): ScoreResult => {
  const n = (k: string) => (inp[k] === undefined || inp[k] === '' ? null : Number(String(inp[k]).replace(',', '.')));
  const manquants: string[] = [];
  let total = 0;
  let unTrois = false;
  const part = (v: number | null, label: string, f: (x: number) => number) => {
    if (v === null || Number.isNaN(v)) { manquants.push(label); return; }
    const p = f(v);
    if (p === 3) unTrois = true;
    total += p;
  };
  part(n('fr'), 'Fréquence respiratoire', (x) => (x <= 8 ? 3 : x <= 11 ? 1 : x <= 20 ? 0 : x <= 24 ? 2 : 3));
  const echelle2 = inp.echelle === '2';
  const sousO2 = inp.o2 === '1';
  part(n('spo2'), 'SpO₂', (x) => {
    if (!echelle2) return x <= 91 ? 3 : x <= 93 ? 2 : x <= 95 ? 1 : 0;
    if (x <= 83) return 3;
    if (x <= 85) return 2;
    if (x <= 87) return 1;
    if (x <= 92 || !sousO2) return 0;
    if (x <= 94) return 1;
    if (x <= 96) return 2;
    return 3;
  });
  if (inp.o2 === undefined || inp.o2 === '') manquants.push('Air ambiant / oxygène');
  else if (sousO2) total += 2;
  part(n('pas'), 'PA systolique', (x) => (x <= 90 ? 3 : x <= 100 ? 2 : x <= 110 ? 1 : x <= 219 ? 0 : 3));
  part(n('fc'), 'Fréquence cardiaque', (x) => (x <= 40 ? 3 : x <= 50 ? 1 : x <= 90 ? 0 : x <= 110 ? 1 : x <= 130 ? 2 : 3));
  if (inp.conscience === undefined || inp.conscience === '') manquants.push('Conscience (ACVPU)');
  else if (inp.conscience === 'cvpu') { total += 3; unTrois = true; }
  part(n('t'), 'Température', (x) => (x <= 35 ? 3 : x <= 36 ? 1 : x <= 38 ? 0 : x <= 39 ? 1 : 2));
  let interpretation: string;
  let niveau: Niveau;
  if (total >= 7) { interpretation = 'Risque clinique élevé : réponse urgente, évaluation par une équipe compétente en soins critiques.'; niveau = 'critique'; }
  else if (total >= 5) { interpretation = 'Risque clinique moyen : évaluation médicale urgente.'; niveau = 'attention'; }
  else if (unTrois) { interpretation = 'Risque faible à moyen (un paramètre à 3) : évaluation médicale rapide.'; niveau = 'attention'; }
  else { interpretation = 'Risque clinique faible : surveillance selon le protocole du service.'; niveau = 'info'; }
  return { total, valeur: `${total}/20`, interpretation, niveau, complet: manquants.length === 0, manquants };
};

export const SCORES: ScoreDef[] = [
  /* -------------------- Neurologie -------------------- */
  {
    id: 'glasgow', nom: 'Score de Glasgow (GCS)', categorie: 'Neurologie',
    description: 'Évaluation quantitative de la conscience (3 à 15).',
    items: glasgowItems,
    compute: (inp) => {
      const r = sumCompute(glasgowItems, [
        { max: 8, txt: 'Altération sévère de la conscience (≤ 8) : protection des voies aériennes à évaluer.', niveau: 'critique' },
        { max: 12, txt: 'Altération modérée de la conscience (9–12).', niveau: 'attention' },
        { max: 14, txt: 'Altération légère de la conscience (13–14).', niveau: 'attention' },
        { max: 15, txt: 'Conscience normale (15).', niveau: 'info' },
      ], (t) => `${t}/15`)(inp);
      if (r.complet) r.valeur = `${r.total}/15 (E${inp.E} V${inp.V} M${inp.M})`;
      return r;
    },
    pertinence: (ctx) => {
      if (conscienceAlteree(ctx)) return 'Altération de la conscience signalée.';
      if (ctx.symptomes.some((s) => ['confusion', 'convulsions', 'deficit_neuro', 'cephalee', 'syncope'].includes(s))) return 'Symptomatologie neurologique.';
      return null;
    },
  },
  {
    id: 'nihss', nom: 'NIHSS', categorie: 'Neurologie',
    description: 'Sévérité d’un déficit neurologique d’origine vasculaire (0 à 42).',
    items: nihssItems,
    compute: sumCompute(nihssItems, [
      { max: 0, txt: 'Pas de déficit mesurable.', niveau: 'info' },
      { max: 4, txt: 'Déficit mineur (1–4).', niveau: 'attention' },
      { max: 15, txt: 'Déficit modéré (5–15).', niveau: 'critique' },
      { max: 20, txt: 'Déficit modéré à sévère (16–20).', niveau: 'critique' },
      { max: 42, txt: 'Déficit sévère (21–42).', niveau: 'critique' },
    ], (t) => `${t}/42`),
    pertinence: (ctx) => (ctx.symptomes.includes('deficit_neuro') || ctx.has('deficit_moteur') || ctx.has('troubles_langage') ? 'Déficit neurologique focal.' : null),
  },
  classif('rankin', 'Échelle de Rankin modifiée', 'Neurologie', 'Handicap fonctionnel global (antérieur ou actuel).', [
    { v: '0', label: '0 – Aucun symptôme', txt: 'Aucun symptôme.', niveau: 'info' },
    { v: '1', label: '1 – Pas d’incapacité significative', txt: 'Symptômes sans incapacité significative ; activités habituelles possibles.', niveau: 'info' },
    { v: '2', label: '2 – Handicap léger', txt: 'Incapable de toutes les activités antérieures mais autonome.', niveau: 'info' },
    { v: '3', label: '3 – Handicap modéré', txt: 'Besoin d’aide mais marche sans assistance.', niveau: 'attention' },
    { v: '4', label: '4 – Handicap modérément sévère', txt: 'Incapable de marcher et de subvenir à ses besoins sans assistance.', niveau: 'attention' },
    { v: '5', label: '5 – Handicap sévère', txt: 'Alité, incontinent, soins permanents.', niveau: 'critique' },
  ], (ctx) => (ctx.symptomes.includes('deficit_neuro') || ctx.atcd('avc') ? 'Pathologie neurovasculaire.' : null)),
  classif('west_haven', 'Classification de West Haven', 'Hépatologie', 'Stade de l’encéphalopathie hépatique.', [
    { v: '0', label: '0 – Minime / absente', txt: 'Pas d’anomalie clinique (encéphalopathie minime possible aux tests psychométriques).', niveau: 'info' },
    { v: '1', label: '1 – Troubles discrets', txt: 'Troubles discrets de l’attention, euphorie ou anxiété, ralentissement.', niveau: 'attention' },
    { v: '2', label: '2 – Léthargie, désorientation', txt: 'Léthargie, désorientation temporelle, comportement inapproprié, astérixis.', niveau: 'attention' },
    { v: '3', label: '3 – Somnolence, confusion', txt: 'Somnolence voire stupeur mais réactif, confusion, désorientation grossière.', niveau: 'critique' },
    { v: '4', label: '4 – Coma', txt: 'Coma.', niveau: 'critique' },
  ], (ctx) => ((ctx.atcd('hepatique') || kw(ctx, 'cirrhose')) && (conscienceAlteree(ctx) || ctx.has('asterixis') || ctx.symptomes.includes('confusion')) ? 'Hépatopathie avec troubles neurologiques.' : null)),

  /* -------------------- Cardiologie -------------------- */
  classif('nyha', 'Classification NYHA', 'Cardiologie', 'Retentissement fonctionnel de la dyspnée d’origine cardiaque.', [
    { v: 'I', label: 'I – Aucune limitation', txt: 'Pas de limitation : l’activité ordinaire n’entraîne pas de symptôme.', niveau: 'info' },
    { v: 'II', label: 'II – Limitation légère', txt: 'Limitation légère : symptômes pour des efforts importants (activité ordinaire).', niveau: 'info' },
    { v: 'III', label: 'III – Limitation marquée', txt: 'Limitation marquée : symptômes pour des efforts inférieurs à l’activité ordinaire.', niveau: 'attention' },
    { v: 'IV', label: 'IV – Symptômes au repos', txt: 'Symptômes au moindre effort ou au repos.', niveau: 'critique' },
  ], (ctx) => (ctx.has('dyspnee') || ctx.symptomes.includes('dyspnee') ? (ctx.atcd('cardio') ? 'Dyspnée chez un patient cardiaque.' : 'Dyspnée.') : null), (ctx) => {
    const x = ctx.obs.findings.dyspnee?.x?.nyha;
    const h = ctx.obs.hdm.symptomes.find((s) => s.type === 'dyspnee')?.a.nyha;
    const v = (h as string) || x;
    return v ? { classe: v } : {};
  }),
  classif('killip', 'Classification de Killip', 'Cardiologie', 'Gravité de l’insuffisance cardiaque au cours d’un syndrome coronarien aigu.', [
    { v: 'I', label: 'I – Pas d’insuffisance cardiaque', txt: 'Absence de signe d’insuffisance cardiaque.', niveau: 'info' },
    { v: 'II', label: 'II – Crépitants < 50 % des champs, B3', txt: 'Insuffisance cardiaque modérée (crépitants limités, galop B3, TJ).', niveau: 'attention' },
    { v: 'III', label: 'III – Œdème aigu pulmonaire', txt: 'Œdème aigu pulmonaire.', niveau: 'critique' },
    { v: 'IV', label: 'IV – Choc cardiogénique', txt: 'Choc cardiogénique.', niveau: 'critique' },
  ], (ctx) => (ctx.symptomes.includes('dl_thoracique') ? 'Douleur thoracique (suspicion de syndrome coronarien).' : null)),
  (() => {
    const items: ScoreItem[] = [
      SEL('H', 'Histoire (anamnèse)', [O(0, '0 – Peu suspecte'), O(1, '1 – Modérément suspecte'), O(2, '2 – Très suspecte')]),
      SEL('E', 'ECG', [O(0, '0 – Normal'), O(1, '1 – Troubles de repolarisation non spécifiques'), O(2, '2 – Sous-décalage ST significatif')]),
      SEL('A', 'Âge', [O(0, '0 – < 45 ans'), O(1, '1 – 45 à 64 ans'), O(2, '2 – ≥ 65 ans')]),
      SEL('R', 'Facteurs de risque', [O(0, '0 – Aucun'), O(1, '1 – 1 ou 2 facteurs'), O(2, '2 – ≥ 3 facteurs ou athérosclérose connue')]),
      SEL('T', 'Troponine', [O(0, '0 – ≤ seuil'), O(1, '1 – 1 à 3 × seuil'), O(2, '2 – > 3 × seuil')]),
    ];
    return {
      id: 'heart', nom: 'Score HEART', categorie: 'Cardiologie',
      description: 'Risque d’événement cardiaque majeur à 6 semaines chez un patient consultant pour douleur thoracique.',
      items,
      compute: sumCompute(items, [
        { max: 3, txt: 'Risque faible (0–3) : risque d’événement majeur ≈ 1–2 %.', niveau: 'info' },
        { max: 6, txt: 'Risque intermédiaire (4–6) : ≈ 12–17 %.', niveau: 'attention' },
        { max: 10, txt: 'Risque élevé (7–10) : ≈ 50–65 %.', niveau: 'critique' },
      ], (t) => `${t}/10`),
      pertinence: (ctx) => (ctx.symptomes.includes('dl_thoracique') ? 'Douleur thoracique.' : null),
      prefill: (ctx) => {
        const out: Inputs = {};
        if (ctx.age !== null) out.A = ctx.age < 45 ? '0' : ctx.age < 65 ? '1' : '2';
        const fdr = [ctx.atcd('hta'), ctx.atcd('diabete'), ['actif', 'sevre'].includes(ctx.obs.atcd.toxiques.tabac), kw(ctx, 'dyslipid', 'hypercholest'), (ctx.vit.imc ?? 0) >= 30, ctx.obs.atcd.familiaux.cats.cv === 'p'].filter(Boolean).length;
        const athero = ctx.atcd('avc') || kw(ctx, 'infarctus', 'coronar', 'artériopathie', 'stent', 'pontage');
        if (athero || fdr >= 3) out.R = '2';
        return out;
      },
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('ic', 'Insuffisance cardiaque / dysfonction VG (C)'),
      C('hta', 'Hypertension artérielle (H)'),
      SEL('age', 'Âge (A₂ / A)', [O(0, '< 65 ans', 0), O(1, '65 à 74 ans', 1), O(2, '≥ 75 ans', 2)]),
      C('diabete', 'Diabète (D)'),
      C('avc', 'AVC / AIT / embolie systémique (S₂)', 2),
      C('vasc', 'Maladie vasculaire : IDM, AOMI, plaque aortique (V)'),
      C('femme', 'Sexe féminin (Sc)'),
    ];
    return {
      id: 'chads', nom: 'CHA₂DS₂-VASc', categorie: 'Cardiologie',
      description: 'Risque thrombo-embolique au cours de la fibrillation atriale non valvulaire.',
      items,
      compute: (inp) => {
        const r = sumCompute(items, [{ max: 99, txt: '', niveau: 'info' }], (t) => `${t}/9`)(inp);
        const t = r.total ?? 0;
        const sexF = inp.femme === '1';
        const va = t - (sexF ? 1 : 0);
        let txt: string;
        let niveau: Niveau = 'info';
        if (va >= 2) { txt = 'Risque thrombo-embolique élevé : une anticoagulation orale est recommandée en l’absence de contre-indication.'; niveau = 'critique'; }
        else if (va === 1) { txt = 'Risque intermédiaire : une anticoagulation orale doit être envisagée (décision individualisée).'; niveau = 'attention'; }
        else txt = 'Risque faible : pas d’indication d’anticoagulation sur ce seul critère.';
        return { ...r, valeur: `${t}/9 (CHA₂DS₂-VA : ${va})`, interpretation: `${txt} Interprétation fondée sur le CHA₂DS₂-VA (sans le critère de sexe), conformément aux recommandations européennes 2024.`, niveau };
      },
      pertinence: (ctx) => (fa(ctx) ? 'Fibrillation atriale mentionnée ou rythme irrégulier.' : ctx.symptomes.includes('palpitations') ? 'Palpitations (si fibrillation atriale documentée).' : null),
      prefill: (ctx) => ({
        hta: b(ctx.obs.atcd.medicaux.hta?.s ? ctx.atcd('hta') : null),
        diabete: b(ctx.obs.atcd.medicaux.diabete?.s ? ctx.atcd('diabete') : null),
        avc: b(ctx.obs.atcd.medicaux.avc?.s ? ctx.atcd('avc') : null),
        ic: kw(ctx, 'insuffisance cardiaque') ? '1' : undefined,
        vasc: kw(ctx, 'infarctus', 'artériopathie', 'aomi', 'coronar') ? '1' : undefined,
        age: ctx.age === null ? undefined : ctx.age >= 75 ? '2' : ctx.age >= 65 ? '1' : '0',
        femme: ctx.sexe ? b(ctx.sexe === 'F') : undefined,
      }),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('h', 'HTA non contrôlée (PAS > 160 mmHg)'),
      C('renal', 'Insuffisance rénale (dialyse, transplantation, créatinine > 200 µmol/L)'),
      C('hep', 'Insuffisance hépatique (cirrhose, bilirubine > 2N, transaminases > 3N)'),
      C('avc', 'Antécédent d’AVC'),
      C('saign', 'Antécédent ou prédisposition hémorragique'),
      C('inr', 'INR labile (sous AVK)'),
      C('age', 'Âge > 65 ans'),
      C('med', 'Médicaments favorisants (antiagrégants, AINS)'),
      C('alcool', 'Alcool (≥ 8 verres/semaine)'),
    ];
    return {
      id: 'hasbled', nom: 'HAS-BLED', categorie: 'Cardiologie',
      description: 'Risque hémorragique sous anticoagulant au cours de la fibrillation atriale.',
      items,
      compute: sumCompute(items, [
        { max: 2, txt: 'Risque hémorragique faible à modéré (0–2).', niveau: 'info' },
        { max: 9, txt: 'Risque hémorragique élevé (≥ 3) : corriger les facteurs modifiables et renforcer la surveillance (ne contre-indique pas à lui seul l’anticoagulation).', niveau: 'attention' },
      ], (t) => `${t}/9`),
      pertinence: (ctx) => (fa(ctx) ? 'Fibrillation atriale (anticoagulation envisagée).' : null),
      prefill: (ctx) => ({
        age: ctx.age === null ? undefined : b(ctx.age > 65),
        avc: ctx.obs.atcd.medicaux.avc?.s ? b(ctx.atcd('avc')) : undefined,
        alcool: ctx.obs.atcd.toxiques.alcool === 'regulier' ? '1' : ctx.obs.atcd.toxiques.alcool === 'non' ? '0' : undefined,
        h: ctx.vit.pas !== null && ctx.vit.pas > 160 ? '1' : undefined,
      }),
    } satisfies ScoreDef;
  })(),

  /* -------------------- Thrombose / embolie -------------------- */
  (() => {
    const items: ScoreItem[] = [
      C('tvp', 'Signes cliniques de TVP', 3),
      C('alt', 'Diagnostic alternatif moins probable que l’EP', 3),
      C('fc', 'FC > 100 bpm', 1.5),
      C('immob', 'Immobilisation ≥ 3 jours ou chirurgie < 4 semaines', 1.5),
      C('atcd', 'Antécédent de TVP ou d’EP', 1.5),
      C('hemopt', 'Hémoptysie', 1),
      C('cancer', 'Cancer actif', 1),
    ];
    return {
      id: 'wells_ep', nom: 'Score de Wells (embolie pulmonaire)', categorie: 'Thrombose',
      description: 'Probabilité clinique pré-test d’embolie pulmonaire.',
      items,
      compute: (inp) => {
        const r = sumCompute(items, [{ max: 99, txt: '', niveau: 'info' }], (t) => `${fmtNum(t)}`)(inp);
        const t = r.total ?? 0;
        const trois = t < 2 ? 'probabilité faible' : t <= 6 ? 'probabilité intermédiaire' : 'probabilité forte';
        const deux = t <= 4 ? 'EP peu probable (≤ 4)' : 'EP probable (> 4)';
        return { ...r, interpretation: `${trois[0].toUpperCase() + trois.slice(1)} ; en deux niveaux : ${deux}. À intégrer dans un algorithme diagnostique validé (D-dimères, angioscanner).`, niveau: t > 6 ? 'critique' : t >= 2 ? 'attention' : 'info' };
      },
      pertinence: (ctx) => (ctx.symptomes.some((s) => ['dl_thoracique', 'dyspnee', 'syncope'].includes(s)) || ctx.has('hemoptysie') || ctx.has('mollet') ? 'Suspicion possible d’embolie pulmonaire.' : null),
      prefill: (ctx) => ({
        fc: ctx.vit.fc === null ? undefined : b(ctx.vit.fc > 100),
        hemopt: ctx.state('hemoptysie') === 'p' ? '1' : ctx.state('hemoptysie') === 'a' ? '0' : undefined,
        cancer: ctx.obs.atcd.medicaux.neoplasie?.s ? b(ctx.atcd('neoplasie')) : undefined,
        tvp: ctx.has('mollet') ? '1' : undefined,
      }),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      SEL('age', 'Âge > 65 ans', [O(0, 'Non', 0), O(1, 'Oui', 1)]),
      C('atcd', 'Antécédent de TVP ou d’EP', 3),
      C('chir', 'Chirurgie ou fracture < 1 mois', 2),
      C('cancer', 'Cancer actif (ou rémission < 1 an)', 2),
      C('douleur', 'Douleur unilatérale d’un membre inférieur', 3),
      C('hemopt', 'Hémoptysie', 2),
      SEL('fc', 'Fréquence cardiaque', [O(0, '< 75 bpm', 0), O(1, '75 à 94 bpm', 3), O(2, '≥ 95 bpm', 5)]),
      C('palp', 'Douleur à la palpation veineuse profonde et œdème unilatéral', 4),
    ];
    return {
      id: 'geneve', nom: 'Score de Genève révisé', categorie: 'Thrombose',
      description: 'Probabilité clinique d’embolie pulmonaire (critères objectifs).',
      items,
      compute: sumCompute(items, [
        { max: 3, txt: 'Probabilité clinique faible (0–3).', niveau: 'info' },
        { max: 10, txt: 'Probabilité clinique intermédiaire (4–10).', niveau: 'attention' },
        { max: 99, txt: 'Probabilité clinique forte (≥ 11).', niveau: 'critique' },
      ], (t) => `${t}/25`),
      pertinence: (ctx) => (ctx.symptomes.some((s) => ['dl_thoracique', 'dyspnee'].includes(s)) || ctx.has('hemoptysie') ? 'Suspicion possible d’embolie pulmonaire.' : null),
      prefill: (ctx) => ({
        age: ctx.age === null ? undefined : ctx.age > 65 ? '1' : '0',
        fc: ctx.vit.fc === null ? undefined : ctx.vit.fc >= 95 ? '2' : ctx.vit.fc >= 75 ? '1' : '0',
        hemopt: ctx.state('hemoptysie') === 'p' ? '1' : ctx.state('hemoptysie') === 'a' ? '0' : undefined,
        cancer: ctx.obs.atcd.medicaux.neoplasie?.s ? b(ctx.atcd('neoplasie')) : undefined,
      }),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('cancer', 'Cancer actif'),
      C('paralysie', 'Paralysie, parésie ou immobilisation plâtrée récente d’un membre inférieur'),
      C('alitement', 'Alitement > 3 jours ou chirurgie majeure < 12 semaines'),
      C('trajet', 'Douleur localisée sur un trajet veineux profond'),
      C('oedeme_total', 'Œdème de tout le membre inférieur'),
      C('mollet', 'Circonférence du mollet > 3 cm par rapport au côté sain'),
      C('godet', 'Œdème prenant le godet (membre symptomatique)'),
      C('collat', 'Veines superficielles collatérales non variqueuses'),
      C('atcd', 'Antécédent de TVP documentée'),
      C('alt', 'Diagnostic alternatif au moins aussi probable', -2),
    ];
    return {
      id: 'wells_tvp', nom: 'Score de Wells (TVP)', categorie: 'Thrombose',
      description: 'Probabilité clinique de thrombose veineuse profonde.',
      items,
      compute: sumCompute(items, [
        { max: 0, txt: 'Probabilité faible (≤ 0) ; en deux niveaux : TVP peu probable (< 2).', niveau: 'info' },
        { max: 1, txt: 'Probabilité intermédiaire (1–2) ; TVP peu probable si < 2.', niveau: 'attention' },
        { max: 2, txt: 'Probabilité intermédiaire (1–2) ; en deux niveaux : TVP probable (≥ 2).', niveau: 'attention' },
        { max: 99, txt: 'Probabilité forte (≥ 3) ; TVP probable.', niveau: 'critique' },
      ], (t) => `${t}`),
      pertinence: (ctx) => (ctx.symptomes.includes('dl_mi') || ctx.symptomes.includes('oedemes') || ctx.has('mollet') || ctx.has('gonflement_mi') ? 'Douleur ou œdème de membre inférieur.' : null),
      prefill: (ctx) => ({ cancer: ctx.obs.atcd.medicaux.neoplasie?.s ? b(ctx.atcd('neoplasie')) : undefined }),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('cancer', 'Cancer actif', 3),
      C('atcd', 'Antécédent de MTEV (hors thrombose superficielle)', 3),
      C('mobilite', 'Mobilité réduite (≥ 3 jours)', 3),
      C('thrombophilie', 'Thrombophilie connue', 3),
      C('trauma', 'Traumatisme ou chirurgie récente (< 1 mois)', 2),
      C('age', 'Âge ≥ 70 ans', 1),
      C('icr', 'Insuffisance cardiaque ou respiratoire', 1),
      C('idm', 'IDM ou AVC ischémique aigu', 1),
      C('infection', 'Infection aiguë et/ou pathologie rhumatologique', 1),
      C('obesite', 'Obésité (IMC ≥ 30 kg/m²)', 1),
      C('hormono', 'Traitement hormonal en cours', 1),
    ];
    return {
      id: 'padua', nom: 'Score de Padua', categorie: 'Thrombose',
      description: 'Risque thrombo-embolique veineux du patient hospitalisé en médecine.',
      items,
      compute: sumCompute(items, [
        { max: 3, txt: 'Risque faible (< 4).', niveau: 'info' },
        { max: 99, txt: 'Risque élevé (≥ 4) : une thromboprophylaxie est à discuter en l’absence de contre-indication (balance bénéfice-risque hémorragique).', niveau: 'attention' },
      ], (t) => `${t}/20`),
      pertinence: (ctx) => (ctx.obs.admission.mode && !/consultation/i.test(ctx.obs.admission.mode) && (ctx.age ?? 0) >= 18 ? 'Patient hospitalisé : évaluation du risque thrombo-embolique.' : null),
      prefill: (ctx) => ({
        age: ctx.age === null ? undefined : b(ctx.age >= 70),
        cancer: ctx.obs.atcd.medicaux.neoplasie?.s ? b(ctx.atcd('neoplasie')) : undefined,
        obesite: ctx.vit.imc === null ? undefined : b(ctx.vit.imc >= 30),
      }),
    } satisfies ScoreDef;
  })(),

  /* -------------------- Infectiologie / gravité -------------------- */
  {
    id: 'news2', nom: 'NEWS2', categorie: 'Gravité',
    description: 'Score d’alerte précoce de dégradation clinique, calculé à partir des constantes.',
    items: [
      { id: 'fr', label: 'Fréquence respiratoire', type: 'number', unit: 'cpm' },
      SEL('echelle', 'Échelle SpO₂', [O(1, 'Échelle 1 (standard)', 0), O(2, 'Échelle 2 (cible 88–92 %, hypercapnie)', 0)]),
      { id: 'spo2', label: 'SpO₂', type: 'number', unit: '%' },
      SEL('o2', 'Oxygène', [O(0, 'Air ambiant', 0), O(1, 'Oxygène', 2)]),
      { id: 'pas', label: 'PA systolique', type: 'number', unit: 'mmHg' },
      { id: 'fc', label: 'Fréquence cardiaque', type: 'number', unit: 'bpm' },
      SEL('conscience', 'Conscience (ACVPU)', [{ v: 'a', label: 'A – Alerte', pts: 0 }, { v: 'cvpu', label: 'C/V/P/U – Confusion nouvelle, réponse à la voix, à la douleur, aucune', pts: 3 }]),
      { id: 't', label: 'Température', type: 'number', unit: '°C' },
    ],
    compute: news2Compute,
    pertinence: (ctx) => (ctx.vit.fc !== null || ctx.vit.fr !== null || ctx.vit.pas !== null ? 'Constantes disponibles : score de surveillance.' : null),
    prefill: (ctx) => {
      const c = ctx.obs.constantes;
      const conscience = ctx.field('conscience');
      return {
        fr: c.fr || undefined, spo2: c.spo2 || undefined, pas: c.pas || undefined, fc: c.fc || undefined, t: c.temperature || undefined,
        o2: c.o2 === 'o2' ? '1' : c.o2 === 'aa' ? '0' : undefined,
        echelle: ctx.atcd('bpco') ? undefined : '1',
        conscience: conscience === '' && ctx.vit.gcs === null ? undefined : conscienceAlteree(ctx) ? 'cvpu' : 'a',
      };
    },
    reference: 'Royal College of Physicians, 2017.',
  },
  (() => {
    const items: ScoreItem[] = [
      C('fr', 'Fréquence respiratoire ≥ 22/min'),
      C('conscience', 'Altération de la conscience (GCS < 15)'),
      C('pas', 'PA systolique ≤ 100 mmHg'),
    ];
    return {
      id: 'qsofa', nom: 'qSOFA', categorie: 'Gravité',
      description: 'Repérage du patient infecté à risque d’évolution défavorable.',
      items,
      compute: sumCompute(items, [
        { max: 1, txt: 'Score < 2 : ne permet pas d’exclure un sepsis ; réévaluer.', niveau: 'info' },
        { max: 3, txt: 'Score ≥ 2 : risque élevé de mauvaise évolution ; rechercher une dysfonction d’organe (SOFA, lactates).', niveau: 'critique' },
      ], (t) => `${t}/3`),
      pertinence: (ctx) => (ctx.has('fievre') || ctx.symptomes.includes('fievre') || (ctx.vit.t !== null && (ctx.vit.t >= 38 || ctx.vit.t < 36)) ? 'Contexte infectieux possible.' : null),
      prefill: (ctx) => ({
        fr: ctx.vit.fr === null ? undefined : b(ctx.vit.fr >= 22),
        pas: ctx.vit.pas === null ? undefined : b(ctx.vit.pas <= 100),
        conscience: ctx.vit.gcs !== null || ctx.field('conscience') ? b(conscienceAlteree(ctx)) : undefined,
      }),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('c', 'Confusion'),
      C('u', 'Urée > 7 mmol/L'),
      C('r', 'Fréquence respiratoire ≥ 30/min'),
      C('b', 'PAS < 90 mmHg ou PAD ≤ 60 mmHg'),
      C('a', 'Âge ≥ 65 ans'),
    ];
    return {
      id: 'curb65', nom: 'CURB-65', categorie: 'Pneumologie',
      description: 'Gravité d’une pneumonie aiguë communautaire.',
      items,
      compute: sumCompute(items, [
        { max: 1, txt: 'Risque faible (0–1) : prise en charge ambulatoire envisageable selon le contexte.', niveau: 'info' },
        { max: 2, txt: 'Risque intermédiaire (2) : hospitalisation à discuter.', niveau: 'attention' },
        { max: 5, txt: 'Pneumonie sévère (3–5) : hospitalisation ; soins intensifs à discuter si 4–5.', niveau: 'critique' },
      ], (t) => `${t}/5`),
      pertinence: (ctx) => ((ctx.symptomes.some((s) => ['toux', 'fievre', 'dyspnee'].includes(s)) && (ctx.has('crepitants') || ctx.has('souffle_tubaire') || ctx.has('expectoration'))) || kw(ctx, 'pneumo') ? 'Suspicion de pneumonie.' : null),
      prefill: (ctx) => {
        const uree = ctx.bio('uree');
        return {
          c: ctx.field('conscience') || ctx.vit.gcs !== null ? b(conscienceAlteree(ctx)) : undefined,
          u: uree === null ? undefined : b(uree > 7),
          r: ctx.vit.fr === null ? undefined : b(ctx.vit.fr >= 30),
          b: ctx.vit.pas === null || ctx.vit.pad === null ? undefined : b(ctx.vit.pas < 90 || ctx.vit.pad <= 60),
          a: ctx.age === null ? undefined : b(ctx.age >= 65),
        };
      },
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('fievre', 'Température > 38 °C'),
      C('toux', 'Absence de toux'),
      C('adp', 'Adénopathies cervicales antérieures sensibles'),
      C('amygdales', 'Atteinte amygdalienne (augmentation de volume ou exsudat)'),
      SEL('age', 'Âge', [O('a', '3 à 14 ans', 1), O('b', '15 à 44 ans', 0), O('c', '≥ 45 ans', -1)]),
    ];
    return {
      id: 'centor', nom: 'Score de Mac Isaac (Centor modifié)', categorie: 'ORL',
      description: 'Probabilité d’angine streptococcique.',
      items,
      compute: sumCompute(items, [
        { max: 1, txt: 'Score < 2 : faible probabilité d’angine streptococcique chez l’adulte.', niveau: 'info' },
        { max: 5, txt: 'Score ≥ 2 : test de diagnostic rapide (TDR) streptococcique recommandé.', niveau: 'attention' },
      ], (t) => `${t}/5`),
      pertinence: (ctx) => (ctx.has('odynophagie') || ['pharynx érythémateux', 'amygdales hypertrophiées', 'exsudat amygdalien'].includes(ctx.field('pharynx')) ? 'Odynophagie / angine.' : null),
      prefill: (ctx) => ({
        fievre: ctx.vit.t === null ? undefined : b(ctx.vit.t > 38),
        toux: ctx.state('toux') === 'p' ? '0' : ctx.state('toux') === 'a' ? '1' : undefined,
        age: ctx.age === null ? undefined : ctx.age < 15 ? 'a' : ctx.age < 45 ? 'b' : 'c',
      }),
    } satisfies ScoreDef;
  })(),

  /* -------------------- Gastro-entérologie -------------------- */
  (() => {
    const items: ScoreItem[] = [
      SEL('bili', 'Bilirubine totale', [O(1, '< 35 µmol/L', 1), O(2, '35 à 50 µmol/L', 2), O(3, '> 50 µmol/L', 3)]),
      SEL('alb', 'Albumine', [O(1, '> 35 g/L', 1), O(2, '28 à 35 g/L', 2), O(3, '< 28 g/L', 3)]),
      SEL('tp', 'TP (ou INR)', [O(1, 'TP > 50 % (INR < 1,7)', 1), O(2, 'TP 40 à 50 % (INR 1,7–2,3)', 2), O(3, 'TP < 40 % (INR > 2,3)', 3)]),
      SEL('ascite', 'Ascite', [O(1, 'Absente', 1), O(2, 'Minime / contrôlée', 2), O(3, 'Modérée à abondante', 3)]),
      SEL('ence', 'Encéphalopathie', [O(1, 'Absente', 1), O(2, 'Grade I–II', 2), O(3, 'Grade III–IV', 3)]),
    ];
    return {
      id: 'child_pugh', nom: 'Score de Child-Pugh', categorie: 'Hépatologie',
      description: 'Sévérité de la cirrhose (5 à 15).',
      items,
      compute: (inp) => {
        const r = sumCompute(items, [
          { max: 6, txt: 'Classe A (5–6) : cirrhose compensée.', niveau: 'info' },
          { max: 9, txt: 'Classe B (7–9) : atteinte fonctionnelle significative.', niveau: 'attention' },
          { max: 15, txt: 'Classe C (10–15) : cirrhose décompensée.', niveau: 'critique' },
        ], (t) => `${t}/15`)(inp);
        if (r.complet && r.total !== null) r.valeur = `${r.total}/15 (classe ${r.total <= 6 ? 'A' : r.total <= 9 ? 'B' : 'C'})`;
        return r;
      },
      pertinence: (ctx) => (ctx.atcd('hepatique') || kw(ctx, 'cirrhose') ? 'Hépatopathie chronique.' : ctx.has('ascite') ? 'Ascite.' : null),
      prefill: (ctx) => {
        const bili = ctx.bio('bilit');
        const alb = ctx.bio('albumine');
        const tp = ctx.bio('tp');
        const asc = ctx.state('ascite');
        return {
          bili: bili === null ? undefined : bili < 35 ? '1' : bili <= 50 ? '2' : '3',
          alb: alb === null ? undefined : alb > 35 ? '1' : alb >= 28 ? '2' : '3',
          tp: tp === null ? undefined : tp > 50 ? '1' : tp >= 40 ? '2' : '3',
          ascite: asc === 'a' ? '1' : undefined,
        };
      },
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      SEL('uree', 'Urée sanguine (mmol/L)', [O(0, '< 6,5', 0), O(1, '6,5 à 7,9', 2), O(2, '8 à 9,9', 3), O(3, '10 à 25', 4), O(4, '> 25', 6)]),
      SEL('hb', 'Hémoglobine (g/dL)', [O(0, 'H ≥ 13 / F ≥ 12', 0), O(1, 'H 12 à 12,9', 1), O(2, 'F 10 à 11,9', 1), O(3, 'H 10 à 11,9', 3), O(4, '< 10', 6)]),
      SEL('pas', 'PA systolique (mmHg)', [O(0, '≥ 110', 0), O(1, '100 à 109', 1), O(2, '90 à 99', 2), O(3, '< 90', 3)]),
      C('fc', 'FC ≥ 100 bpm'),
      C('melena', 'Méléna'),
      C('syncope', 'Syncope', 2),
      C('hepato', 'Hépatopathie', 2),
      C('ic', 'Insuffisance cardiaque', 2),
    ];
    return {
      id: 'blatchford', nom: 'Score de Glasgow-Blatchford', categorie: 'Gastro-entérologie',
      description: 'Risque de nécessité d’intervention au cours d’une hémorragie digestive haute.',
      items,
      compute: sumCompute(items, [
        { max: 1, txt: 'Score 0–1 : très faible risque ; prise en charge ambulatoire envisageable selon le contexte.', niveau: 'info' },
        { max: 7, txt: 'Risque intermédiaire : hospitalisation et endoscopie.', niveau: 'attention' },
        { max: 23, txt: 'Risque élevé : intervention (transfusion, endoscopie hémostatique) probable.', niveau: 'critique' },
      ], (t) => `${t}/23`),
      pertinence: (ctx) => (ctx.symptomes.includes('hemorragie_dig') || ctx.has('hematemese') || ctx.has('melena') ? 'Hémorragie digestive.' : null),
      prefill: (ctx) => {
        const u = ctx.bio('uree');
        const hb = ctx.bio('hb');
        const p = ctx.vit.pas;
        let hbV: string | undefined;
        if (hb !== null && ctx.sexe) {
          if (hb < 10) hbV = '4';
          else if (ctx.sexe === 'M') hbV = hb >= 13 ? '0' : hb >= 12 ? '1' : '3';
          else hbV = hb >= 12 ? '0' : '2';
        }
        return {
          uree: u === null ? undefined : u < 6.5 ? '0' : u < 8 ? '1' : u < 10 ? '2' : u <= 25 ? '3' : '4',
          hb: hbV,
          pas: p === null ? undefined : p >= 110 ? '0' : p >= 100 ? '1' : p >= 90 ? '2' : '3',
          fc: ctx.vit.fc === null ? undefined : b(ctx.vit.fc >= 100),
          melena: ctx.state('melena') === 'p' ? '1' : ctx.state('melena') === 'a' ? '0' : undefined,
          syncope: ctx.state('syncope') === 'p' ? '1' : ctx.state('syncope') === 'a' ? '0' : undefined,
          hepato: ctx.obs.atcd.medicaux.hepatique?.s ? b(ctx.atcd('hepatique')) : undefined,
        };
      },
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('migration', 'Migration de la douleur vers la fosse iliaque droite'),
      C('anorexie', 'Anorexie'),
      C('nv', 'Nausées ou vomissements'),
      C('defense', 'Sensibilité / défense de la fosse iliaque droite', 2),
      C('rebond', 'Douleur à la décompression'),
      C('temp', 'Température ≥ 37,3 °C'),
      C('gb', 'Leucocytose > 10 G/L', 2),
      C('pnn', 'Polynucléose neutrophile > 75 %'),
    ];
    return {
      id: 'alvarado', nom: 'Score d’Alvarado', categorie: 'Gastro-entérologie',
      description: 'Probabilité d’appendicite aiguë.',
      items,
      compute: sumCompute(items, [
        { max: 4, txt: 'Appendicite peu probable (1–4).', niveau: 'info' },
        { max: 6, txt: 'Appendicite possible (5–6) : imagerie à discuter.', niveau: 'attention' },
        { max: 8, txt: 'Appendicite probable (7–8).', niveau: 'critique' },
        { max: 10, txt: 'Appendicite très probable (9–10).', niveau: 'critique' },
      ], (t) => `${t}/10`),
      pertinence: (ctx) => {
        const s = ctx.obs.hdm.symptomes.find((x) => x.type === 'dl_abdominale');
        if (!s) return null;
        const siege = ([] as string[]).concat(s.a.siege ?? []).join(' ');
        return /fosse iliaque droite|péri-ombilicale|diffuse/.test(siege) || !siege ? 'Douleur abdominale (fosse iliaque droite).' : null;
      },
      prefill: (ctx) => ({
        anorexie: ctx.state('anorexie') === 'p' ? '1' : ctx.state('anorexie') === 'a' ? '0' : undefined,
        nv: ctx.has('nausees') || ctx.has('vomissements') ? '1' : ctx.abs('nausees') && ctx.abs('vomissements') ? '0' : undefined,
        rebond: ctx.state('blumberg') === 'p' ? '1' : ctx.state('blumberg') === 'a' ? '0' : undefined,
        temp: ctx.vit.t === null ? undefined : b(ctx.vit.t >= 37.3),
        gb: ctx.bio('gb') === null ? undefined : b((ctx.bio('gb') ?? 0) > 10),
      }),
    } satisfies ScoreDef;
  })(),

  /* -------------------- Pneumologie / fonctionnel -------------------- */
  classif('mmrc', 'Échelle de dyspnée mMRC', 'Pneumologie', 'Retentissement de la dyspnée dans la vie quotidienne.', [
    { v: '0', label: '0 – Efforts soutenus uniquement', txt: 'Dyspnée pour des efforts soutenus uniquement.', niveau: 'info' },
    { v: '1', label: '1 – Marche rapide ou pente légère', txt: 'Dyspnée lors de la marche rapide ou en pente légère.', niveau: 'info' },
    { v: '2', label: '2 – Marche plus lente que les sujets du même âge', txt: 'Marche plus lentement que les sujets du même âge ou doit s’arrêter en marchant à son pas sur terrain plat.', niveau: 'attention' },
    { v: '3', label: '3 – Arrêt après 100 m', txt: 'Doit s’arrêter pour respirer après 100 mètres ou quelques minutes sur terrain plat.', niveau: 'attention' },
    { v: '4', label: '4 – Dyspnée à l’habillage', txt: 'Trop essoufflé pour quitter la maison ou dyspnée à l’habillage.', niveau: 'critique' },
  ], (ctx) => (ctx.has('dyspnee') || ctx.symptomes.includes('dyspnee') || ctx.atcd('bpco') ? 'Dyspnée ou pathologie respiratoire chronique.' : null), (ctx) => {
    const v = (ctx.obs.hdm.symptomes.find((s) => s.type === 'dyspnee')?.a.mmrc as string) || ctx.obs.findings.dyspnee?.x?.mmrc;
    return v ? { classe: v } : {};
  }),
  classif('ecog', 'Indice de performance OMS / ECOG', 'Oncologie / gériatrie', 'État général et autonomie (0 à 4).', [
    { v: '0', label: '0 – Activité normale', txt: 'Capable d’une activité identique à celle précédant la maladie, sans restriction.', niveau: 'info' },
    { v: '1', label: '1 – Restreint pour les efforts intenses', txt: 'Activité physique diminuée mais ambulatoire et capable de mener un travail léger.', niveau: 'info' },
    { v: '2', label: '2 – Ambulatoire, incapable de travailler', txt: 'Ambulatoire et capable de prendre soin de soi, incapable de travailler ; alité moins de 50 % du temps.', niveau: 'attention' },
    { v: '3', label: '3 – Alité > 50 % du temps', txt: 'Capable seulement de quelques soins personnels ; alité ou au fauteuil plus de 50 % du temps.', niveau: 'attention' },
    { v: '4', label: '4 – Grabataire', txt: 'Incapable de prendre soin de soi ; alité ou au fauteuil en permanence.', niveau: 'critique' },
  ], (ctx) => (ctx.atcd('neoplasie') ? 'Néoplasie.' : ctx.symptomes.includes('aeg') ? 'Altération de l’état général.' : null)),
  classif('deshydratation', 'Classification de la déshydratation', 'Métabolisme', 'Type et sévérité de la déshydratation (sévérité estimée par la perte de poids si le poids antérieur est connu).', [
    { v: 'ec_legere', label: 'Extracellulaire – légère (< 5 % du poids)', txt: 'Déshydratation extracellulaire légère.', niveau: 'info' },
    { v: 'ec_moderee', label: 'Extracellulaire – modérée (5–10 %)', txt: 'Déshydratation extracellulaire modérée : surveiller hémodynamique et diurèse.', niveau: 'attention' },
    { v: 'ec_severe', label: 'Extracellulaire – sévère (> 10 % ou signes de choc)', txt: 'Déshydratation extracellulaire sévère : risque de choc hypovolémique.', niveau: 'critique' },
    { v: 'ic', label: 'Intracellulaire', txt: 'Déshydratation intracellulaire (soif, sécheresse des muqueuses, troubles neurologiques ; hypernatrémie attendue).', niveau: 'attention' },
    { v: 'globale', label: 'Globale', txt: 'Déshydratation globale (extra- et intracellulaire).', niveau: 'attention' },
  ], (ctx) => (ctx.has('pli_cutane') || ctx.has('secheresse_muqueuses') || ctx.symptomes.some((s) => ['vomissements', 'diarrhee'].includes(s)) ? 'Pertes digestives ou signes de déshydratation.' : null)),
  classif('oedeme', 'Stades des œdèmes (godet)', 'Cardiologie', 'Profondeur et persistance du godet.', [
    { v: '1', label: 'Stade 1 – 2 mm, disparition immédiate', txt: 'Œdème minime (godet 2 mm, disparition immédiate).', niveau: 'info' },
    { v: '2', label: 'Stade 2 – 4 mm, disparition en 10–15 s', txt: 'Œdème modéré (godet 4 mm).', niveau: 'info' },
    { v: '3', label: 'Stade 3 – 6 mm, persistance > 1 min', txt: 'Œdème important (godet 6 mm).', niveau: 'attention' },
    { v: '4', label: 'Stade 4 – 8 mm, persistance 2–5 min', txt: 'Œdème très important (godet 8 mm).', niveau: 'attention' },
  ], (ctx) => (ctx.has('omi') || ctx.symptomes.includes('oedemes') ? 'Œdèmes.' : null)),
  {
    id: 'eva_classe', nom: 'Classification de l’intensité douloureuse', categorie: 'Douleur',
    description: 'Intensité de la douleur selon l’EVA / EN (0 à 10).',
    items: [{ id: 'eva', label: 'EVA / EN', type: 'number', unit: '/10' }],
    compute: (inp) => {
      const v = inp.eva === undefined || inp.eva === '' ? null : Number(inp.eva);
      if (v === null || Number.isNaN(v)) return { total: null, valeur: '', interpretation: '', niveau: 'info', complet: false, manquants: ['EVA'] };
      const txt = v === 0 ? 'Absence de douleur.' : v <= 3 ? 'Douleur légère (1–3).' : v <= 6 ? 'Douleur modérée (4–6).' : 'Douleur intense (7–10).';
      return { total: v, valeur: `${v}/10`, interpretation: txt, niveau: v >= 7 ? 'attention' : 'info', complet: true, manquants: [] };
    },
    pertinence: (ctx) => (anyPain(ctx) || ctx.vit.eva !== null ? 'Douleur.' : null),
    prefill: (ctx) => {
      const pain = ctx.obs.hdm.symptomes.find((s) => SYMPTOMES_DOULEUR.has(s.type) && s.a.intensite);
      return { eva: ctx.obs.constantes.eva || (pain?.a.intensite as string) || undefined };
    },
  },
  (() => {
    const items: ScoreItem[] = [
      C('brulure', 'Brûlure'),
      C('froid', 'Sensation de froid douloureux'),
      C('decharges', 'Décharges électriques'),
      C('fourmillements', 'Fourmillements'),
      C('picotements', 'Picotements'),
      C('engourdissement', 'Engourdissement'),
      C('demangeaisons', 'Démangeaisons'),
      C('hypo_tact', 'Hypoesthésie au tact (examen)'),
      C('hypo_piqure', 'Hypoesthésie à la piqûre (examen)'),
      C('frottement', 'Douleur provoquée ou augmentée par le frottement (examen)'),
    ];
    return {
      id: 'dn4', nom: 'Questionnaire DN4', categorie: 'Douleur',
      description: 'Dépistage d’une composante neuropathique de la douleur.',
      items,
      compute: sumCompute(items, [
        { max: 3, txt: 'Score < 4 : composante neuropathique peu probable.', niveau: 'info' },
        { max: 10, txt: 'Score ≥ 4 : douleur neuropathique probable.', niveau: 'attention' },
      ], (t) => `${t}/10`),
      pertinence: (ctx) => (ctx.symptomes.some((s) => ['dl_autre', 'dl_lombaire', 'dl_mi'].includes(s)) || ctx.has('troubles_sensitifs') ? 'Douleur pouvant comporter une composante neuropathique.' : null),
    } satisfies ScoreDef;
  })(),
  {
    id: 'imc', nom: 'Classification de l’IMC (OMS)', categorie: 'Nutrition',
    description: 'Indice de masse corporelle calculé à partir du poids et de la taille.',
    items: [{ id: 'poids', label: 'Poids', type: 'number', unit: 'kg' }, { id: 'taille', label: 'Taille', type: 'number', unit: 'cm' }],
    compute: (inp) => {
      const p = Number(String(inp.poids ?? '').replace(',', '.'));
      const t = Number(String(inp.taille ?? '').replace(',', '.'));
      if (!p || !t) return { total: null, valeur: '', interpretation: '', niveau: 'info', complet: false, manquants: ['Poids', 'Taille'].filter((_, i) => (i === 0 ? !p : !t)) };
      const v = p / (t / 100) ** 2;
      return { total: v, valeur: `${fmtNum(v)} kg/m²`, interpretation: `${classeIMC(v)[0].toUpperCase()}${classeIMC(v).slice(1)}.`, niveau: v < 18.5 || v >= 35 ? 'attention' : 'info', complet: true, manquants: [] };
    },
    pertinence: (ctx) => (ctx.vit.imc !== null ? 'Poids et taille renseignés.' : null),
    prefill: (ctx) => ({ poids: ctx.obs.constantes.poids || undefined, taille: ctx.obs.constantes.taille || undefined }),
  },
  (() => {
    const items: ScoreItem[] = [
      SEL('perception', 'Perception sensorielle', [O(1, '1 – Complètement limitée'), O(2, '2 – Très limitée'), O(3, '3 – Légèrement limitée'), O(4, '4 – Aucune atteinte')]),
      SEL('humidite', 'Humidité', [O(1, '1 – Constamment humide'), O(2, '2 – Très humide'), O(3, '3 – Parfois humide'), O(4, '4 – Rarement humide')]),
      SEL('activite', 'Activité', [O(1, '1 – Alité'), O(2, '2 – Au fauteuil'), O(3, '3 – Marche parfois'), O(4, '4 – Marche fréquemment')]),
      SEL('mobilite', 'Mobilité', [O(1, '1 – Complètement immobile'), O(2, '2 – Très limitée'), O(3, '3 – Légèrement limitée'), O(4, '4 – Aucune limitation')]),
      SEL('nutrition', 'Nutrition', [O(1, '1 – Très pauvre'), O(2, '2 – Probablement inadéquate'), O(3, '3 – Adéquate'), O(4, '4 – Excellente')]),
      SEL('friction', 'Friction et cisaillement', [O(1, '1 – Problème'), O(2, '2 – Problème potentiel'), O(3, '3 – Pas de problème apparent')]),
    ];
    return {
      id: 'braden', nom: 'Échelle de Braden', categorie: 'Soins',
      description: 'Risque d’escarre (6 à 23 ; plus le score est bas, plus le risque est élevé).',
      items,
      compute: sumCompute(items, [
        { max: 9, txt: 'Risque très élevé (≤ 9).', niveau: 'critique' },
        { max: 12, txt: 'Risque élevé (10–12).', niveau: 'critique' },
        { max: 14, txt: 'Risque modéré (13–14).', niveau: 'attention' },
        { max: 18, txt: 'Risque faible (15–18).', niveau: 'attention' },
        { max: 23, txt: 'Pas de risque significatif (19–23).', niveau: 'info' },
      ], (t) => `${t}/23`),
      pertinence: (ctx) => ((ctx.age ?? 0) >= 75 || ['dépendant pour les actes de la vie quotidienne', 'grabataire'].includes(ctx.field('autonomie')) || ctx.has('escarres') ? 'Sujet âgé, dépendant ou escarre.' : null),
    } satisfies ScoreDef;
  })(),
  (() => {
    const items: ScoreItem[] = [
      C('d', 'Avez-vous déjà ressenti le besoin de Diminuer votre consommation ?'),
      C('e', 'Votre Entourage vous a-t-il fait des remarques ?'),
      C('t', 'Avez-vous l’impression de boire Trop ?'),
      C('a', 'Avez-vous eu besoin d’Alcool le matin pour vous sentir en forme ?'),
    ];
    return {
      id: 'deta', nom: 'Questionnaire DETA (CAGE)', categorie: 'Addictologie',
      description: 'Repérage d’un mésusage d’alcool.',
      items,
      compute: sumCompute(items, [
        { max: 1, txt: 'Score < 2 : pas d’argument pour un mésusage.', niveau: 'info' },
        { max: 4, txt: 'Score ≥ 2 : mésusage d’alcool probable ; évaluation addictologique à proposer.', niveau: 'attention' },
      ], (t) => `${t}/4`),
      pertinence: (ctx) => (['occasionnel', 'regulier'].includes(ctx.obs.atcd.toxiques.alcool) ? 'Consommation d’alcool déclarée.' : null),
      prefill: (ctx) => {
        const d = ctx.obs.atcd.toxiques.deta;
        const m = (v: string | undefined) => (v === 'oui' ? '1' : v === 'non' ? '0' : undefined);
        return { d: m(d.d), e: m(d.e), t: m(d.t), a: m(d.a) };
      },
    } satisfies ScoreDef;
  })(),
];

const SYMPTOMES_DOULEUR = new Set(['dl_thoracique', 'dl_abdominale', 'cephalee', 'dl_lombaire', 'dl_articulaire', 'dl_mi', 'dl_autre']);

export const SCORE_BY_ID: Record<string, ScoreDef> = Object.fromEntries(SCORES.map((s) => [s.id, s]));
export const CATEGORIES_SCORES = [...new Set(SCORES.map((s) => s.categorie))];

/** Fusionne les valeurs saisies avec les valeurs pré-remplies (les saisies priment). */
export function effectiveInputs(def: ScoreDef, saisies: Inputs, ctx: Ctx): { inputs: Inputs; preremplis: Set<string> } {
  const pre = def.prefill ? def.prefill(ctx) : {};
  const inputs: Inputs = {};
  const preremplis = new Set<string>();
  for (const it of def.items) {
    const s = saisies[it.id];
    if (s !== undefined && s !== '') inputs[it.id] = s;
    else if (pre[it.id] !== undefined && pre[it.id] !== '') {
      inputs[it.id] = pre[it.id];
      preremplis.add(it.id);
    }
  }
  return { inputs, preremplis };
}

/** Scores pertinents pour la situation, avec la raison */
export function scoresPertinents(ctx: Ctx): { def: ScoreDef; raison: string }[] {
  const out: { def: ScoreDef; raison: string }[] = [];
  const parSymptome = new Set(ctx.symptomDefs.flatMap((s) => s.scores));
  for (const def of SCORES) {
    const r = def.pertinence(ctx);
    if (r) out.push({ def, raison: r });
    else if (parSymptome.has(def.id)) out.push({ def, raison: 'Proposé pour le symptôme analysé.' });
  }
  return out;
}
