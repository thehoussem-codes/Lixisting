/**
 * Génération automatique de l'observation médicale (trois formats).
 * Règles : aucune donnée inventée, aucune donnée manquante rédigée comme absente,
 * aucun examen « normal » rédigé s'il n'a pas été réalisé.
 */
import type { FormatObs, Observation } from '../../shared/types.ts';
import { APPAREILS, ETAT_GENERAL } from '../knowledge/appareils.ts';
import { ATCD_FAMILIAUX, ATCD_MEDICAUX } from '../knowledge/antecedents.ts';
import { ANALYTE_BY_ID, PANEL_BY_ID, statutValeur } from '../knowledge/biologie.ts';
import { FINDINGS, FIELDS } from '../knowledge/registry.ts';
import { SCORE_BY_ID, effectiveInputs } from '../knowledge/scores.ts';
import {
  ageAt, ageLabel, calcemieCorrigee, ckdEpi2021, classeIMC, cockcroft, fmtDate, fmtDateLong, fmtDateTime, fmtNum, fmtVal,
  fmtHeure, imc, num, pam, paquetsAnnees, stadeKDIGO, trouAnionique,
} from './calc.ts';
import { buildContext, type Ctx } from './context.ts';
import { article, de, empreinte, feminiser, liste, listeDe, minus, patient, phrase, phrases, type Patient } from './fr.ts';
import { analyserAppareil, fusionnerBlocs, redigerBloc, texteSigne, champAnormal, texteChamp, texteSpecial, NR } from './examen.ts';
import { redigerHDM, SYMPTOME_SIGNE } from './hdm.ts';
import { nodesToText, textToNodes, type DocNode, type DocSection, type GeneratedDoc } from './doc.ts';
import { SYMPTOME_BY_ID } from '../knowledge/symptomes.ts';

interface G {
  obs: Observation;
  ctx: Ctx;
  pt: Patient;
  format: FormatObs;
  complet: boolean;
  written: Set<string>;
}

type Builder = { id: string; title: string; level: 1 | 2; build: (g: G) => DocNode[] };

const p = (text: string, label?: string): DocNode => ({ t: 'p', text, label });

/** « Marié(e) » -> « marié » / « mariée » ; « Veuf(ve) » -> « veuf » / « veuve » */
function accordSexe(s: string, sexe: string): string {
  return s.replace(/([\p{L}-]+)\(([\p{L}]+)\)/gu, (_m, base: string, suf: string) => {
    if (sexe !== 'F') return base;
    if (suf === 'e') return base + 'e';
    if (suf === 've') return base.replace(/f$/, '') + 've';
    return base + suf;
  });
}

const AUPRES: Record<string, string> = {
  famille: 'de la famille', accompagnant: 'de l’accompagnant', 'dossier médical': 'du dossier médical',
  'médecin traitant': 'du médecin traitant', 'équipe pré-hospitalière': 'de l’équipe pré-hospitalière',
};
function aupres(x: string, pt: Patient): string {
  const k = x.toLowerCase();
  if (k === 'patient') return pt.du;
  return AUPRES[k] ?? de(k);
}

/* ================================================================== */
/* 1. État civil                                                        */
/* ================================================================== */

function etatCivil(g: G): DocNode[] {
  const { obs, pt } = g;
  const id = obs.identite;
  const ad = obs.admission;
  const age = ageLabel(id.dateNaissance, ad.date?.slice(0, 10));
  if (g.complet) {
    const rows: [string, string][] = [
      ['Nom et prénom', [id.nom.toUpperCase(), id.prenom].filter(Boolean).join(' ')],
      ['Identifiant (IPP)', id.ipp],
      ['Date de naissance', id.dateNaissance ? `${fmtDate(id.dateNaissance)}${age ? ` (${age})` : ''}` : ''],
      ['Sexe', id.sexe === 'M' ? 'Masculin' : id.sexe === 'F' ? 'Féminin' : ''],
      ['Adresse', id.adresse],
      ['Téléphone', id.telephone],
      ['Profession', id.profession],
      ['Situation familiale', id.situationFamiliale],
      ['Origine géographique', id.origine],
      ['Date et heure d’admission', ad.date ? fmtDateTime(ad.date) : ''],
      ['Service', ad.service],
      ['Médecin responsable', ad.medecin],
      ['Mode d’admission', ad.mode],
      ['Provenance', ad.provenance],
      ['Personne à prévenir', [id.personnePrevenir.nom, id.personnePrevenir.lien && `(${id.personnePrevenir.lien})`, id.personnePrevenir.telephone].filter(Boolean).join(' ')],
      ['Informateur(s)', ad.informateurs.join(', ')],
      ['Fiabilité des informations', [ad.fiabilite, ad.fiabiliteDetail].filter(Boolean).join(' — ')],
    ];
    const nodes: DocNode[] = rows.filter(([, v]) => v).map(([k, v]) => p(v, k));
    const manquants = rows.filter(([, v]) => !v).map(([k]) => minus(k));
    if (manquants.length) nodes.push(p(`${liste(manquants)}.`, 'Non renseignés'));
    return nodes;
  }
  const nom = [pt.civ, id.nom.toUpperCase(), id.prenom].filter(Boolean).join(' ') || 'Patient non identifié';
  const desc: string[] = [];
  if (age) desc.push(`âgé${pt.e} de ${age}`);
  if (id.dateNaissance) desc.push(`né${pt.e} le ${fmtDate(id.dateNaissance)}`);
  if (id.situationFamiliale) desc.push(accordSexe(minus(id.situationFamiliale), obs.identite.sexe));
  if (id.profession) desc.push(minus(id.profession));
  if (id.origine) desc.push(`originaire ${de(id.origine)}`);
  if (id.adresse) desc.push(`demeurant ${id.adresse}`);
  const s1 = `${nom}${id.ipp ? ` (IPP ${id.ipp})` : ''}${desc.length ? `, ${desc.join(', ')}` : ''}`;
  const adm: string[] = [];
  if (ad.date) adm.push(`admis${pt.e} le ${fmtDateTime(ad.date)}`);
  if (ad.service) adm.push(/^urgences/i.test(ad.service) ? 'aux urgences' : `dans le service ${de(minus(ad.service))}`);
  const modeProv = [ad.mode && `mode d’admission : ${minus(ad.mode)}`, ad.provenance && `provenance : ${ad.provenance}`].filter(Boolean);
  if (modeProv.length) adm.push(`(${modeProv.join(' ; ')})`);
  if (ad.medecin) adm.push(`sous la responsabilité du ${/^dr/i.test(ad.medecin) ? ad.medecin : `Dr ${ad.medecin}`}`);
  const s2 = adm.length ? adm.join(' ') : '';
  const info = ad.informateurs.length ? `Informations recueillies auprès ${liste(ad.informateurs.map((x) => aupres(x, pt)))}${ad.fiabilite ? ` ; fiabilité ${minus(ad.fiabilite)}${ad.fiabiliteDetail ? ` (${ad.fiabiliteDetail})` : ''}` : ''}` : '';
  const pp = id.personnePrevenir.nom ? `Personne à prévenir : ${id.personnePrevenir.nom}${id.personnePrevenir.lien ? ` (${id.personnePrevenir.lien})` : ''}${id.personnePrevenir.telephone ? `, ${id.personnePrevenir.telephone}` : ''}` : '';
  return [p(phrases([s2 ? `${s1}, ${s2}` : s1, info, pp]))];
}

