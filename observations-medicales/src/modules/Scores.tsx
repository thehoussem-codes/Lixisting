import { useMemo, useState } from 'react';
import { useObs, useToast } from '../app/context.tsx';
import { Area, Card, Num, Select } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { CATEGORIES_SCORES, SCORES, effectiveInputs, scoresPertinents, type ScoreDef } from '../knowledge/scores.ts';
import { buildContext, type Ctx } from '../engine/context.ts';
import { ModuleHeader } from './common.tsx';

export function Scores() {
  const { data } = useObs();
  const ctx = useMemo(() => buildContext(data), [data]);
  const pertinents = useMemo(() => scoresPertinents(ctx), [ctx]);
  const [q, setQ] = useState('');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const inclus = Object.entries(data.scores).filter(([, v]) => v.inclure).map(([k]) => k);
  const autres = SCORES.filter((s) => !pertinents.some((p) => p.def.id === s.id) && (!q || (s.nom + s.description + s.categorie).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack">
      <ModuleHeader title="Scores et classifications" desc="Seuls les scores pertinents pour la situation clinique sont proposés. Les critères connus sont pré-remplis à partir des données saisies (modifiables). L’interprétation est une aide et ne constitue pas une décision." />
      <Card title={`Suggérés pour ce patient (${pertinents.length})`} sub={inclus.length ? `${inclus.length} inclus dans l’observation` : 'Cochez « Inclure » pour faire figurer un score dans l’observation.'}>
        {pertinents.length === 0 && <p className="faint">Aucun score n’est proposé à ce stade : renseignez l’histoire de la maladie et les constantes.</p>}
        <div className="col">
          {pertinents.map(({ def, raison }) => <ScoreCard key={def.id} def={def} raison={raison} ctx={ctx} defaultOpen={!!data.scores[def.id]} />)}
        </div>
      </Card>
      <Card title="Bibliothèque des classifications et scores" actions={<input type="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} aria-label="Rechercher un score" />}>
        {CATEGORIES_SCORES.map((cat) => {
          const list = autres.filter((s) => s.categorie === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="mb8">
              <h4 className="muted mb8">{cat}</h4>
              <div className="col">
                {list.map((def) => ouverts.has(def.id) || data.scores[def.id] ? <ScoreCard key={def.id} def={def} ctx={ctx} defaultOpen /> : (
                  <button key={def.id} className="list-item card flat" style={{ textAlign: 'left', border: '1px solid var(--border)' }} onClick={() => setOuverts(new Set([...ouverts, def.id]))}>
                    <Icon name="scale" /><div style={{ flex: 1 }}><strong>{def.nom}</strong><div className="small muted">{def.description}</div></div><Icon name="chevronR" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

export function ScoreCard({ def, raison, ctx, defaultOpen }: { def: ScoreDef; raison?: string; ctx: Ctx; defaultOpen?: boolean }) {
  const { data, update, readOnly } = useObs();
  const toast = useToast();
  const [open, setOpen] = useState(!!defaultOpen);
  const val = data.scores[def.id] ?? { inputs: {}, inclure: false };
  const { inputs, preremplis } = effectiveInputs(def, val.inputs, ctx);
  const r = def.compute(inputs);
  const setInput = (k: string, v: string | undefined) => update((d) => {
    const s = (d.scores[def.id] ??= { inputs: {}, inclure: false });
    if (v === undefined || v === '') delete s.inputs[k]; else s.inputs[k] = v;
  });
  return (
    <div className="card flat" style={{ border: '1px solid var(--border)' }}>
      <div className="card-h" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h3>{def.nom}{raison && <div className="small muted" style={{ fontWeight: 400 }}>{raison}</div>}</h3>
        {r.valeur && <span className={`badge ${r.niveau === 'critique' ? 'danger' : r.niveau === 'attention' ? 'warn' : 'primary'}`}>{r.valeur}{!r.complet ? ' (partiel)' : ''}</span>}
        <label className="check small" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={val.inclure} disabled={readOnly || !r.valeur} onChange={(e) => update((d) => { const s = (d.scores[def.id] ??= { inputs: {}, inclure: false }); s.inclure = e.target.checked; })} /> Inclure
        </label>
        <Icon name={open ? 'chevronD' : 'chevronR'} />
      </div>
      {open && (
        <div className="card-b">
          <p className="small muted mb8">{def.description}</p>
          <div className="col">
            {def.items.map((it) => {
              const v = inputs[it.id];
              const pre = preremplis.has(it.id);
              return (
                <div key={it.id} className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 320px)', alignItems: 'center' }}>
                  <div className="small">{it.label}{it.type === 'check' && it.pts !== undefined && <span className="faint"> ({it.pts > 0 ? '+' : ''}{String(it.pts).replace('.', ',')})</span>} {pre && <span className="badge primary" title="Pré-rempli à partir des données saisies">auto</span>}</div>
                  {it.type === 'select' ? (
                    <Select value={v ?? ''} options={(it.options ?? []).map((o) => ({ v: o.v, l: o.label }))} onChange={(x) => setInput(it.id, x)} disabled={readOnly} aria-label={it.label} />
                  ) : it.type === 'number' ? (
                    <Num value={v ?? ''} unit={it.unit} onChange={(x) => setInput(it.id, x)} disabled={readOnly} aria-label={it.label} />
                  ) : (
                    <div className="tri" role="radiogroup" aria-label={it.label}>
                      <button type="button" className={`p ${v === '1' ? 'on' : ''}`} disabled={readOnly} onClick={() => setInput(it.id, v === '1' && !pre ? undefined : '1')}>Oui</button>
                      <button type="button" className={`a ${v === '0' ? 'on' : ''}`} disabled={readOnly} onClick={() => setInput(it.id, v === '0' && !pre ? undefined : '0')}>Non</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {r.valeur ? (
            <div className={`score-res mt12 ${r.niveau}`}>
              <span className="v">{r.valeur}</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div>{r.interpretation}</div>
                {!r.complet && <div className="small" style={{ color: 'var(--warning)' }}>Critères non renseignés (comptés 0) : {r.manquants.join(', ')}.</div>}
              </div>
              {def.id === 'glasgow' && r.complet && r.total !== null && !readOnly && (
                <button className="btn sm" onClick={() => { update((d) => { d.constantes.glasgow = String(r.total); }); toast('Score de Glasgow reporté dans les constantes.'); }}>Reporter dans les constantes</button>
              )}
            </div>
          ) : <p className="small faint mt12">Renseignez les critères pour obtenir le résultat.</p>}
          <Area rows={1} value={val.commentaire ?? ''} placeholder="Commentaire (facultatif, repris dans l’observation)" disabled={readOnly} onChange={(x) => update((d) => { const s = (d.scores[def.id] ??= { inputs: {}, inclure: false }); s.commentaire = x; })} aria-label="Commentaire du score" />
          {def.reference && <p className="small faint mt8">Référence : {def.reference}</p>}
        </div>
      )}
    </div>
  );
}
