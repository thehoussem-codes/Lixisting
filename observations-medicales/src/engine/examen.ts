/**
 * Analyse de l'examen clinique : pour chaque appareil, regroupe les signes présents, absents,
 * non recherchés, les champs normaux/anormaux et les tableaux spécialisés, puis les rédige.
 * Aucune donnée non renseignée n'est jamais rédigée comme absente ou normale.
 */
import type { FindingVal, Observation, Sexe } from '../../shared/types.ts';
import { FIELDS, FINDINGS } from '../knowledge/registry.ts';
import type { AppareilDef, BlockDef, FieldDef, FindingDef } from '../knowledge/types.ts';
import {
  APPAREIL_BY_ID, MRC_SEGMENTS, NERFS_CRANIENS, POULS_ARTERES, ROT_LISTE,
} from '../knowledge/appareils.ts';
import { article, de, feminiser, gabarit, liste, listeDe, minus, phrase } from './fr.ts';
import { num } from './calc.ts';

export const NR = '__nr';

/* ------------------------------------------------------------------ */
/* Rédaction d'un signe                                                 */
/* ------------------------------------------------------------------ */

/** Groupe nominal d'un signe présent, avec ses détails (sans article). */
export function texteSigne(def: FindingDef, val: FindingVal | undefined): string {
  const inline: string[] = [];
  const paren: string[] = [];
  for (const d of def.details ?? []) {
    const v = val?.x?.[d.id];
    if (!v) continue;
    if (d.p) inline.push(gabarit(d.p, v));
    else paren.push(`${minus(d.label)} : ${v}`);
  }
  if (val?.d) paren.push(val.d.trim());
  let s = def.t;
  if (inline.length) s += ' ' + inline.join(', ');
  if (paren.length) s += ` (${paren.join(' ; ')})`;
  return s;
}

export function avecArticle(def: FindingDef, val: FindingVal | undefined): string {
  return article(texteSigne(def, val), def.g);
}

/** Valeur d'un champ rédigée selon son gabarit */
export function texteChamp(def: FieldDef, v: string, sexe: Sexe = ''): string {
  const t = !def.p ? `${minus(def.label)} : ${v}` : gabarit(def.p, v);
  return def.accord && sexe === 'F' ? feminiser(t) : t;
}

export function champAnormal(def: FieldDef, v: string): boolean {
  if (!v || v === NR) return false;
  if (def.type === 'text' || def.type === 'number') return false;
  return !(def.nl ?? []).includes(v);
}

/* ------------------------------------------------------------------ */
/* Analyse d'un bloc                                                    */
/* ------------------------------------------------------------------ */

export interface BlocAnalyse {
  bloc: BlockDef;
  presents: { def: FindingDef; texte: string; nu: string }[];
  absents: FindingDef[];
  nonRecherches: string[];
  nonApplicables: string[];
  champs: { def: FieldDef; texte: string; anormal: boolean }[];
  speciaux: { positifs: string[]; normaux: string[]; nr: string[] };
  note: string;
  /** Éléments du bloc renseignés (y compris références partagées) */
  renseignes: number;
  total: number;
}

const REMPLACE_PAR_TABLEAU: Record<string, (o: Observation) => boolean> = {
  souffle_cardiaque: (o) => o.specials.souffles.length > 0,
  adenopathies: (o) => o.specials.adenopathies.length > 0,
  lesions_cutanees: (o) => o.specials.lesions.length > 0,
};

export function etatSigne(obs: Observation, def: FindingDef): FindingVal['s'] {
  const s = obs.identite.sexe;
  if (def.sex && s && def.sex !== s) return 'na';
  return obs.findings[def.id]?.s;
}

