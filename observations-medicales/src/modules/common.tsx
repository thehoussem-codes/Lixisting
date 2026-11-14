/** Éléments communs aux modules : navigation, en-têtes, rendu du document. */
import type { ReactNode } from 'react';
import { APPAREILS } from '../knowledge/appareils.ts';
import type { DocNode, DocSection, GeneratedDoc } from '../engine/doc.ts';
import { navigate } from '../app/router.ts';
import { Icon } from '../ui/icons.tsx';

export interface ModuleDef {
  id: string;
  label: string;
  icon: string;
  progress?: string;
  subs?: { id: string; label: string }[];
}

export const MODULES: ModuleDef[] = [
  { id: 'identite', label: 'État civil', icon: 'user', progress: 'identite' },
  { id: 'motif', label: 'Motif d’hospitalisation', icon: 'clipboard', progress: 'motif' },
  { id: 'antecedents', label: 'Antécédents', icon: 'history', progress: 'antecedents' },
  { id: 'hdm', label: 'Histoire de la maladie', icon: 'pulse', progress: 'hdm' },
  {
    id: 'examen', label: 'Examen clinique', icon: 'stetho', progress: 'examen',
    subs: [{ id: 'general', label: 'État général et constantes' }, ...APPAREILS.map((a) => ({ id: a.id, label: a.short }))],
  },
  { id: 'scores', label: 'Scores et classifications', icon: 'scale', progress: 'scores' },
  { id: 'examens', label: 'Examens complémentaires', icon: 'flask', progress: 'examens' },
  { id: 'synthese', label: 'Synthèse clinique', icon: 'list', progress: 'synthese' },
  { id: 'discussion', label: 'Discussion diagnostique', icon: 'brain', progress: 'discussion' },
  { id: 'cat', label: 'Conduite à tenir', icon: 'pill', progress: 'cat' },
  { id: 'completude', label: 'Contrôle de complétude', icon: 'checkCircle' },
  { id: 'redaction', label: 'Rédaction et export', icon: 'doc', progress: 'redaction' },
];

/** Ordre linéaire des étapes (pour « précédent / suivant ») */
export const ETAPES: { module: string; sub?: string; label: string }[] = MODULES.flatMap((m) =>
  m.subs ? m.subs.map((s) => ({ module: m.id, sub: s.id, label: `${m.label} — ${s.label}` })) : [{ module: m.id, label: m.label }],
);

export function ModuleHeader({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="module-h">
      <div className="t">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function NavEtapes({ obsId, module, sub }: { obsId: number; module: string; sub?: string }) {
  const i = ETAPES.findIndex((e) => e.module === module && (e.sub ?? '') === (sub ?? ''));
  const prev = i > 0 ? ETAPES[i - 1] : null;
  const next = i >= 0 && i < ETAPES.length - 1 ? ETAPES[i + 1] : null;
  const go = (e: (typeof ETAPES)[number]) => {
    navigate(`/obs/${obsId}/${e.module}${e.sub ? `/${e.sub}` : ''}`);
    document.querySelector('.content')?.scrollTo({ top: 0 });
  };
  return (
    <div className="module-nav">
      {prev ? <button className="btn" onClick={() => go(prev)}><Icon name="chevronL" />{prev.label}</button> : <span />}
      {next && <button className="btn primary" onClick={() => go(next)}>{next.label}<Icon name="chevronR" /></button>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rendu du document                                                    */
/* ------------------------------------------------------------------ */

export function DocNodeView({ n }: { n: DocNode }) {
  if (n.t === 'p') {
    const vide = /non renseigné|non rédigée|non examiné|Aucun examen complémentaire/.test(n.text) && n.text.length < 70;
    return <p className={vide ? 'vide' : ''}>{n.label && <span className="lb">{n.label} : </span>}{n.text}</p>;
  }
  if (n.t === 'ul') return <ul>{n.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return (
    <>
      {n.caption && <div className="cap">{n.caption}</div>}
      <table>
        <thead><tr>{n.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{n.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}

export function SectionView({ s }: { s: DocSection }) {
  const H = s.level === 1 ? 'h1' : 'h2';
  return (
    <section>
      <H>{s.title}</H>
      {s.nodes.map((n, i) => <DocNodeView key={i} n={n} />)}
    </section>
  );
}

export function DocView({ doc, entete }: { doc: GeneratedDoc; entete?: ReactNode }) {
  return (
    <div className="doc">
      {entete}
      <div className="doc-title">{doc.titre.toUpperCase()}</div>
      {doc.sections.map((s) => <SectionView key={s.id} s={s} />)}
    </div>
  );
}
