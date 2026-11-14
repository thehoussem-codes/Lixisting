/**
 * Contrôle de complétude, détection des incohérences et rappels contextuels.
 * Classe chaque élément manquant en : indispensable / recommandé / non pertinent dans ce contexte.
 */
import type { Observation } from '../../shared/types.ts';
import { APPAREILS, APPAREIL_BY_ID } from '../knowledge/appareils.ts';
import { ATCD_MEDICAUX } from '../knowledge/antecedents.ts';
import { alertesConstantes, erreursSaisie, type AlerteConstante } from '../knowledge/constantes.ts';
import { CLASSES_ALLERGIE, EXAMENS_INJECTES_MOTS, PRODUITS_CONTRASTE_MOTS } from '../knowledge/medicaments.ts';
import { FIELDS, FINDINGS } from '../knowledge/registry.ts';
import { SYMPTOME_BY_ID } from '../knowledge/symptomes.ts';
import { ageAt, num, parseDate } from './calc.ts';
import { buildContext, estDocumente, libelle, type Ctx } from './context.ts';
import { analyserAppareil } from './examen.ts';
import { SYMPTOME_SIGNE } from './hdm.ts';

export type Niveau = 'indispensable' | 'recommande' | 'non_pertinent';

export type ModuleId =
  | 'identite' | 'motif' | 'antecedents' | 'hdm' | 'examen' | 'scores' | 'examens' | 'synthese' | 'discussion' | 'cat' | 'redaction';

export interface Verif {
  id: string;
  module: ModuleId;
  /** Ancre facultative (appareil) */
  cible?: string;
  libelle: string;
  niveau: Niveau;
  ok: boolean;
  detail?: string;
}

export interface Incoherence {
  id: string;
  module: ModuleId;
  message: string;
  gravite: 'attention' | 'critique';
}

export interface Rappel {
  symptome: string;
  titre: string;
  items: { id?: string; texte: string; fait: boolean | null }[];
  drapeaux: string[];
  aNePasManquer: string[];
}

export interface Bilan {
  verifs: Verif[];
  incoherences: Incoherence[];
  alertes: AlerteConstante[];
  rappels: Rappel[];
  progression: Record<ModuleId, number>;
  global: number;
  manquantsIndispensables: number;
}

const filled = (s: string | undefined | null) => !!s && s.trim() !== '';