export function analyserBloc(obs: Observation, appId: string, bloc: BlockDef, written: Set<string>, toutEcrire = false): BlocAnalyse {
  const r: BlocAnalyse = {
    bloc, presents: [], absents: [], nonRecherches: [], nonApplicables: [], champs: [],
    speciaux: { positifs: [], normaux: [], nr: [] }, note: obs.appareils[appId]?.notes?.[bloc.id] ?? '', renseignes: 0, total: 0,
  };
  const sexe = obs.identite.sexe;
  for (const item of bloc.items) {
    if (item.kind === 'sp') {
      const sp = texteSpecial(obs, item.id);
      r.speciaux.positifs.push(...sp.positifs);
      r.speciaux.normaux.push(...sp.normaux);
      r.speciaux.nr.push(...sp.nr);
      r.total += 1;
      if (sp.positifs.length || sp.normaux.length || sp.nr.length) r.renseignes += 1;
      continue;
    }
    const id = item.id;
    const fdef = FINDINGS[id];
    const cdef = FIELDS[id];
    if (fdef) {
      if (fdef.sex && sexe && fdef.sex !== sexe) continue;
      r.total += 1;
      const val = obs.findings[id];
      if (val?.s) r.renseignes += 1;
      const ecrire = toutEcrire || (fdef.home === appId && !written.has(id));
      if (!ecrire || !val?.s) continue;
      written.add(id);
      if (val.s === 'p') {
        if (REMPLACE_PAR_TABLEAU[id]?.(obs)) continue;
        r.presents.push({ def: fdef, texte: avecArticle(fdef, val), nu: texteSigne(fdef, val) });
      } else if (val.s === 'a') r.absents.push(fdef);
      else if (val.s === 'nr') r.nonRecherches.push(minus(fdef.label));
      else if (val.s === 'na') r.nonApplicables.push(minus(fdef.label));
    } else if (cdef) {
      if (cdef.sex && sexe && cdef.sex !== sexe) continue;
      r.total += 1;
      const v = obs.fields[id] ?? '';
      if (v) r.renseignes += 1;
      const ecrire = toutEcrire || (cdef.home === appId && !written.has(id));
      if (!ecrire || !v) continue;
      written.add(id);
      if (v === NR) r.nonRecherches.push(minus(cdef.label));
      else r.champs.push({ def: cdef, texte: texteChamp(cdef, v, sexe), anormal: champAnormal(cdef, v) });
    }
  }
  return r;
}

/** Fusionne plusieurs blocs analysés en un seul (rédaction compacte du format standard). */
export function fusionnerBlocs(blocs: BlocAnalyse[], kind: 'interrogatoire' | 'examen'): BlocAnalyse {
  return {
    bloc: { id: `fusion_${kind}`, title: '', kind, items: [] },
    presents: blocs.flatMap((b) => b.presents),
    absents: blocs.flatMap((b) => b.absents),
    nonRecherches: blocs.flatMap((b) => b.nonRecherches),
    nonApplicables: blocs.flatMap((b) => b.nonApplicables),
    champs: blocs.flatMap((b) => b.champs),
    speciaux: {
      positifs: blocs.flatMap((b) => b.speciaux.positifs),
      normaux: blocs.flatMap((b) => b.speciaux.normaux),
      nr: blocs.flatMap((b) => b.speciaux.nr),
    },
    note: blocs.map((b) => b.note.trim()).filter(Boolean).join(' '),
    renseignes: blocs.reduce((s, b) => s + b.renseignes, 0),
    total: blocs.reduce((s, b) => s + b.total, 0),
  };
}