/* ================================================================== */
/* 2. Motif                                                             */
/* ================================================================== */

function motif(g: G): DocNode[] {
  const m = g.obs.motif;
  const out: DocNode[] = [];
  if (m.formulation.trim()) out.push(p(phrase(m.formulation.trim())));
  else if (m.principal.trim()) {
    const sec = m.secondaires.filter((x) => x.trim());
    out.push(p(phrase(`${g.pt.Sujet} est hospitalisé${g.pt.e} pour ${liste([m.principal.trim(), ...sec].map(minus))}`)));
  }
  const det: string[] = [];
  if (m.symptomes.trim()) det.push(`Symptômes ayant motivé l’admission : ${m.symptomes.trim()}`);
  if (m.dateDebut) det.push(`Début des symptômes : ${fmtDateLong(m.dateDebut)}`);
  if (m.circonstances.trim()) det.push(`Circonstances de découverte : ${m.circonstances.trim()}`);
  if (m.caractere) det.push(`Admission ${m.caractere === 'urgent' ? 'en urgence' : 'programmée'}`);
  if (det.length) out.push(p(phrases(det)));
  return out;
}

/* ================================================================== */
/* 3. Antécédents                                                       */
/* ================================================================== */

function atcdMedicaux(g: G): DocNode[] {
  const a = g.obs.atcd;
  const items: string[] = [];
  const absents: { t: string }[] = [];
  const nr: string[] = [];
  for (const cat of ATCD_MEDICAUX) {
    const v = a.medicaux[cat.id];
    if (!v?.s) continue;
    if (v.s === 'a') { absents.push({ t: cat.t }); continue; }
    if (v.s === 'nr') { nr.push(minus(cat.label)); continue; }
    const entries = v.entries.filter((e) => e.nom.trim() || e.date || e.traitement.trim());
    if (!entries.length) { items.push(cat.label); continue; }
    for (const e of entries) {
      const parts = [e.nom.trim() || cat.label];
      if (e.date) parts[0] += ` (${/^\d{4}-\d{2}-\d{2}$/.test(e.date) ? `diagnostiqué${/^(hta|hypertension)/i.test(e.nom) ? 'e' : ''} le ${fmtDate(e.date)}` : `depuis ${e.date}`})`;
      if (e.traitement.trim()) parts.push(`traitement : ${e.traitement.trim()}`);
      if (e.suivi.trim()) parts.push(`suivi : ${e.suivi.trim()}`);
      if (e.complications.trim()) parts.push(`complications : ${e.complications.trim()}`);
      if (e.evolution.trim()) parts.push(`évolution : ${e.evolution.trim()}`);
      items.push(parts.join(' ; '));
    }
  }
  const out: DocNode[] = [];
  if (items.length) out.push({ t: 'ul', items });
  if (a.medicauxAucun && !items.length) out.push(p('Pas d’antécédent médical notable (recherche effectuée).'));
  if (absents.length) out.push(p(phrase(`Pas d’antécédent ${listeDe(absents, 'ni')}`)));
  if (g.complet && nr.length) out.push(p(phrase(`Non recherchés : ${liste(nr)}`)));
  if (!out.length) out.push(p('Antécédents médicaux non renseignés.'));
  return out;
}

function atcdChir(g: G): DocNode[] {
  const c = g.obs.atcd.chirurgicaux;
  const items = c.entries.filter((e) => e.intervention.trim()).map((e) => {
    const parts = [e.intervention.trim()];
    if (e.date) parts[0] += ` (${/^\d{4}-\d{2}-\d{2}$/.test(e.date) ? fmtDate(e.date) : e.date})`;
    if (e.indication.trim()) parts.push(`indication : ${e.indication.trim()}`);
    if (e.complications.trim()) parts.push(`complications : ${e.complications.trim()}`);
    return parts.join(' ; ');
  });
  if (items.length) return [{ t: 'ul', items }];
  if (c.s === 'a') return [p('Aucun antécédent chirurgical.')];
  if (c.s === 'nr') return g.complet ? [p('Antécédents chirurgicaux non recherchés.')] : [];
  return [p('Antécédents chirurgicaux non renseignés.')];
}

function atcdGyneco(g: G): DocNode[] {
  const y = g.obs.atcd.gyneco;
  const parts: string[] = [];
  const gp = [y.gestite && `G${y.gestite}`, y.parite && `P${y.parite}`].filter(Boolean).join('');
  if (gp) {
    const det = [y.accouchementsVB && `${y.accouchementsVB} accouchement(s) par voie basse`, y.cesariennes && `${y.cesariennes} césarienne(s)`, y.faussesCouches && `${y.faussesCouches} fausse(s) couche(s)`, y.ivg && `${y.ivg} IVG`].filter(Boolean);
    parts.push(`${gp}${det.length ? ` (${det.join(', ')})` : ''}`);
  } else {
    const det = [y.accouchementsVB && `${y.accouchementsVB} accouchement(s) par voie basse`, y.cesariennes && `${y.cesariennes} césarienne(s)`, y.faussesCouches && `${y.faussesCouches} fausse(s) couche(s)`].filter(Boolean);
    if (det.length) parts.push(det.join(', '));
  }
  if (y.menopause === 'oui') parts.push(`Ménopausée${y.ageMenopause ? ` depuis l’âge de ${y.ageMenopause} ans` : ''}${y.ths ? ` ; traitement hormonal : ${y.ths}` : ''}`);
  else {
    if (y.ddr) parts.push(`Date des dernières règles : ${fmtDate(y.ddr)}`);
    if (y.cycles) parts.push(`Cycles : ${y.cycles}`);
  }
  if (y.contraception) parts.push(`Contraception : ${y.contraception}`);
  const gr: Record<string, string> = { exclue: 'Grossesse exclue', possible: 'Grossesse possible (non exclue)', en_cours: `Grossesse en cours${y.termeGrossesse ? ` (${y.termeGrossesse})` : ''}`, nr: 'Statut de grossesse non vérifié' };
  if (y.grossesse && gr[y.grossesse]) parts.push(gr[y.grossesse]);
  if (y.atcdGyneco.trim()) parts.push(`Antécédents gynécologiques : ${y.atcdGyneco.trim()}`);
  if (!parts.length) return [p('Antécédents gynéco-obstétricaux non renseignés.')];
  return [p(phrases(parts))];
}

