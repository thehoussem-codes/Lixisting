import type { Observation, TemplateContent } from './types.ts';

/** Un modèle ne contient que de la structure : aucune constatation clinique n'est conservée. */
export function sanitiserModele(c: unknown): TemplateContent {
  const x = (c ?? {}) as TemplateContent;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 100) : undefined);
  return {
    motif: x.motif ? { principal: String(x.motif.principal ?? ''), caractere: x.motif.caractere === 'urgent' || x.motif.caractere === 'programme' ? x.motif.caractere : '' } : undefined,
    symptomes: Array.isArray(x.symptomes) ? x.symptomes.slice(0, 10).map((s) => ({ type: String(s.type), principal: !!s.principal, libelle: String(s.libelle ?? '') })) : undefined,
    appareilsNonPertinents: arr(x.appareilsNonPertinents),
    scores: arr(x.scores),
    examensDemandes: arr(x.examensDemandes),
    surveillance: arr(x.surveillance),
    mesures: arr(x.mesures),
    differentiels: arr(x.differentiels),
    urgences: x.urgences ? String(x.urgences) : undefined,
    service: x.service ? String(x.service) : undefined,
  };
}

export function appliquerModele(data: Observation, m: TemplateContent) {
  const t = sanitiserModele(m);
  if (t.motif?.principal) data.motif.principal = t.motif.principal;
  if (t.motif?.caractere) data.motif.caractere = t.motif.caractere;
  if (t.service) data.admission.service = t.service;
  for (const s of t.symptomes ?? []) {
    data.hdm.symptomes.push({ uid: Math.random().toString(36).slice(2), type: s.type, principal: s.principal, libelle: s.libelle, a: {} });
  }
  for (const a of t.appareilsNonPertinents ?? []) data.appareils[a] = { statut: 'na', notes: {}, conclusion: '' };
  for (const s of t.scores ?? []) data.scores[s] = { inputs: {}, inclure: true };
  data.cat.examensDemandes.push(...(t.examensDemandes ?? []));
  data.cat.surveillance.push(...(t.surveillance ?? []));
  data.cat.mesures.push(...(t.mesures ?? []));
  for (const d of t.differentiels ?? []) data.discussion.differentiels.push({ uid: Math.random().toString(36).slice(2), diagnostic: d, pour: '', contre: '', examens: '' });
  if (t.urgences) data.discussion.urgences = t.urgences;
}