/** Phrases rédigées pour un bloc */
export function redigerBloc(a: BlocAnalyse, complet: boolean): string {
  const out: string[] = [];
  const interro = a.bloc.kind === 'interrogatoire';
  if (a.champs.length) out.push(phrase(a.champs.map((c, i) => (i > 0 && c.texte.startsWith('(') ? ' ' : i > 0 ? ', ' : '') + c.texte).join('')));
  if (a.speciaux.normaux.length || a.speciaux.positifs.length) {
    out.push(...a.speciaux.positifs.map(phrase), ...a.speciaux.normaux.map(phrase));
  }
  if (a.presents.length) {
    if (interro) out.push(phrase(`Notion ${listeDe(a.presents.map((p) => ({ t: p.nu, ha: p.def.ha })))}`));
    else out.push(phrase(`On note ${liste(a.presents.map((p) => p.texte))}`));
  }
  if (a.absents.length) {
    if (interro) out.push(phrase(`Pas ${listeDe(a.absents.map((d) => ({ t: d.t, ha: d.ha })), 'ni')}`));
    else out.push(phrase(`Absence ${listeDe(a.absents.map((d) => ({ t: d.t, ha: d.ha })))}`));
  }
  if (a.note.trim()) out.push(phrase(a.note.trim()));
  if (complet) {
    const nr = [...a.nonRecherches, ...a.speciaux.nr];
    if (nr.length) out.push(phrase(`Non recherché${nr.length > 1 ? 's' : ''} : ${liste(nr)}`));
  }
  return out.join(' ');
}

/* ------------------------------------------------------------------ */
/* Analyse d'un appareil                                                */
/* ------------------------------------------------------------------ */

export interface AppAnalyse {
  app: AppareilDef;
  blocs: BlocAnalyse[];
  renseignes: number;
  total: number;
  statut: '' | 'na' | 'nr';
  conclusion: string;
  aDuContenu: boolean;
}

export function analyserAppareil(obs: Observation, app: AppareilDef, written: Set<string>, toutEcrire = false): AppAnalyse {
  const blocs = app.blocks.map((b) => analyserBloc(obs, app.id, b, written, toutEcrire));
  const st = obs.appareils[app.id]?.statut ?? '';
  const conclusion = obs.appareils[app.id]?.conclusion ?? '';
  const renseignes = blocs.reduce((s, b) => s + b.renseignes, 0);
  const total = blocs.reduce((s, b) => s + b.total, 0);
  const aDuContenu = blocs.some((b) => b.presents.length || b.absents.length || b.champs.length || b.speciaux.positifs.length || b.speciaux.normaux.length || b.note.trim() || b.nonRecherches.length || b.speciaux.nr.length) || !!conclusion.trim();
  return { app, blocs, renseignes, total, statut: st, conclusion, aDuContenu };
}

/** Synthèse d'un appareil pour l'interface (signes positifs / négatifs pertinents) */
export function resumeAppareil(obs: Observation, appId: string): { positifs: string[]; negatifs: string[]; nr: string[]; renseignes: number; total: number } {
  const app = APPAREIL_BY_ID[appId];
  const an = analyserAppareil(obs, app, new Set(), true);
  const positifs: string[] = [];
  const negatifs: string[] = [];
  const nr: string[] = [];
  for (const b of an.blocs) {
    positifs.push(...b.presents.map((p) => texteSigne(p.def, obs.findings[p.def.id])));
    positifs.push(...b.champs.filter((c) => c.anormal).map((c) => c.texte));
    positifs.push(...b.speciaux.positifs);
    negatifs.push(...b.absents.map((d) => d.t));
    negatifs.push(...b.champs.filter((c) => !c.anormal).map((c) => c.texte));
    negatifs.push(...b.speciaux.normaux);
    nr.push(...b.nonRecherches, ...b.speciaux.nr);
  }
  return { positifs, negatifs, nr, renseignes: an.renseignes, total: an.total };
}

/* ------------------------------------------------------------------ */
/* Tableaux spécialisés                                                 */
/* ------------------------------------------------------------------ */

const ARTERE_SING: Record<string, string> = {
  carotidien: 'carotidien', radial: 'radial', humeral: 'huméral', femoral: 'fémoral', poplite: 'poplité', tibial_post: 'tibial postérieur', pedieux: 'pédieux',
};
const ARTERE_PLUR: Record<string, string> = {
  carotidien: 'carotidiens', radial: 'radiaux', humeral: 'huméraux', femoral: 'fémoraux', poplite: 'poplités', tibial_post: 'tibiaux postérieurs', pedieux: 'pédieux',
};
const COTE = { d: 'droit', g: 'gauche' } as const;