function atcdFamiliaux(g: G): DocNode[] {
  const f = g.obs.atcd.familiaux;
  const items = f.entries.filter((e) => e.pathologie.trim()).map((e) => `${e.lien ? `${e.lien[0].toUpperCase()}${e.lien.slice(1)} : ` : ''}${e.pathologie.trim()}${e.age ? ` (survenue à ${e.age} ans)` : ''}`);
  const absents = ATCD_FAMILIAUX.filter((c) => f.cats[c.id] === 'a').map((c) => ({ t: c.t }));
  const out: DocNode[] = [];
  if (items.length) out.push({ t: 'ul', items });
  if (f.s === 'a' && !items.length) out.push(p('Pas d’antécédent familial notable.'));
  if (absents.length) out.push(p(phrase(`Pas d’antécédent familial ${listeDe(absents, 'ni')}`)));
  if (!out.length) out.push(p(f.s === 'nr' ? 'Antécédents familiaux non recherchés.' : 'Antécédents familiaux non renseignés.'));
  return out;
}

function toxiques(g: G): DocNode[] {
  const t = g.obs.atcd.toxiques;
  const parts: string[] = [];
  const pa = num(t.paquetsAnnees) ?? paquetsAnnees(num(t.cigJour), num(t.tabacAnnees));
  const paTxt = pa !== null ? `${fmtNum(pa)} paquets-années` : '';
  if (t.tabac === 'non') parts.push('Non-fumeur');
  else if (t.tabac === 'actif') parts.push(`Tabagisme actif${t.cigJour ? ` à ${t.cigJour} cigarettes par jour` : ''}${t.tabacAnnees ? ` depuis ${t.tabacAnnees} ans` : ''}${paTxt ? `, soit ${paTxt}` : ''}`);
  else if (t.tabac === 'sevre') parts.push(`Tabagisme sevré${t.tabacArret ? ` depuis ${/^\d{4}-\d{2}/.test(t.tabacArret) ? fmtDate(t.tabacArret) : t.tabacArret}` : ''}${paTxt ? ` (${paTxt})` : ''}`);
  else if (t.tabac === 'passif') parts.push('Tabagisme passif');
  else if (t.tabac === 'nr' && g.complet) parts.push('Tabagisme non recherché');
  if (t.tabacAutre.trim()) parts.push(`Autre consommation de tabac : ${t.tabacAutre.trim()}`);
  const vj = num(t.alcoolVerresJour);
  const alc = vj !== null ? ` estimée à ${fmtVal(t.alcoolVerresJour)} verre(s) standard par jour (≈ ${Math.round(vj * 10)} g d’alcool/jour)` : '';
  if (t.alcool === 'non') parts.push('Pas de consommation d’alcool');
  else if (t.alcool === 'occasionnel') parts.push(`Consommation d’alcool occasionnelle${alc}`);
  else if (t.alcool === 'regulier') parts.push(`Consommation d’alcool régulière${alc}`);
  else if (t.alcool === 'sevre') parts.push('Sevrage alcoolique');
  else if (t.alcool === 'nr' && g.complet) parts.push('Consommation d’alcool non recherchée');
  if (t.alcoolDetail.trim()) parts.push(t.alcoolDetail.trim());
  const deta = Object.values(t.deta);
  if (deta.some((x) => x === 'oui' || x === 'non')) parts.push(`Questionnaire DETA : ${deta.filter((x) => x === 'oui').length}/4`);
  if (t.substances === 'non') parts.push('Pas de consommation de substances psychoactives');
  else if (t.substances === 'oui') parts.push(`Consommation de substances psychoactives${t.substancesDetail ? ` : ${t.substancesDetail}` : ''}`);
  if (t.expoPro.trim()) parts.push(`Exposition professionnelle : ${t.expoPro.trim()}`);
  if (t.expoEnv.trim()) parts.push(`Expositions environnementales : ${t.expoEnv.trim()}`);
  if (t.activitePhysique.trim()) parts.push(`Activité physique : ${t.activitePhysique.trim()}`);
  if (t.alimentation.trim()) parts.push(`Habitudes alimentaires : ${t.alimentation.trim()}`);
  if (!parts.length) return [p('Habitudes de vie et intoxications non renseignées.')];
  return [p(phrases(parts))];
}

function allergies(g: G): DocNode[] {
  const a = g.obs.atcd.allergies;
  const items = a.entries.filter((e) => e.agent.trim()).map((e) => {
    const det = [e.type && minus(e.type), e.reaction && `réaction : ${minus(e.reaction)}`, e.date && `en ${e.date}`, e.documentee && e.documentee].filter(Boolean);
    return `${e.agent.trim()}${det.length ? ` (${det.join(', ')})` : ''}`;
  });
  if (items.length) return [p('Allergies connues :'), { t: 'ul', items }];
  if (a.statut === 'aucune') return [p('Aucune allergie connue (recherche effectuée).')];
  if (a.statut === 'non_verifiees') return [p('Allergies non vérifiées.')];
  return [p('Allergies non renseignées.')];
}

function traitements(g: G): DocNode[] {
  const t = g.obs.atcd.traitements;
  const meds = t.entries.filter((m) => m.nom.trim());
  if (meds.length) {
    if (g.complet) {
      return [{
        t: 'table',
        head: ['Médicament', 'Dosage', 'Posologie', 'Voie', 'Fréquence', 'Observance', 'Début'],
        rows: meds.map((m) => [m.nom, m.dosage, m.posologie, m.voie, m.frequence, m.observance, m.debut]),
      }];
    }
    return [{ t: 'ul', items: meds.map((m) => [m.nom.trim(), m.dosage, m.posologie, m.voie, m.frequence].filter(Boolean).join(' ') + (m.observance ? ` (observance ${m.observance})` : '')) }];
  }
  if (t.statut === 'aucun') return [p('Pas de traitement au long cours.')];
  if (t.statut === 'non_verifies') return [p('Traitement habituel non vérifié.')];
  return [p('Traitement habituel non renseigné.')];
}

/* ================================================================== */
/* 4. Histoire de la maladie                                            */
/* ================================================================== */

function hdm(g: G): DocNode[] {
  const paras = redigerHDM({ obs: g.obs, pt: g.pt, written: g.written, complet: g.complet });
  if (!paras.length) return [p('Histoire de la maladie non renseignée.')];
  return paras.map((x) => p(x));
}

/* ================================================================== */
/* 5. Examen clinique                                                   */
/* ================================================================== */