export function bilan(obs: Observation): Bilan {
  const ctx = buildContext(obs);
  const verifs: Verif[] = [];
  const add = (module: ModuleId, id: string, lib: string, niveau: Niveau, ok: boolean, detail?: string, cible?: string) =>
    verifs.push({ id, module, libelle: lib, niveau, ok, detail, cible });

  /* ---------------- Identité ---------------- */
  const id = obs.identite;
  const ad = obs.admission;
  add('identite', 'nom', 'Nom et prénom', 'indispensable', filled(id.nom) && filled(id.prenom));
  add('identite', 'naissance', 'Date de naissance', 'indispensable', filled(id.dateNaissance));
  add('identite', 'sexe', 'Sexe', 'indispensable', !!id.sexe);
  add('identite', 'admission', 'Date et heure d’admission', 'indispensable', filled(ad.date));
  add('identite', 'service', 'Service d’hospitalisation', 'recommande', filled(ad.service));
  add('identite', 'medecin', 'Médecin responsable', 'recommande', filled(ad.medecin));
  add('identite', 'mode', 'Mode d’admission', 'recommande', filled(ad.mode));
  add('identite', 'informateur', 'Qualité de l’informateur', 'recommande', ad.informateurs.length > 0);
  add('identite', 'fiabilite', 'Fiabilité des informations', 'recommande', filled(ad.fiabilite));
  add('identite', 'contact', 'Adresse ou téléphone', 'recommande', filled(id.adresse) || filled(id.telephone));
  add('identite', 'prevenir', 'Personne à prévenir', /consultation/i.test(ad.mode) ? 'non_pertinent' : 'recommande', filled(id.personnePrevenir.nom));
  add('identite', 'profession', 'Profession', 'recommande', filled(id.profession));

  /* ---------------- Motif ---------------- */
  add('motif', 'principal', 'Motif principal d’hospitalisation', 'indispensable', filled(obs.motif.principal) || filled(obs.motif.formulation));
  add('motif', 'debut', 'Date de début des symptômes', 'recommande', filled(obs.motif.dateDebut) || obs.hdm.symptomes.some((s) => filled(s.a.debut_date as string)));
  add('motif', 'caractere', 'Caractère urgent ou programmé', 'recommande', !!obs.motif.caractere);

  /* ---------------- Antécédents ---------------- */
  const a = obs.atcd;
  const medRens = a.medicauxAucun || Object.values(a.medicaux).some((c) => c.s);
  add('antecedents', 'medicaux', 'Antécédents médicaux', 'indispensable', medRens, medRens ? undefined : 'Cocher « aucun antécédent » ou renseigner les pathologies (présent / absent / non recherché).');
  const catsNonRens = ATCD_MEDICAUX.filter((c) => !a.medicaux[c.id]?.s).map((c) => c.label);
  if (medRens && !a.medicauxAucun && catsNonRens.length) {
    const essentielles = ['Hypertension artérielle', 'Diabète', 'Cardiopathies'];
    const manq = catsNonRens.filter((c) => essentielles.includes(c));
    add('antecedents', 'medicaux_essentiels', 'HTA, diabète et cardiopathies explicitement renseignés', 'recommande', manq.length === 0, manq.length ? `Non renseignés : ${manq.join(', ')}` : undefined);
  }
  add('antecedents', 'chirurgicaux', 'Antécédents chirurgicaux', 'recommande', !!a.chirurgicaux.s || a.chirurgicaux.entries.length > 0);
  add('antecedents', 'familiaux', 'Antécédents familiaux', 'recommande', !!a.familiaux.s || a.familiaux.entries.length > 0 || Object.values(a.familiaux.cats).some(Boolean));
  add('antecedents', 'tabac', 'Statut tabagique', ctx.symptomes.some((s) => ['dl_thoracique', 'dyspnee', 'toux'].includes(s)) ? 'indispensable' : 'recommande', !!a.toxiques.tabac);
  add('antecedents', 'alcool', 'Consommation d’alcool', 'recommande', !!a.toxiques.alcool);
  add('antecedents', 'allergies', 'Allergies vérifiées', 'indispensable', a.allergies.statut === 'aucune' || a.allergies.entries.some((e) => filled(e.agent)), a.allergies.statut === 'non_verifiees' ? 'Allergies déclarées « non vérifiées ».' : undefined);
  add('antecedents', 'traitements', 'Traitement habituel vérifié', 'indispensable', a.traitements.statut === 'aucun' || a.traitements.entries.some((m) => filled(m.nom)), a.traitements.statut === 'non_verifies' ? 'Traitement déclaré « non vérifié ».' : undefined);
  if (a.traitements.entries.some((m) => filled(m.nom))) {
    const incomplets = a.traitements.entries.filter((m) => filled(m.nom) && (!filled(m.dosage) || !filled(m.posologie) && !filled(m.frequence)));
    add('antecedents', 'traitements_detail', 'Dosage et posologie de chaque traitement', 'recommande', incomplets.length === 0, incomplets.length ? `Incomplet : ${incomplets.map((m) => m.nom).join(', ')}` : undefined);
  }
  if (ctx.sexe === 'F') {
    add('antecedents', 'grossesse', 'Statut de grossesse / date des dernières règles', ctx.femmeAgeProcreer ? 'indispensable' : 'non_pertinent', !!a.gyneco.grossesse || filled(a.gyneco.ddr) || a.gyneco.menopause === 'oui');
    add('antecedents', 'gp', 'Gestité et parité', ctx.femmeAgeProcreer ? 'recommande' : 'non_pertinent', filled(a.gyneco.gestite) || filled(a.gyneco.parite));
  }

  /* ---------------- Histoire de la maladie ---------------- */
  const syms = obs.hdm.symptomes;
  add('hdm', 'symptome', 'Au moins un symptôme analysé', 'indispensable', syms.length > 0);
  for (const s of syms) {
    const def = SYMPTOME_BY_ID[s.type];
    if (!def) continue;
    const nom = def.id === 'autre' ? s.libelle || 'Symptôme' : def.label;
    for (const q of def.questions.filter((x) => x.essentiel)) {
      const v = s.a[q.id];
      const autre = s.a[`${q.id}__autre`];
      const ok = (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '') || (typeof autre === 'string' && autre.trim() !== '');
      const niveau: Niveau = s.principal && (q.id === 'debut_date' || (def.douleur && ['siege', 'type', 'intensite'].includes(q.id))) ? 'indispensable' : 'recommande';
      add('hdm', `${s.uid}_${q.id}`, `${nom} : ${q.label.replace(/^\d+\.\s*/, '')}`, niveau, ok, def.douleur && !ok && niveau === 'indispensable' ? 'Douleur non caractérisée.' : undefined);
    }
    const assoc = def.associes.filter((f) => FINDINGS[f] && f !== SYMPTOME_SIGNE[s.type] && (!FINDINGS[f].sex || !ctx.sexe || FINDINGS[f].sex === ctx.sexe));
    const doc = assoc.filter((f) => obs.findings[f]?.s);
    add('hdm', `${s.uid}_assoc`, `${nom} : signes associés recherchés`, 'recommande', assoc.length === 0 || doc.length / assoc.length >= 0.6, `${doc.length}/${assoc.length} renseignés`);
  }
  add('hdm', 'ttt_avant', 'Traitements reçus avant l’admission', 'recommande', !!obs.hdm.traitementsAvant.s || obs.hdm.traitementsAvant.entries.length > 0);

  /* ---------------- Examen clinique ---------------- */
  const c = obs.constantes;
  const pain = ctx.symptomDefs.some((s) => s.douleur);
  const neuro = ctx.symptomes.some((s) => ['confusion', 'convulsions', 'deficit_neuro', 'syncope', 'cephalee'].includes(s)) || (filled(obs.fields.conscience) && obs.fields.conscience !== 'conscient');
  add('examen', 'temp', 'Température', 'indispensable', filled(c.temperature), undefined, 'constantes');
  add('examen', 'pa', 'Pression artérielle', 'indispensable', filled(c.pas) && filled(c.pad), undefined, 'constantes');
  add('examen', 'fc', 'Fréquence cardiaque', 'indispensable', filled(c.fc), undefined, 'constantes');
  add('examen', 'fr', 'Fréquence respiratoire', 'indispensable', filled(c.fr), undefined, 'constantes');
  add('examen', 'spo2', 'Saturation en oxygène', 'indispensable', filled(c.spo2), undefined, 'constantes');
  add('examen', 'spo2_o2', 'SpO₂ : air ambiant ou oxygène précisé', 'recommande', !filled(c.spo2) || !!c.o2, undefined, 'constantes');
  add('examen', 'glycemie', 'Glycémie capillaire', ctx.atcd('diabete') || neuro ? 'indispensable' : 'recommande', filled(c.glycemie), undefined, 'constantes');
  add('examen', 'poids', 'Poids', 'recommande', filled(c.poids), undefined, 'constantes');
  add('examen', 'taille', 'Taille', 'recommande', filled(c.taille), undefined, 'constantes');
  add('examen', 'eva', 'Évaluation de la douleur (EVA)', pain ? 'indispensable' : 'recommande', filled(c.eva), undefined, 'constantes');
  add('examen', 'glasgow', 'Score de Glasgow', neuro ? 'indispensable' : 'recommande', filled(c.glasgow), undefined, 'constantes');
  add('examen', 'conscience', 'État de conscience', 'indispensable', filled(obs.fields.conscience), undefined, 'eg');
  add('examen', 'etat_general', 'État général', 'recommande', filled(obs.fields.etat_general), undefined, 'eg');

  for (const app of APPAREILS) {
    const st = obs.appareils[app.id]?.statut ?? '';
    const prioritaire = ctx.appareilsPrioritaires.has(app.id);
    let niveau: Niveau = prioritaire ? 'indispensable' : app.defaut === 'indispensable' ? 'indispensable' : app.defaut === 'recommande' ? 'recommande' : 'non_pertinent';
    if (st === 'na') niveau = 'non_pertinent';
    const an = analyserAppareil(obs, app, new Set(), true);
    const ok = an.aDuContenu || st === 'na';
    add('examen', `app_${app.id}`, `${app.title}${st === 'nr' ? ' (déclaré non examiné)' : ''}`, niveau, ok && st !== 'nr', ok ? `${an.renseignes}/${an.total} éléments renseignés` : 'Appareil non examiné', app.id);
  }
  // Éléments d'examen recommandés par le contexte clinique
  const focusManquants = [...ctx.focus].filter((f) => (FINDINGS[f] || FIELDS[f]) && !estDocumente(obs, f) && (!FINDINGS[f]?.sex || !ctx.sexe || FINDINGS[f].sex === ctx.sexe));
  if (ctx.focus.size) {
    add('examen', 'focus', 'Signes d’examen orientés par la symptomatologie', 'recommande', focusManquants.length === 0, focusManquants.length ? `À rechercher : ${focusManquants.slice(0, 12).map(libelle).join(', ')}${focusManquants.length > 12 ? '…' : ''}` : undefined);
  }

  /* ---------------- Examens complémentaires ---------------- */
  const nbExamens = obs.examens.bio.length + obs.examens.autres.length + (obs.examens.ecg.realise === 'oui' ? 1 : 0);
  add('examens', 'examens', 'Examens complémentaires renseignés', 'recommande', nbExamens > 0);
  const sansInterp = obs.examens.autres.filter((x) => (filled(x.resultat) || filled(x.conclusion)) && !filled(x.interpretation) && !filled(x.conclusion));
  if (obs.examens.autres.length) add('examens', 'interp', 'Interprétation des examens par le médecin', 'recommande', sansInterp.length === 0);
  if (ctx.symptomes.some((s) => ['dl_thoracique', 'syncope', 'palpitations', 'dyspnee'].includes(s))) {
    add('examens', 'ecg', 'ECG (symptomatologie cardio-respiratoire)', 'indispensable', obs.examens.ecg.realise !== '', obs.examens.ecg.realise === '' ? 'Préciser si l’ECG a été réalisé.' : undefined);
  }

  /* ---------------- Synthèse, discussion, CAT ---------------- */
  const examFait = APPAREILS.some((app) => analyserAppareil(obs, app, new Set(), true).aDuContenu);
  add('synthese', 'synthese_donnees', 'Données suffisantes pour la synthèse (HDM et examen)', 'indispensable', syms.length > 0 && examFait);
  add('synthese', 'synthese_relue', 'Synthèse relue par le médecin', 'recommande', !!obs.redaction.verifies.synthese || !!obs.redaction.verifies.court_synthese);
  const d = obs.discussion;
  add('discussion', 'diag', 'Diagnostic principal ou hypothèses diagnostiques', 'indispensable', filled(d.diagnosticPrincipal) || filled(d.diagnosticRetenu) || d.hypotheses.some(filled));
  add('discussion', 'arguments', 'Arguments en faveur du diagnostic', 'recommande', filled(d.argumentsPour) || !filled(d.diagnosticPrincipal));
  add('discussion', 'differentiels', 'Diagnostics différentiels', 'recommande', d.differentiels.some((x) => filled(x.diagnostic)) || d.hypotheses.filter(filled).length > 1);
  const urg = ctx.symptomDefs.some((s) => s.aNePasManquer.length);
  add('discussion', 'urgences', 'Diagnostics graves à éliminer en urgence', urg ? 'recommande' : 'non_pertinent', filled(d.urgences));
  const ct = obs.cat;
  const catRens = ct.mesures.length + ct.traitements.length + ct.examensDemandes.length + ct.surveillance.length + ct.avis.length > 0 || filled(ct.orientation) || filled(ct.mesuresDetail);
  add('cat', 'cat', 'Conduite à tenir', 'indispensable', catRens);
  add('cat', 'surveillance', 'Surveillance clinique et biologique', 'recommande', ct.surveillance.length > 0 || filled(ct.surveillanceDetail));
  add('cat', 'orientation', 'Orientation du patient', 'indispensable', filled(ct.orientation));
  if (ct.traitements.some((t) => filled(t.nom))) {
    const nonVerif = ct.traitements.filter((t) => filled(t.nom) && !t.ciVerifiees);
    add('cat', 'ci', 'Contre-indications vérifiées pour chaque traitement', 'indispensable', nonVerif.length === 0, nonVerif.length ? `À vérifier : ${nonVerif.map((t) => t.nom).join(', ')}` : undefined);
  }

  /* ---------------- Synthèse des résultats ---------------- */
  const incoherences = coherence(obs, ctx);
  const hyper = ctx.atcd('bpco');
  const alertes = [...erreursSaisie(obs.constantes), ...alertesConstantes(obs.constantes, { hypercapnieChronique: hyper })];
  const rappels = rappelsContextuels(obs, ctx);

  const modules: ModuleId[] = ['identite', 'motif', 'antecedents', 'hdm', 'examen', 'scores', 'examens', 'synthese', 'discussion', 'cat', 'redaction'];
  const progression = Object.fromEntries(modules.map((m) => {
    const vs = verifs.filter((v) => v.module === m && v.niveau !== 'non_pertinent');
    if (!vs.length) return [m, m === 'scores' ? (Object.values(obs.scores).some((s) => s.inclure) ? 100 : 0) : m === 'redaction' ? redactionProgress(obs) : 0];
    const w = (v: Verif) => (v.niveau === 'indispensable' ? 2 : 1);
    const tot = vs.reduce((s, v) => s + w(v), 0);
    const ok = vs.filter((v) => v.ok).reduce((s, v) => s + w(v), 0);
    return [m, Math.round((ok / tot) * 100)];
  })) as Record<ModuleId, number>;
  const vsAll = verifs.filter((v) => v.niveau !== 'non_pertinent');
  const w = (v: Verif) => (v.niveau === 'indispensable' ? 2 : 1);
  const global = Math.round((vsAll.filter((v) => v.ok).reduce((s, v) => s + w(v), 0) / Math.max(1, vsAll.reduce((s, v) => s + w(v), 0))) * 100);
  const manquantsIndispensables = verifs.filter((v) => v.niveau === 'indispensable' && !v.ok).length;
  return { verifs, incoherences, alertes, rappels, progression, global, manquantsIndispensables };
}

