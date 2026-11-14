/** Rédaction de l'histoire de la maladie à partir de l'assistant d'interrogatoire. */
import type { Observation, SymptomEntry } from '../../shared/types.ts';
import { SYMPTOME_BY_ID, type Question, type SymptomDef } from '../knowledge/symptomes.ts';
import { FINDINGS } from '../knowledge/registry.ts';
import type { Genre } from '../knowledge/types.ts';
import { accord, article, cap, de, deArticle, gabarit, liste, listeDe, minus, phrase, pronom, type Patient } from './fr.ts';
import { delai, fmtDateLong, fmtHeure } from './calc.ts';
import { texteSigne } from './examen.ts';

/** Signe d'interrogatoire correspondant à un symptôme analysé (renseigné automatiquement). */
export const SYMPTOME_SIGNE: Record<string, string> = {
  dl_thoracique: 'douleur_thoracique',
  dl_abdominale: 'douleur_abdominale',
  cephalee: 'cephalees',
  dl_lombaire: 'douleur_lombaire',
  dyspnee: 'dyspnee',
  toux: 'toux',
  palpitations: 'palpitations',
  syncope: 'syncope',
  fievre: 'fievre',
  vomissements: 'vomissements',
  diarrhee: 'diarrhee',
  convulsions: 'convulsions',
  vertiges: 'vertiges',
  ictere: 'ictere_rapporte',
};

const MODE_FEM: Record<string, string> = {
  brutal: 'brutale',
  'rapidement progressif': 'rapidement progressive',
  progressif: 'progressive',
  insidieux: 'insidieuse',
};

const EVOLUTION: Record<string, string> = {
  'aggravation progressive': 'L’évolution est marquée par une aggravation progressive',
  stabilité: 'L’évolution est marquée par une stabilité de la symptomatologie',
  'amélioration progressive': 'L’évolution est marquée par une amélioration progressive',
  'évolution fluctuante': 'L’évolution est fluctuante',
  'évolution par poussées': 'L’évolution se fait par poussées',
  'résolution complète': 'L’évolution est marquée par une résolution complète',
};

function valeur(a: SymptomEntry['a'], q: Question): string | string[] | undefined {
  const v = a[q.id];
  if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return undefined;
  return v;
}

/** Rédige la réponse à une question ; renvoie null si non renseignée ou non recherchée */
export function texteQuestion(q: Question, v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (q.type === 'yn') {
    if (v === 'oui') return q.py ?? `${minus(q.label)} : oui`;
    if (v === 'non') return q.pn || null;
    return null;
  }
  if (Array.isArray(v)) {
    const opts = q.options ?? [];
    const sorted = [...v].sort((x, y) => opts.indexOf(x) - opts.indexOf(y));
    const sans = sorted.filter((x) => x.startsWith('sans ') || x.startsWith('non '));
    const avec = sorted.filter((x) => !sans.includes(x));
    const parts: string[] = [];
    if (avec.length) parts.push(q.p ? gabarit(q.p, liste(avec)) : `${minus(q.label)} : ${liste(avec)}`);
    parts.push(...sans);
    return parts.join(', ');
  }
  if (q.type === 'date' || q.type === 'time') return null;
  if (/^aucune? /.test(v)) return v.replace(/^aucune? /, 'sans ');
  return q.p ? gabarit(q.p, v) : `${minus(q.label)} : ${v}`;
}

function nomSymptome(e: SymptomEntry, def: SymptomDef): { t: string; g: Genre; autre: boolean } {
  if (def.id === 'autre') return { t: (e.libelle || 'symptôme non précisé').trim().toLowerCase(), g: 'm', autre: true };
  return { t: def.t, g: def.g, autre: false };
}

export interface HdmCtx {
  obs: Observation;
  pt: Patient;
  written: Set<string>;
  complet: boolean;
}