function etatGeneral(g: G): DocNode[] {
  const an = analyserAppareil(g.obs, ETAT_GENERAL, g.written);
  const nodes: DocNode[] = [];
  for (const b of an.blocs) {
    const txt = redigerBloc(b, g.complet);
    if (!txt) continue;
    if (g.complet) nodes.push(p(txt, b.bloc.title));
    else nodes.push(p(txt));
  }
  if (!nodes.length) return [p('État général non renseigné.')];
  if (!g.complet) return [p(nodes.map((n) => (n.t === 'p' ? n.text : '')).join(' '))];
  return nodes;
}

export function constantesTexte(obs: Observation, complet: boolean): { texte: string; manquants: string[] } {
  const c = obs.constantes;
  const parts: string[] = [];
  const manquants: string[] = [];
  const v = (k: keyof typeof c) => (c[k] ?? '').toString().trim();
  if (v('temperature')) parts.push(`température ${fmtVal(v('temperature'))} °C`); else manquants.push('température');
  if (v('pas') && v('pad')) {
    const m = pam(num(v('pas')), num(v('pad')));
    parts.push(`PA ${v('pas')}/${v('pad')} mmHg${m !== null ? ` (PAM ${Math.round(m)} mmHg)` : ''}`);
  } else if (v('pas')) parts.push(`PA systolique ${v('pas')} mmHg`);
  else manquants.push('pression artérielle');
  if (v('fc')) parts.push(`FC ${v('fc')} bpm`); else manquants.push('fréquence cardiaque');
  if (v('fr')) parts.push(`FR ${v('fr')} cycles/min`); else manquants.push('fréquence respiratoire');
  if (v('spo2')) parts.push(`SpO₂ ${v('spo2')} %${c.o2 === 'aa' ? ' en air ambiant' : c.o2 === 'o2' ? ` sous ${c.o2Debit ? `${fmtVal(c.o2Debit)} L/min d’` : ''}oxygène` : ''}`); else manquants.push('SpO₂');
  if (v('glycemie')) parts.push(`glycémie capillaire ${fmtVal(v('glycemie'))} ${c.glycemieUnite || 'g/L'}`); else manquants.push('glycémie capillaire');
  const poids = num(v('poids'));
  const taille = num(v('taille'));
  const bmi = imc(poids, taille);
  if (poids !== null) parts.push(`poids ${fmtVal(v('poids'))} kg`); else manquants.push('poids');
  if (taille !== null) parts.push(`taille ${fmtVal(v('taille'))} cm`); else manquants.push('taille');
  if (bmi !== null) parts.push(`IMC ${fmtNum(bmi)} kg/m² (${classeIMC(bmi)})`);
  if (v('eva')) parts.push(`EVA ${v('eva')}/10`); else manquants.push('EVA');
  if (v('glasgow')) parts.push(`score de Glasgow ${v('glasgow')}/15`); else manquants.push('score de Glasgow');
  if (v('diurese')) parts.push(`diurèse ${v('diurese')} mL/24 h`);
  if (v('autres')) parts.push(v('autres'));
  let texte = parts.length ? phrase(`${v('heure') ? `Constantes relevées à ${fmtHeure(v('heure'))} : ` : ''}${parts.join(' ; ')}`) : '';
  if (complet && manquants.length && parts.length) texte += ' ' + phrase(`Non mesurés : ${liste(manquants)}`);
  return { texte, manquants };
}

function constantes(g: G): DocNode[] {
  const { texte } = constantesTexte(g.obs, g.complet);
  return [p(texte || 'Constantes non renseignées.')];
}

function scoresSection(g: G): DocNode[] {
  const items: string[] = [];
  for (const [id, val] of Object.entries(g.obs.scores)) {
    if (!val.inclure) continue;
    const def = SCORE_BY_ID[id];
    if (!def) continue;
    const { inputs } = effectiveInputs(def, val.inputs, g.ctx);
    const r = def.compute(inputs);
    if (!r.valeur) continue;
    let t = `${def.nom} : ${r.valeur}${r.interpretation ? ` — ${r.interpretation}` : ''}`;
    if (!r.complet && r.manquants.length) t += ` (critères non renseignés : ${r.manquants.join(', ')})`;
    if (val.commentaire?.trim()) t += ` ${val.commentaire.trim()}`;
    items.push(t);
  }
  return items.length ? [{ t: 'ul', items }] : [];
}

function appareilBuilder(appId: string): (g: G) => DocNode[] {
  return (g) => {
    const app = APPAREILS.find((a) => a.id === appId)!;
    const an = analyserAppareil(g.obs, app, g.written);
    if (an.statut === 'nr') return g.complet ? [p('Non examiné.')] : [];
    if (an.statut === 'na') return g.complet ? [p('Non pertinent dans ce contexte ; non examiné.')] : [];
    const nodes: DocNode[] = [];
    const textes: string[] = [];
    if (g.complet) {
      for (const b of an.blocs) {
        const txt = redigerBloc(b, true);
        if (txt) nodes.push(p(txt, b.bloc.title));
      }
    } else {
      const interro = fusionnerBlocs(an.blocs.filter((b) => b.bloc.kind === 'interrogatoire'), 'interrogatoire');
      const exam = fusionnerBlocs(an.blocs.filter((b) => b.bloc.kind !== 'interrogatoire'), 'examen');
      const ti = redigerBloc(interro, false);
      if (ti) textes.push(`Signes fonctionnels : ${minus(ti)}`);
      const te = redigerBloc(exam, false);
      if (te) textes.push(te);
    }
    if (an.conclusion.trim()) {
      if (g.complet) nodes.push(p(phrase(an.conclusion.trim()), 'Conclusion'));
      else textes.push(phrase(`Conclusion : ${minus(an.conclusion.trim())}`));
    }
    if (!g.complet) return textes.length ? [p(textes.join(' '))] : [];
    return nodes.length ? nodes : [p('Examen non renseigné.')];
  };
}

function limitesExamen(g: G): DocNode[] {
  const nonEx: string[] = [];
  const nonPert: string[] = [];
  const nonRens: string[] = [];
  for (const app of APPAREILS) {
    const st = g.obs.appareils[app.id]?.statut;
    if (st === 'nr') nonEx.push(minus(app.short));
    else if (st === 'na') nonPert.push(minus(app.short));
    else if (!analyserAppareil(g.obs, app, new Set(), true).aDuContenu) nonRens.push(minus(app.short));
  }
  const out: string[] = [];
  if (nonEx.length) out.push(`Appareils non examinés : ${liste(nonEx)}`);
  if (nonPert.length) out.push(`Non pertinents dans ce contexte : ${liste(nonPert)}`);
  if (nonRens.length) out.push(`Examen non renseigné : ${liste(nonRens)}`);
  return out.length ? [p(phrases(out))] : [];
}

/* ================================================================== */
/* 6. Examens complémentaires                                           */
/* ================================================================== */

const FLECHE = { haut: '↑', bas: '↓' } as const;