export function texteSpecial(obs: Observation, id: string): { positifs: string[]; normaux: string[]; nr: string[] } {
  const sp = obs.specials;
  const positifs: string[] = [];
  const normaux: string[] = [];
  const nr: string[] = [];
  switch (id) {
    case 'pouls': {
      const sym: string[] = [];
      for (const [k] of POULS_ARTERES) {
        const d = sp.pouls[`${k}_d`] ?? '';
        const g = sp.pouls[`${k}_g`] ?? '';
        if (d === 'perçu' && g === 'perçu') { sym.push(ARTERE_PLUR[k]); continue; }
        for (const [c, v] of [['d', d], ['g', g]] as const) {
          if (!v) continue;
          if (v === 'non recherché') nr.push(`pouls ${ARTERE_SING[k]} ${COTE[c]}`);
          else if (v === 'perçu') normaux.push(`pouls ${ARTERE_SING[k]} ${COTE[c]} perçu`);
          else positifs.push(`pouls ${ARTERE_SING[k]} ${COTE[c]} ${v}`);
        }
      }
      if (sym.length) normaux.unshift(`pouls ${liste(sym)} perçus et symétriques`);
      break;
    }
    case 'paBras': {
      const d = sp.paBras.droit.trim();
      const g = sp.paBras.gauche.trim();
      if (d || g) {
        const parts = [d && `au bras droit ${d} mmHg`, g && `au bras gauche ${g} mmHg`].filter(Boolean) as string[];
        const sd = num(d.split('/')[0]);
        const sg = num(g.split('/')[0]);
        let txt = `pression artérielle ${liste(parts)}`;
        if (sd !== null && sg !== null) {
          const diff = Math.abs(sd - sg);
          txt += ` (différence systolique de ${diff} mmHg)`;
          (diff > 20 ? positifs : normaux).push(txt);
        } else normaux.push(txt);
      }
      break;
    }
    case 'souffles':
      for (const s of sp.souffles) {
        const parts = [`souffle ${s.temps || ''}`.trim()];
        if (s.intensite) parts.push(`${s.intensite}/6`);
        if (s.foyer) parts.push(`au foyer ${s.foyer}`);
        let t = parts.join(' ');
        if (s.irradiation) t += `, irradiant ${s.irradiation}`;
        if (s.caractere) t += `, ${s.caractere}`;
        positifs.push(`${t}`);
      }
      break;
    case 'mrc': {
      const anorm: string[] = [];
      let cinq = 0;
      for (const [k, label] of MRC_SEGMENTS) {
        for (const c of ['d', 'g'] as const) {
          const v = sp.mrc[`${k}_${c}`];
          if (!v) continue;
          if (v === '5') cinq++;
          else if (v === 'NE') nr.push(`force ${minus(label)} ${COTE[c]}`);
          else anorm.push(`${minus(label)} ${COTE[c]} ${v}/5`);
        }
      }
      if (anorm.length) positifs.push(`force musculaire (échelle MRC) : ${liste(anorm)}${cinq ? ', cotée à 5/5 sur les autres segments testés' : ''}`);
      else if (cinq === 8) normaux.push('force musculaire cotée à 5/5 aux quatre membres (échelle MRC)');
      else if (cinq > 0) normaux.push(`force musculaire cotée à 5/5 sur les ${cinq} segments testés (échelle MRC)`);
      break;
    }
    case 'rot': {
      const normal: string[] = [];
      const anorm: string[] = [];
      for (const [k, label] of ROT_LISTE) {
        const d = sp.rot[`${k}_d`] ?? '';
        const g = sp.rot[`${k}_g`] ?? '';
        const nom = minus(label.replace(/\s*\(.*\)/, ''));
        if (d === 'normal' && g === 'normal') { normal.push(nom); continue; }
        if (d && d === g && d !== 'non recherché') { anorm.push(`${nom} ${d} des deux côtés`); continue; }
        for (const [c, v] of [['d', d], ['g', g]] as const) {
          if (!v) continue;
          if (v === 'non recherché') nr.push(`réflexe ${nom} ${COTE[c]}`);
          else if (v === 'normal') normal.push(`${nom} ${COTE[c]}`);
          else anorm.push(`${nom} ${COTE[c]} ${v}`);
        }
      }
      if (normal.length) normaux.push(`réflexes ostéotendineux présents et symétriques (${liste(normal)})`);
      if (anorm.length) positifs.push(`réflexes ostéotendineux : ${liste(anorm)}`);
      const bd = sp.rot.babinski_d ?? '';
      const bg = sp.rot.babinski_g ?? '';
      if (bd.startsWith('flexion') && bg.startsWith('flexion')) normaux.push('réflexes cutanés plantaires en flexion des deux côtés');
      else {
        for (const [c, v] of [['d', bd], ['g', bg]] as const) {
          if (!v) continue;
          if (v === 'non recherché') nr.push(`réflexe cutané plantaire ${COTE[c]}`);
          else if (v.startsWith('extension')) positifs.push(`signe de Babinski ${COTE[c]}`);
          else if (v.startsWith('flexion')) normaux.push(`réflexe cutané plantaire ${COTE[c]} en flexion`);
          else positifs.push(`réflexe cutané plantaire ${COTE[c]} ${v}`);
        }
      }
      break;
    }
    case 'nerfs': {
      const ok: string[] = [];
      for (const [k, label] of NERFS_CRANIENS) {
        const v = sp.nerfs[k];
        if (!v?.s) continue;
        const nom = label.split(' – ')[0].replace(/_/g, ', ');
        if (v.s === 'normal') ok.push(nom);
        else if (v.s === 'non examiné') nr.push(`nerf(s) crânien(s) ${nom}`);
        else positifs.push(`atteinte du ${nom}${v.d ? ` (${v.d})` : ''}`);
      }
      if (ok.length === NERFS_CRANIENS.length) normaux.push('examen des nerfs crâniens (II à XII) sans anomalie');
      else if (ok.length) normaux.push(`nerfs crâniens ${liste(ok)} sans anomalie`);
      break;
    }
    case 'adenopathies': {
      for (const a of sp.adenopathies) {
        let t = `adénopathie ${a.aire || ''}`.trim();
        if (a.cote) t += ` ${a.cote}`;
        const car = [a.taille && `de ${a.taille} cm`, a.consistance, a.mobilite, a.sensibilite, a.autre].filter(Boolean);
        if (car.length) t += `, ${car.join(', ')}`;
        positifs.push(t);
      }
      const aires = sp.airesExaminees.filter((x) => !sp.adenopathies.some((a) => (a.aire || '').startsWith(x.replace(/s$/, '').slice(0, 6))));
      if (aires.length) normaux.push(`aires ganglionnaires ${liste(aires)} libres`);
      break;
    }
    case 'articulations':
      for (const a of sp.articulations) {
        const det = [...a.signes, a.amplitude && `amplitude : ${a.amplitude}`, a.detail].filter(Boolean);
        positifs.push(`${a.articulation}${a.cote ? ` ${a.cote}` : ''}${det.length ? ` : ${det.join(', ')}` : ''}`);
      }
      break;
    case 'lesions':
      for (const l of sp.lesions) {
        let t = `lésion de type ${l.type || 'non précisé'}`;
        if (l.localisation) t += ` ${l.localisation.match(/^(au|à|aux|en|sur|de|du|des)\b/) ? l.localisation : `localisée : ${l.localisation}`}`;
        if (l.taille) t += ` (${l.taille})`;
        if (l.description) t += `, ${l.description}`;
        positifs.push(t);
      }
      break;
  }
  return { positifs, normaux, nr };
}

/** Champs et signes relevant de l'appareil, utiles pour les rappels (ids ↔ appareils) */
export function appareilDe(id: string): string | undefined {
  return FINDINGS[id]?.home ?? FIELDS[id]?.home;
}

export function sexeApplicable(def: { sex?: 'F' | 'M' }, sexe: Sexe): boolean {
  return !def.sex || !sexe || def.sex === sexe;
}

export { de };