function redactionProgress(obs: Observation): number {
  const n = Object.values(obs.redaction.verifies).filter(Boolean).length;
  return Math.min(100, Math.round((n / 12) * 100));
}

/* ------------------------------------------------------------------ */
/* Incohérences                                                         */
/* ------------------------------------------------------------------ */

function contient(texte: string, mot: string): boolean {
  return texte.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(mot.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''));
}

export function coherence(obs: Observation, ctx: Ctx = buildContext(obs)): Incoherence[] {
  const out: Incoherence[] = [];
  const add = (id: string, module: ModuleId, message: string, gravite: Incoherence['gravite'] = 'attention') => out.push({ id, module, message, gravite });
  const id = obs.identite;
  const naiss = parseDate(id.dateNaissance);
  const adm = parseDate(obs.admission.date);
  if (naiss && naiss.getTime() > Date.now()) add('naiss_futur', 'identite', 'La date de naissance est dans le futur.', 'critique');
  const age = ageAt(id.dateNaissance);
  if (age !== null && age > 120) add('age', 'identite', `Âge calculé de ${age} ans : vérifier la date de naissance.`);
  if (naiss && adm && adm < naiss) add('adm_naiss', 'identite', 'La date d’admission précède la date de naissance.', 'critique');
  if (adm && adm.getTime() > Date.now() + 86400000) add('adm_futur', 'identite', 'La date d’admission est dans le futur.');
  for (const s of obs.hdm.symptomes) {
    const d = parseDate(s.a.debut_date as string);
    if (d && adm && d.getTime() > adm.getTime() + 86400000) add(`debut_${s.uid}`, 'hdm', `${SYMPTOME_BY_ID[s.type]?.label ?? 'Symptôme'} : la date de début est postérieure à l’admission.`);
    const signe = SYMPTOME_SIGNE[s.type];
    if (signe && obs.findings[signe]?.s === 'a') add(`sym_${s.uid}`, 'hdm', `« ${FINDINGS[signe].label} » est analysé dans l’histoire de la maladie mais noté absent à l’interrogatoire.`, 'critique');
  }
  // Sexe et données gynécologiques
  const g = obs.atcd.gyneco;
  if (id.sexe === 'M' && (filled(g.ddr) || filled(g.gestite) || g.grossesse === 'en_cours')) add('sexe_gyneco', 'antecedents', 'Des données gynéco-obstétricales sont saisies pour un patient de sexe masculin.', 'critique');
  if (g.menopause === 'oui' && g.grossesse === 'en_cours') add('meno_gross', 'antecedents', 'Ménopause et grossesse en cours sont incompatibles.', 'critique');
  if (g.grossesse === 'en_cours' && age !== null && (age < 10 || age > 60)) add('gross_age', 'antecedents', 'Grossesse en cours : vérifier l’âge ou le statut.');
  // Tabac
  const t = obs.atcd.toxiques;
  if (t.tabac === 'non' && (filled(t.cigJour) || filled(t.paquetsAnnees))) add('tabac', 'antecedents', 'Patient déclaré non-fumeur mais une consommation tabagique est chiffrée.');
  if (t.alcool === 'non' && filled(t.alcoolVerresJour) && (num(t.alcoolVerresJour) ?? 0) > 0) add('alcool', 'antecedents', 'Absence de consommation d’alcool déclarée mais une quantité est saisie.');
  // Allergies / traitements
  if (obs.atcd.allergies.statut === 'aucune' && obs.atcd.allergies.entries.some((e) => filled(e.agent))) add('allergie_statut', 'antecedents', '« Aucune allergie connue » est coché alors que des allergies sont saisies.', 'critique');
  if (obs.atcd.traitements.statut === 'aucun' && obs.atcd.traitements.entries.some((e) => filled(e.nom))) add('ttt_statut', 'antecedents', '« Aucun traitement » est coché alors que des médicaments sont saisis.');
  if (obs.atcd.medicauxAucun && Object.values(obs.atcd.medicaux).some((c) => c.s === 'p')) add('atcd_aucun', 'antecedents', '« Aucun antécédent médical » est coché alors que des antécédents sont renseignés.', 'critique');
  // Constantes et signes
  const v = ctx.vit;
  if (v.t !== null && v.t >= 38 && obs.findings.fievre?.s === 'a') add('fievre', 'examen', `Température à ${obs.constantes.temperature} °C alors que la fièvre est notée absente.`);
  if (v.gcs !== null && v.gcs < 15 && obs.fields.conscience === 'conscient' && obs.fields.orientation?.startsWith('orienté')) add('gcs', 'examen', `Score de Glasgow à ${v.gcs}/15 alors que le patient est noté conscient et orienté.`);
  if (v.gcs === 15 && ['comateux', 'stuporeux'].includes(obs.fields.conscience ?? '')) add('gcs2', 'examen', 'Score de Glasgow à 15/15 incompatible avec l’état de conscience saisi.', 'critique');
  if (v.eva === 0 && ctx.symptomDefs.some((s) => s.douleur) && obs.hdm.symptomes.some((s) => (num(s.a.intensite as string) ?? 0) >= 4)) add('eva', 'examen', 'EVA à 0 à l’examen alors qu’une douleur intense est décrite dans l’histoire de la maladie (vérifier la chronologie ou l’antalgie).');
  if (v.spo2 !== null && v.spo2 < 88 && obs.findings.cyanose?.s === 'a' && obs.fields.type_respi === 'eupnéique') add('spo2', 'examen', `SpO₂ à ${v.spo2} % chez un patient noté eupnéique sans cyanose : vérifier la mesure.`);
  if (v.fr !== null && v.fr > 24 && obs.fields.type_respi === 'eupnéique') add('fr', 'examen', `FR à ${v.fr} cycles/min alors que le patient est noté eupnéique.`);
  if (v.fc !== null && obs.examens.ecg.realise === 'oui' && filled(obs.examens.ecg.fc)) {
    const fe = num(obs.examens.ecg.fc);
    if (fe !== null && Math.abs(fe - v.fc) > 40) add('fc_ecg', 'examens', `FC clinique (${v.fc}) et FC à l’ECG (${fe}) très différentes : vérifier.`);
  }
  if (obs.fields.rythme_cardiaque === 'régulier' && /fibrillation|flutter|acfa/i.test(obs.examens.ecg.rythme + ' ' + obs.examens.ecg.interpretation)) add('rythme', 'examen', 'Rythme cardiaque noté régulier à l’auscultation alors que l’ECG mentionne une arythmie.');
  // Tableaux spécialisés vs signes
  if (obs.findings.souffle_cardiaque?.s === 'a' && obs.specials.souffles.length) add('souffle', 'examen', 'Souffle cardiaque noté absent alors que des souffles sont décrits.', 'critique');
  if (obs.findings.adenopathies?.s === 'a' && obs.specials.adenopathies.length) add('adp', 'examen', 'Adénopathies notées absentes alors que des adénopathies sont décrites.', 'critique');
  if (obs.findings.deficit_moteur?.s === 'a' && Object.values(obs.specials.mrc).some((x) => /^[0-4]$/.test(x))) add('mrc', 'examen', 'Déficit moteur noté absent alors qu’une cotation MRC < 5 est saisie.', 'critique');
  // Biologie
  for (const pnl of obs.examens.bio) {
    for (const val of pnl.valeurs) {
      if (filled(val.valeur) && num(val.valeur) === null && !/^[<>≤≥]/.test(val.valeur.trim()) && !/positi|négati|negati|trace/i.test(val.valeur)) add(`bio_${val.uid}`, 'examens', `Valeur non numérique pour ${val.libelle || val.analyte} : « ${val.valeur} ».`);
    }
  }
  // Allergies et prescriptions
  const allergenes = obs.atcd.allergies.entries.filter((e) => filled(e.agent)).map((e) => e.agent.toLowerCase());
  for (const tr of obs.cat.traitements.filter((x) => filled(x.nom))) {
    const nom = tr.nom.toLowerCase();
    for (const al of allergenes) {
      if (contient(nom, al) || contient(al, nom.split(' ')[0])) {
        add(`allergie_${tr.uid}`, 'cat', `ALLERGIE : « ${tr.nom} » est prescrit alors qu’une allergie à « ${al} » est déclarée.`, 'critique');
        continue;
      }
      for (const cl of CLASSES_ALLERGIE) {
        if (!cl.motsCles.some((m) => contient(al, m))) continue;
        if (cl.molecules.some((m) => contient(nom, m))) add(`allergie_cl_${tr.uid}_${cl.nom}`, 'cat', `ALLERGIE : « ${tr.nom} » appartient à la classe ${cl.nom} ; allergie déclarée à « ${al} ».`, 'critique');
        else if (cl.croisees?.some((m) => contient(nom, m))) add(`allergie_cr_${tr.uid}_${cl.nom}`, 'cat', `Allergie croisée possible : « ${tr.nom} » chez un patient allergique à « ${al} » (${cl.nom}).`);
      }
    }
    for (const med of obs.atcd.traitements.entries.filter((m) => filled(m.nom))) {
      if (contient(nom.split(' ')[0], med.nom.toLowerCase().split(' ')[0]) && nom.length > 3) add(`doublon_${tr.uid}_${med.uid}`, 'cat', `« ${tr.nom} » figure déjà dans le traitement habituel : vérifier le doublon.`);
    }
  }
  const contraste = allergenes.some((al) => PRODUITS_CONTRASTE_MOTS.some((m) => contient(al, m)));
  if (contraste) {
    const exams = [...obs.cat.examensDemandes, obs.cat.examensDetail, obs.discussion.examensNecessaires].join(' ');
    if (EXAMENS_INJECTES_MOTS.some((m) => contient(exams, m))) add('contraste', 'cat', 'Examen avec injection de produit de contraste demandé chez un patient déclaré allergique aux produits de contraste iodés.', 'critique');
  }
  if (ctx.femmeAgeProcreer && obs.atcd.gyneco.grossesse !== 'exclue' && obs.atcd.gyneco.menopause !== 'oui') {
    const exams = [...obs.cat.examensDemandes, obs.cat.examensDetail].join(' ');
    if (/scanner|tdm|radio|angioscanner|scintigraph/i.test(exams)) add('grossesse_rx', 'cat', 'Imagerie irradiante demandée chez une femme en âge de procréer sans grossesse exclue.');
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rappels contextuels                                                  */
/* ------------------------------------------------------------------ */

export function rappelsContextuels(obs: Observation, ctx: Ctx = buildContext(obs)): Rappel[] {
  return ctx.symptomDefs.map((def) => {
    const items: Rappel['items'] = [];
    for (const f of def.focus) {
      if (!FINDINGS[f] && !FIELDS[f]) continue;
      const fd = FINDINGS[f];
      if (fd?.sex && ctx.sexe && fd.sex !== ctx.sexe) continue;
      items.push({ id: f, texte: `${libelle(f)} (${APPAREIL_BY_ID[(fd ?? FIELDS[f]).home]?.short ?? ''})`, fait: estDocumente(obs, f) });
    }
    for (const r of def.rappels) items.push({ texte: r, fait: null });
    return { symptome: def.id, titre: def.label, items, drapeaux: def.drapeaux, aNePasManquer: def.aNePasManquer };
  });
}