function bioLignes(g: G, seulementAnormaux: boolean): { panel: string; date: string; lignes: { label: string; val: string; unite: string; ref: string; statut: string }[]; interpretation: string }[] {
  const sexe = g.obs.identite.sexe;
  return g.obs.examens.bio.map((pnl) => {
    const lignes = pnl.valeurs.filter((v) => v.valeur.trim()).map((v) => {
      const a = ANALYTE_BY_ID[v.analyte];
      const n = num(v.valeur);
      const st = n === null ? null : statutValeur(n, v.unite, a, num(v.refMin), num(v.refMax), sexe);
      const ref = v.refMin || v.refMax ? `${v.refMin || ''}${v.refMin && v.refMax ? ' – ' : v.refMax ? '< ' : ''}${v.refMax || ''}` : '';
      return { label: v.libelle || a?.label || 'Analyse', val: fmtVal(v.valeur), unite: v.unite, ref, statut: st === 'haut' || st === 'bas' ? st : '' };
    }).filter((l) => !seulementAnormaux || l.statut);
    return { panel: PANEL_BY_ID[pnl.type]?.label ?? pnl.type ?? 'Biologie', date: pnl.date, lignes, interpretation: pnl.interpretation };
  });
}

export function calculsBio(g: { obs: Observation; ctx: Ctx }): string[] {
  const { ctx, obs } = g;
  const out: string[] = [];
  const creat = ctx.bio('creat');
  const age = ageAt(obs.identite.dateNaissance, obs.admission.date?.slice(0, 10));
  const dfg = ckdEpi2021(creat, age, obs.identite.sexe);
  if (dfg !== null) out.push(`DFG estimé (CKD-EPI 2021) : ${Math.round(dfg)} mL/min/1,73 m² (stade ${stadeKDIGO(dfg)})`);
  const cg = cockcroft(creat, age, ctx.vit.poids, obs.identite.sexe);
  if (cg !== null) out.push(`clairance de la créatinine (Cockcroft-Gault) : ${Math.round(cg)} mL/min`);
  const cc = calcemieCorrigee(ctx.bio('ca'), ctx.bio('albumine'));
  if (cc !== null) out.push(`calcémie corrigée : ${fmtNum(cc, 2)} mmol/L`);
  const ta = trouAnionique(ctx.bio('na'), ctx.bio('cl'), ctx.bio('hco3'));
  if (ta !== null) out.push(`trou anionique : ${fmtNum(ta)} mmol/L`);
  return out;
}

function examensComp(g: G): DocNode[] {
  const nodes: DocNode[] = [];
  const panels = bioLignes(g, false);
  for (const pnl of panels) {
    if (!pnl.lignes.length && !pnl.interpretation.trim()) continue;
    const titre = `${pnl.panel}${pnl.date ? ` (${fmtDate(pnl.date)})` : ''}`;
    if (g.complet && pnl.lignes.length) {
      nodes.push({ t: 'table', caption: titre, head: ['Analyse', 'Résultat', 'Unité', 'Référence', ''], rows: pnl.lignes.map((l) => [l.label, l.val, l.unite, l.ref, l.statut ? FLECHE[l.statut as 'haut' | 'bas'] : '']) });
    } else if (pnl.lignes.length) {
      nodes.push(p(phrase(pnl.lignes.map((l) => `${l.label} ${l.val}${l.unite ? ` ${l.unite}` : ''}${l.statut ? ` (${FLECHE[l.statut as 'haut' | 'bas']})` : ''}`).join(', ')), titre));
    }
    if (pnl.interpretation.trim()) nodes.push(p(phrase(pnl.interpretation.trim()), 'Interprétation'));
  }
  const calc = calculsBio(g);
  if (calc.length) nodes.push(p(phrase(calc.join(' ; ')), 'Calculs'));
  const e = g.obs.examens.ecg;
  if (e.realise === 'oui') {
    const parts = [e.rythme && `rythme ${minus(e.rythme)}`, e.fc && `FC ${e.fc} bpm`, e.axe && `axe ${minus(e.axe)}`, e.pr && `PR ${e.pr} ms`, e.qrs && `QRS ${e.qrs} ms`, e.qtc && `QTc ${e.qtc} ms`, e.st && `segment ST : ${e.st}`, e.ondeT && `ondes T : ${e.ondeT}`, e.autres].filter(Boolean) as string[];
    const txt = phrases([parts.join(', '), e.interpretation && `Interprétation : ${e.interpretation}`]);
    nodes.push(p(txt || 'Réalisé, résultat non saisi.', `ECG${e.date ? ` (${fmtDateTime(e.date)})` : ''}`));
  } else if (e.realise === 'non' && g.complet) nodes.push(p('Non réalisé.', 'ECG'));
  for (const x of g.obs.examens.autres) {
    if (!x.type && !x.resultat && !x.conclusion) continue;
    const titre = `${x.type || x.categorie}${x.region ? ` (${x.region})` : ''}${x.date ? ` — ${fmtDate(x.date)}` : ''}`;
    const txt = phrases([x.resultat, x.conclusion && `Conclusion : ${x.conclusion}`, x.interpretation && `Interprétation : ${x.interpretation}`]);
    nodes.push(p(txt || 'Résultat en attente.', titre));
  }
  if (!nodes.length) return [p('Aucun examen complémentaire renseigné.')];
  return nodes;
}

/* ================================================================== */
/* 7. Synthèse clinique                                                 */
/* ================================================================== */

function terrain(g: G): string[] {
  const a = g.obs.atcd;
  const t: string[] = [];
  for (const cat of ATCD_MEDICAUX) {
    const v = a.medicaux[cat.id];
    if (v?.s !== 'p') continue;
    const noms = v.entries.map((e) => e.nom.trim()).filter(Boolean);
    t.push(noms.length ? noms.map(minus).join(', ') : minus(cat.label));
  }
  const tox = a.toxiques;
  const pa = num(tox.paquetsAnnees) ?? paquetsAnnees(num(tox.cigJour), num(tox.tabacAnnees));
  if (tox.tabac === 'actif') t.push(`tabagisme actif${pa !== null ? ` (${fmtNum(pa)} PA)` : ''}`);
  if (tox.tabac === 'sevre') t.push(`tabagisme sevré${pa !== null ? ` (${fmtNum(pa)} PA)` : ''}`);
  if (tox.alcool === 'regulier') t.push('consommation d’alcool régulière');
  const allerg = a.allergies.entries.filter((e) => e.agent.trim()).map((e) => e.agent.trim());
  if (allerg.length) t.push(`allergie déclarée (${allerg.join(', ')})`);
  if (g.obs.identite.sexe === 'F' && a.gyneco.grossesse === 'en_cours') t.push('grossesse en cours');
  return t;
}