/** Paragraphe(s) pour un symptôme */
export function redigerSymptome(e: SymptomEntry, h: HdmCtx, premier: boolean): string[] {
  const def = SYMPTOME_BY_ID[e.type];
  if (!def) return [];
  const { obs, pt } = h;
  const a = e.a;
  const { t, g, autre } = nomSymptome(e, def);
  const Pron = autre ? 'Ce symptôme' : pronom(g);
  const pluriel = g === 'mp' || g === 'fp';
  const out: string[] = [];
  const nrList: string[] = [];

  // Marquer le signe correspondant comme rédigé
  const signe = SYMPTOME_SIGNE[e.type];
  if (signe) h.written.add(signe);

  /* 1. Début */
  const date = typeof a.debut_date === 'string' ? a.debut_date : '';
  const heure = typeof a.debut_heure === 'string' ? a.debut_heure : '';
  const mode = typeof a.mode_debut === 'string' ? a.mode_debut : '';
  const circ = typeof a.circonstances === 'string' ? a.circonstances.trim() : '';
  const groupe = autre ? de(t) : deArticle(t, g);
  const rel = date && obs.admission.date ? delai(heure ? `${date}T${heure}` : date, obs.admission.date) : null;
  const quand = date ? `${fmtDateLong(date)}${heure ? ` à ${fmtHeure(heure)}` : ''}${rel ? ` (${rel} avant l’admission)` : ''}` : '';
  const installation = `l’installation${mode ? ` ${MODE_FEM[mode] ?? mode}` : ''}${circ ? `, ${circ},` : ''} ${groupe}`;
  if (premier) {
    if (quand) out.push(phrase(`Le début de la symptomatologie remonte au ${quand}, marqué par ${installation}`));
    else out.push(phrase(`${pt.Sujet} rapporte ${installation}`));
  } else if (quand) {
    out.push(phrase(`Depuis le ${quand.replace(/ \(.*\)$/, '')}, ${pt.sujet} présente également ${autre ? t : article(t, g)}${mode ? `, d’installation ${MODE_FEM[mode] ?? mode}` : ''}${circ ? `, ${circ}` : ''}`));
  } else {
    out.push(phrase(`Par ailleurs, ${pt.sujet} rapporte ${installation}`));
  }

  /* 2. Caractères sémiologiques */
  const caract: string[] = [];
  const facteurs: string[] = [];
  const retent: string[] = [];
  let siege = '';
  let cote = '';
  const adjs: string[] = [];
  for (const q of def.questions) {
    if (q.group === 'chrono') continue;
    const v = valeur(a, q);
    if (v === 'nr') { nrList.push(minus(q.label.replace(/^\d+\.\s*/, ''))); continue; }
    if (q.id === 'siege') { siege = texteQuestion(q, v) ?? ''; continue; }
    if (q.id === 'cote') { cote = typeof v === 'string' ? v : ''; continue; }
    if (q.adj) { const tx = texteQuestion(q, v); if (tx) adjs.push(tx); continue; }
    if (q.id === 'ttt_essayes' || q.id === 'ttt_efficacite') continue;
    const txt = texteQuestion(q, v);
    if (!txt) continue;
    if (q.group === 'facteurs') facteurs.push(txt);
    else if (q.group === 'retentissement') retent.push(txt);
    else caract.push(txt);
  }
  const ident = `${t}${adjs.length ? ` ${adjs.join(', ')}` : ''}${cote ? ` ${cote}` : ''}${siege ? ` ${siege}` : ''}`;
  if (caract.length || siege || cote || adjs.length) {
    out.push(phrase(`Il s’agit ${autre ? de(ident) : deArticle(ident, g)}${caract.length ? `, ${caract.join(', ')}` : ''}`));
  }
  if (facteurs.length) {
    const debutPart = /^(déclenché|aggravé|soulagé|favorisé)/.test(facteurs[0]);
    const verbe = pluriel ? 'sont' : 'est';
    out.push(phrase(debutPart ? `${Pron} ${verbe} ${liste(facteurs)}` : liste(facteurs)));
  }
  if (retent.length) out.push(phrase(`Retentissement : ${retent.join(', ')}`));
  const ttt = typeof a.ttt_essayes === 'string' ? a.ttt_essayes.trim() : '';
  const eff = typeof a.ttt_efficacite === 'string' ? a.ttt_efficacite : '';
  if (ttt) out.push(phrase(eff ? `Les traitements déjà essayés (${ttt}) ont été ${eff}` : `Traitements déjà essayés : ${ttt}`));

  /* 3. Profil évolutif */
  const caractere = typeof a.caractere === 'string' ? a.caractere : '';
  const freq = typeof a.frequence === 'string' ? a.frequence.trim() : '';
  const duree = typeof a.duree === 'string' ? a.duree.trim() : '';
  if (caractere) out.push(phrase(`${Pron} ${pluriel ? 'sont' : 'est'} ${autre ? caractere : accord(caractere, g)}${freq ? `, à raison de ${freq}` : ''}`));
  else if (freq) out.push(phrase(`Fréquence des épisodes : ${freq}`));
  if (duree) out.push(phrase(`Durée : ${duree}`));
  const evo = typeof a.evolution === 'string' ? a.evolution : '';
  const evoTtt = typeof a.evolution_ttt === 'string' ? a.evolution_ttt : '';
  if (evo || evoTtt) out.push(phrase(`${evo ? EVOLUTION[evo] ?? `Évolution : ${evo}` : 'Évolution'}${evoTtt ? `${evo ? ' ;' : ' :'} ${evoTtt}` : ''}`));
  const ep = a.episodes_ant;
  const epD = typeof a.episodes_detail === 'string' ? a.episodes_detail.trim() : '';
  if (ep === 'oui') out.push(phrase(`Notion d’épisodes similaires antérieurs${epD ? ` : ${epD}` : ''}`));
  else if (ep === 'non') out.push(phrase('Pas d’épisode similaire antérieur'));
  else if (ep === 'nr') nrList.push('épisodes antérieurs');
  const dn = typeof a.dernier_normal === 'string' ? a.dernier_normal.trim() : '';
  if (dn) out.push(phrase(`Dernière fois vu${pt.e} sans symptôme : ${dn}`));

  /* 4. Signes associés */
  const pres: { t: string; ha?: boolean }[] = [];
  const abs: { t: string; ha?: boolean }[] = [];
  for (const fid of def.associes) {
    const fd = FINDINGS[fid];
    if (!fd || fid === signe) continue;
    if (fd.sex && obs.identite.sexe && fd.sex !== obs.identite.sexe) continue;
    const val = obs.findings[fid];
    if (!val?.s || h.written.has(fid)) continue;
    h.written.add(fid);
    if (val.s === 'p') pres.push({ t: texteSigne(fd, val), ha: fd.ha });
    else if (val.s === 'a') abs.push({ t: fd.t, ha: fd.ha });
    else if (val.s === 'nr') nrList.push(minus(fd.label));
  }
  if (pres.length) out.push(phrase(`${Pron} s’accompagne${pluriel ? 'nt' : ''} ${listeDe(pres)}`));
  if (abs.length) out.push(phrase(`Pas ${listeDe(abs, 'ni')}`));
  if (h.complet && nrList.length) out.push(phrase(`Non recherché${nrList.length > 1 ? 's' : ''} : ${liste(nrList)}`));

  return [out.join(' ')];
}