function constantesAnormales(g: G): string[] {
  const v = g.ctx.vit;
  const c = g.obs.constantes;
  const out: string[] = [];
  if (v.t !== null) {
    if (v.t >= 38) out.push(`fébrile à ${fmtVal(c.temperature)} °C`);
    else if (v.t < 36) out.push(`hypotherme à ${fmtVal(c.temperature)} °C`);
    else out.push(`apyrétique (${fmtVal(c.temperature)} °C)`);
  }
  if (v.pas !== null) {
    const pa = `${c.pas}${c.pad ? `/${c.pad}` : ''} mmHg`;
    if (v.pas < 90) out.push(`hypotendu${g.pt.e} à ${pa}`);
    else if (v.pas >= 140 || (v.pad ?? 0) >= 90) out.push(`PA élevée à ${pa}`);
  }
  if (v.fc !== null) {
    if (v.fc > 100) out.push(`tachycarde à ${c.fc} bpm`);
    else if (v.fc < 50) out.push(`bradycarde à ${c.fc} bpm`);
  }
  if (v.fr !== null) {
    if (v.fr > 20) out.push(`polypnéique à ${c.fr} cycles/min`);
    else if (v.fr < 12) out.push(`bradypnéique à ${c.fr} cycles/min`);
  }
  if (v.spo2 !== null && v.spo2 < 95) out.push(`SpO₂ à ${c.spo2} %${c.o2 === 'aa' ? ' en air ambiant' : c.o2 === 'o2' ? ' sous oxygène' : ''}`);
  if (v.glyMmol !== null && (v.glyMmol < 3.9 || v.glyMmol >= 10)) out.push(`glycémie capillaire à ${fmtVal(c.glycemie)} ${c.glycemieUnite || 'g/L'}`);
  if (v.gcs !== null && v.gcs < 15) out.push(`score de Glasgow à ${c.glasgow}/15`);
  if (v.eva !== null && v.eva > 0) out.push(`EVA à ${c.eva}/10`);
  return out;
}

/** Signes positifs (fonctionnels ou physiques) et négatifs pertinents, toutes rubriques confondues */
export function signesSynthese(obs: Observation, ctx: Ctx): { fonctionnelsP: string[]; fonctionnelsA: string[]; physiquesP: string[]; physiquesA: string[]; champsP: string[]; speciauxP: string[] } {
  const fonctionnelsP: string[] = [];
  const fonctionnelsA: string[] = [];
  const physiquesP: string[] = [];
  const physiquesA: string[] = [];
  const champsP: string[] = [];
  const speciauxP: string[] = [];
  const pertinents = new Set([...ctx.focus, ...ctx.associes]);
  const signesSymptomes = new Set(obs.hdm.symptomes.map((s) => SYMPTOME_SIGNE[s.type]).filter(Boolean));
  for (const [id, val] of Object.entries(obs.findings)) {
    const def = FINDINGS[id];
    if (!def || !val.s || signesSymptomes.has(id)) continue;
    if (def.sex && obs.identite.sexe && def.sex !== obs.identite.sexe) continue;
    if (val.s === 'p') {
      if (['souffle_cardiaque', 'adenopathies', 'lesions_cutanees'].includes(id)) continue; // détaillés par les tableaux
      (def.nature === 'fonctionnel' ? fonctionnelsP : physiquesP).push(article(texteSigne(def, val), def.g));
    } else if (val.s === 'a' && pertinents.has(id)) {
      (def.nature === 'fonctionnel' ? fonctionnelsA : physiquesA).push(def.t);
    }
  }
  for (const [id, v] of Object.entries(obs.fields)) {
    const def = FIELDS[id];
    if (!def || !v || v === NR) continue;
    if (champAnormal(def, v) && !['conscience', 'etat_general'].includes(id)) champsP.push(texteChamp(def, v, obs.identite.sexe));
  }
  for (const sp of ['pouls', 'paBras', 'souffles', 'mrc', 'rot', 'nerfs', 'adenopathies', 'articulations', 'lesions']) {
    const r = texteSpecial(obs, sp);
    speciauxP.push(...r.positifs);
  }
  return { fonctionnelsP, fonctionnelsA: fonctionnelsA.slice(0, 12), physiquesP, physiquesA: physiquesA.slice(0, 12), champsP, speciauxP };
}

function resumeSymptomePrincipal(g: G): string {
  const e = [...g.obs.hdm.symptomes].sort((x, y) => Number(y.principal) - Number(x.principal))[0];
  if (!e) return '';
  const def = SYMPTOME_BY_ID[e.type];
  if (!def) return '';
  const t = def.id === 'autre' ? (e.libelle || 'symptôme').toLowerCase() : def.t;
  const a = e.a;
  const det: string[] = [];
  const siege = Array.isArray(a.siege) ? a.siege : [];
  if (siege.length) det.push(liste(siege));
  if (Array.isArray(a.type) && a.type.length) det.push(`à type de ${liste(a.type)}`);
  if (a.intensite) det.push(`d’intensité ${a.intensite}/10`);
  if (Array.isArray(a.irradiation) && a.irradiation.length) det.push(a.irradiation.includes('sans irradiation') ? 'sans irradiation' : `irradiant ${liste(a.irradiation)}`);
  const mode = typeof a.mode_debut === 'string' ? a.mode_debut : '';
  const date = typeof a.debut_date === 'string' ? a.debut_date : '';
  const evo = typeof a.evolution === 'string' ? a.evolution : '';
  const intro = def.id === 'autre' ? t : `${def.g === 'f' ? 'une' : def.g === 'm' ? 'un' : 'des'} ${t}`;
  return `${intro}${det.length ? ` ${det.join(', ')}` : ''}${mode ? `, d’installation ${mode === 'brutal' ? 'brutale' : mode.replace(/if$/, 'ive').replace(/eux$/, 'euse')}` : ''}${date ? `, évoluant depuis le ${fmtDate(date)}` : ''}${evo ? ` (${evo})` : ''}`;
}