export function redigerTraitementsAvant(obs: Observation, pt: Patient): string | null {
  const t = obs.hdm.traitementsAvant;
  if (t.s === 'a') return phrase(`Aucun traitement n’a été pris avant l’admission`);
  if (!t.entries.length) return null;
  const items = t.entries.filter((x) => x.nom.trim()).map((x) => {
    const det = [x.type, x.efficacite, x.tolerance && `tolérance : ${x.tolerance}`, x.observance && `observance : ${x.observance}`].filter(Boolean);
    return `${x.nom.trim()}${det.length ? ` (${det.join(', ')})` : ''}`;
  });
  if (!items.length) return null;
  return phrase(`Avant l’admission, ${pt.sujet} a reçu : ${items.join(' ; ')}`);
}

/** Rédaction complète de l'histoire de la maladie */
export function redigerHDM(h: HdmCtx): string[] {
  const { obs, pt } = h;
  const paras: string[] = [];
  const ordre = [...obs.hdm.symptomes].sort((x, y) => Number(y.principal) - Number(x.principal));
  ordre.forEach((e, i) => paras.push(...redigerSymptome(e, h, i === 0)));
  const tt = redigerTraitementsAvant(obs, pt);
  if (tt) paras.push(tt);
  if (obs.hdm.parcours.trim()) paras.push(phrase(obs.hdm.parcours.trim()));
  if (obs.hdm.recit.trim()) paras.push(obs.hdm.recit.trim());
  return paras.filter(Boolean).map((p) => cap(p));
}