export function syntheseNodes(g: G): DocNode[] {
  const { obs, pt, ctx } = g;
  const id = obs.identite;
  const out: string[] = [];
  // Identité et terrain
  const age = ageLabel(id.dateNaissance, obs.admission.date?.slice(0, 10));
  const nom = [pt.civ, id.nom.toUpperCase()].filter(Boolean).join(' ');
  const ter = terrain(g);
  const qui = `Il s’agit ${nom ? `de ${nom}` : `d’${pt.sujet === 'la patiente' ? 'une patiente' : 'un patient'}`}${age ? `, âgé${pt.e} de ${age}` : ''}${id.profession ? `, ${minus(id.profession)}` : ''}`;
  const terTxt = ter.length ? `, aux antécédents ${listeDe(ter.map((t) => ({ t })))}` : '';
  const motifTxt = obs.motif.principal.trim() ? `, admis${pt.e}${obs.admission.date ? ` le ${fmtDate(obs.admission.date)}` : ''} pour ${minus(obs.motif.principal.trim())}` : '';
  out.push(phrase(`${qui}${terTxt}${motifTxt}`));
  // HDM résumée
  const sp = resumeSymptomePrincipal(g);
  if (sp) out.push(phrase(`Le tableau clinique est marqué par ${sp}`));
  const s = signesSynthese(obs, ctx);
  const itg: string[] = [];
  if (s.fonctionnelsP.length) itg.push(`À l’interrogatoire, on retient ${liste(s.fonctionnelsP)}`);
  if (s.fonctionnelsA.length) itg.push(`${s.fonctionnelsP.length ? 'Pas' : 'À l’interrogatoire, pas'} ${listeDe(s.fonctionnelsA.map((t) => ({ t })), 'ni')}`);
  if (itg.length) out.push(phrases(itg));
  // Examen
  const eg: string[] = [];
  const cons = obs.fields.conscience;
  if (cons && cons !== NR) eg.push(`${pt.sujet} est ${obs.identite.sexe === 'F' ? feminiser(cons) : cons}`);
  const etat = obs.fields.etat_general;
  if (etat && etat !== NR) eg.push(`état général ${etat}`);
  const cst = constantesAnormales(g);
  const ex: string[] = [];
  if (eg.length || cst.length) ex.push(`À l’examen, ${[...eg, ...cst].join(', ')}`);
  if (s.physiquesP.length) ex.push(`${ex.length ? 'On retrouve' : 'À l’examen, on retrouve'} ${liste(s.physiquesP)}`);
  if (s.champsP.length) ex.push(s.champsP.join(', '));
  if (s.speciauxP.length) ex.push(s.speciauxP.join(' ; '));
  if (s.physiquesA.length) ex.push(`Absence ${listeDe(s.physiquesA.map((t) => ({ t })))}`);
  if (ex.length) out.push(phrases(ex));
  else if (!Object.keys(obs.findings).length) out.push('Examen clinique non renseigné.');
  // Examens complémentaires
  const bio = bioLignes(g, true).flatMap((pnl) => pnl.lignes.map((l) => `${l.label} ${l.val}${l.unite ? ` ${l.unite}` : ''} (${FLECHE[l.statut as 'haut' | 'bas']})`));
  const ecg = obs.examens.ecg;
  const autres = obs.examens.autres.filter((x) => x.conclusion.trim() || x.interpretation.trim()).map((x) => `${x.type || x.categorie} : ${x.conclusion.trim() || x.interpretation.trim()}`);
  const ec: string[] = [];
  if (bio.length) ec.push(`Sur le plan biologique : ${bio.join(', ')}`);
  const calc = calculsBio(g);
  if (calc.length) ec.push(calc.join(' ; '));
  if (ecg.realise === 'oui' && (ecg.interpretation || ecg.rythme)) ec.push(`ECG : ${ecg.interpretation || `rythme ${minus(ecg.rythme)}`}`);
  ec.push(...autres);
  if (ec.length) out.push(phrases(ec));
  if (obs.syntheseNote.trim()) out.push(phrase(obs.syntheseNote.trim()));
  return out.map((x) => p(x));
}

/* ================================================================== */
/* 8–9. Discussion et diagnostic                                        */
/* ================================================================== */

function discussion(g: G): DocNode[] {
  const d = g.obs.discussion;
  const nodes: DocNode[] = [];
  if (d.syndromes.trim()) nodes.push(p(phrase(d.syndromes.trim()), 'Syndrome(s) identifié(s)'));
  if (d.diagnosticPrincipal.trim()) {
    nodes.push(p(phrase(`Le diagnostic principal évoqué est ${minus(d.diagnosticPrincipal.trim())}`)));
    if (d.argumentsPour.trim()) nodes.push(p(d.argumentsPour.trim(), 'Arguments en faveur'));
    if (d.argumentsContre.trim()) nodes.push(p(d.argumentsContre.trim(), 'Arguments contre'));
  }
  const diffs = d.differentiels.filter((x) => x.diagnostic.trim());
  if (diffs.length) {
    nodes.push(p('Diagnostics différentiels :'));
    nodes.push({ t: 'ul', items: diffs.map((x) => [x.diagnostic.trim(), x.pour.trim() && `pour : ${x.pour.trim()}`, x.contre.trim() && `contre : ${x.contre.trim()}`, x.examens.trim() && `à confirmer/infirmer par : ${x.examens.trim()}`].filter(Boolean).join(' — ')) });
  }
  if (d.urgences.trim()) nodes.push(p(phrase(d.urgences.trim()), 'Diagnostics à éliminer en urgence'));
  if (d.examensNecessaires.trim()) nodes.push(p(phrase(d.examensNecessaires.trim()), 'Examens nécessaires'));
  if (d.commentaire.trim()) nodes.push(p(d.commentaire.trim()));
  return nodes.length ? nodes : [p('Discussion diagnostique non rédigée.')];
}

function diagnostic(g: G): DocNode[] {
  const d = g.obs.discussion;
  const nodes: DocNode[] = [];
  if (d.diagnosticRetenu.trim()) {
    nodes.push(p(d.diagnosticRetenu.trim(), d.statutDiagnostic === 'retenu' ? 'Diagnostic retenu' : 'Hypothèse diagnostique principale'));
  }
  const hyp = d.hypotheses.filter((x) => x.trim());
  if (hyp.length) nodes.push(p('Hypothèses diagnostiques hiérarchisées :'), ...hyp.map((h, i) => p(`${i + 1}. ${h.trim()}`)));
  return nodes.length ? nodes : [p('Aucun diagnostic ni hypothèse renseigné.')];
}

/* ================================================================== */
/* 10. Conduite à tenir                                                 */
/* ================================================================== */

function cat(g: G): DocNode[] {
  const c = g.obs.cat;
  const nodes: DocNode[] = [];
  const mes = [...c.mesures, ...(c.mesuresDetail.trim() ? [c.mesuresDetail.trim()] : [])];
  if (mes.length) nodes.push(p('Mesures immédiates :'), { t: 'ul', items: mes });
  const tt = c.traitements.filter((t) => t.nom.trim());
  if (tt.length) {
    if (g.complet) {
      nodes.push({ t: 'table', caption: 'Traitements prescrits (validés par le médecin)', head: ['Traitement', 'Dose', 'Posologie', 'Voie', 'Fréquence', 'Durée', 'Indication', 'Surveillance'], rows: tt.map((t) => [t.nom, t.dose, t.posologie, t.voie, t.frequence, t.duree, t.indication, [t.surveillance, t.effets && `EI : ${t.effets}`].filter(Boolean).join(' ; ')]) });
    } else {
      nodes.push(p('Traitements :'), { t: 'ul', items: tt.map((t) => [t.nom, t.dose, t.posologie, t.voie, t.frequence, t.duree && `pendant ${t.duree}`].filter(Boolean).join(' ') + (t.indication ? ` (${t.indication})` : '')) });
    }
  }
  const ex = [...c.examensDemandes, ...(c.examensDetail.trim() ? [c.examensDetail.trim()] : [])];
  if (ex.length) nodes.push(p('Examens complémentaires demandés :'), { t: 'ul', items: ex });
  const su = [...c.surveillance, ...(c.surveillanceDetail.trim() ? [c.surveillanceDetail.trim()] : [])];
  if (su.length) nodes.push(p('Surveillance clinique et biologique :'), { t: 'ul', items: su });
  const av = c.avis.filter((a) => a.specialite.trim());
  if (av.length) nodes.push(p('Avis spécialisés :'), { t: 'ul', items: av.map((a) => `${a.specialite}${a.motif ? ` — motif : ${a.motif}` : ''}${a.date ? ` (${fmtDate(a.date)})` : ''}${a.reponse ? ` — réponse : ${a.reponse}` : ''}`) });
  if (c.orientation) nodes.push(p(phrase(`${c.orientation}${c.orientationDetail ? ` : ${c.orientationDetail}` : ''}`), 'Orientation'));
  if (c.consignes.trim()) nodes.push(p(phrase(c.consignes.trim()), 'Consignes'));
  if (c.reevaluation.trim()) nodes.push(p(phrase(c.reevaluation.trim()), 'Réévaluation'));
  return nodes.length ? nodes : [p('Conduite à tenir non renseignée.')];
}

/* ================================================================== */
/* Assemblage                                                           */
/* ================================================================== */

function plan(g: G): Builder[] {
  const femme = g.obs.identite.sexe === 'F';
  if (g.format === 'court') {
    return [
      { id: 'court_synthese', title: 'Synthèse médicale', level: 1, build: syntheseNodes },
      { id: 'court_diagnostic', title: 'Diagnostic / hypothèses', level: 1, build: diagnostic },
      { id: 'court_cat', title: 'Conduite à tenir', level: 1, build: cat },
    ];
  }
  const apps: Builder[] = APPAREILS.map((a) => ({ id: `app_${a.id}`, title: a.redac, level: 2 as const, build: appareilBuilder(a.id) }));
  return [
    { id: 'etat_civil', title: '1. État civil', level: 1, build: etatCivil },
    { id: 'motif', title: '2. Motif d’hospitalisation', level: 1, build: motif },
    { id: 'antecedents', title: '3. Antécédents', level: 1, build: () => [] },
    { id: 'atcd_medicaux', title: 'Antécédents médicaux', level: 2, build: atcdMedicaux },
    { id: 'atcd_chirurgicaux', title: 'Antécédents chirurgicaux', level: 2, build: atcdChir },
    ...(femme ? [{ id: 'atcd_gyneco', title: 'Antécédents gynéco-obstétricaux', level: 2 as const, build: atcdGyneco }] : []),
    { id: 'atcd_familiaux', title: 'Antécédents familiaux', level: 2, build: atcdFamiliaux },
    { id: 'atcd_toxiques', title: 'Habitudes de vie et intoxications', level: 2, build: toxiques },
    { id: 'allergies', title: 'Allergies', level: 2, build: allergies },
    { id: 'traitements', title: 'Traitement habituel', level: 2, build: traitements },
    { id: 'hdm', title: '4. Histoire de la maladie', level: 1, build: hdm },
    { id: 'examen', title: '5. Examen clinique', level: 1, build: () => [] },
    { id: 'etat_general', title: 'État général', level: 2, build: etatGeneral },
    { id: 'constantes', title: 'Constantes et paramètres', level: 2, build: constantes },
    { id: 'scores', title: 'Scores et classifications', level: 2, build: scoresSection },
    ...apps,
    { id: 'examen_limites', title: 'Limites de l’examen', level: 2, build: limitesExamen },
    { id: 'examens_comp', title: '6. Examens complémentaires', level: 1, build: examensComp },
    { id: 'synthese', title: '7. Synthèse clinique', level: 1, build: syntheseNodes },
    { id: 'discussion', title: '8. Discussion diagnostique', level: 1, build: discussion },
    { id: 'diagnostic', title: '9. Diagnostic retenu / hypothèses diagnostiques', level: 1, build: diagnostic },
    { id: 'cat', title: '10. Conduite à tenir', level: 1, build: cat },
  ];
}

const SECTIONS_STRUCTURELLES = new Set(['antecedents', 'examen']);

export function generate(obs: Observation, format: FormatObs): GeneratedDoc {
  const ctx = buildContext(obs);
  const g: G = { obs, ctx, pt: patient(obs.identite.sexe), format, complet: format === 'complet', written: new Set() };
  const overrides = obs.redaction.overrides[format] ?? {};
  const sections: DocSection[] = [];
  for (const b of plan(g)) {
    let nodes = b.build(g);
    if (!nodes.length && !SECTIONS_STRUCTURELLES.has(b.id)) continue;
    const generated = nodesToText(nodes);
    const vide = /non renseigné|non rédigée|non examiné|Aucun examen complémentaire/.test(generated) && nodes.length === 1;
    const ov = overrides[b.id];
    let edited = false;
    let stale = false;
    if (ov) {
      edited = true;
      stale = ov.base !== empreinte(generated);
      nodes = textToNodes(ov.text);
    }
    sections.push({ id: b.id, title: b.title, level: b.level, nodes, generated, edited, stale, vide });
  }
  const titre = format === 'court' ? 'Synthèse médicale' : 'Observation médicale';
  // Ajout d'un en-tête d'identification pour le format court
  if (format === 'court') {
    const id = obs.identite;
    const age = ageLabel(id.dateNaissance, obs.admission.date?.slice(0, 10));
    const ligne = [[g.pt.civ, id.nom.toUpperCase(), id.prenom].filter(Boolean).join(' '), age, id.ipp && `IPP ${id.ipp}`, obs.admission.date && `admission le ${fmtDateTime(obs.admission.date)}`, obs.admission.service].filter(Boolean).join(' — ');
    sections.unshift({ id: 'court_identite', title: 'Patient', level: 1, nodes: [p(ligne || 'Patient non identifié')], generated: ligne, edited: false, stale: false, vide: !ligne });
  }
  return { format, titre, sections };
}

/** Empreinte du texte généré d'une section (pour enregistrer une modification manuelle) */
export function baseSection(obs: Observation, format: FormatObs, sectionId: string): string {
  const copie: Observation = { ...obs, redaction: { ...obs.redaction, overrides: {} } };
  const doc = generate(copie, format);
  const s = doc.sections.find((x) => x.id === sectionId);
  return empreinte(s?.generated ?? '');
}

export { empreinte };
