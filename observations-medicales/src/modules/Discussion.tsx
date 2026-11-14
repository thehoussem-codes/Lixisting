import { useMemo, useState } from 'react';
import { uid } from '../../shared/defaults.ts';
import { useObs } from '../app/context.tsx';
import { Area, Card, Field, Seg, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { buildContext } from '../engine/context.ts';
import { signesSynthese } from '../engine/generate.ts';
import { ModuleHeader } from './common.tsx';

export function Discussion() {
  const { data, update, readOnly } = useObs();
  const d = data.discussion;
  const ctx = useMemo(() => buildContext(data), [data]);
  const sig = useMemo(() => signesSynthese(data, ctx), [data, ctx]);
  const elements = [...sig.fonctionnelsP, ...sig.physiquesP, ...sig.champsP, ...sig.speciauxP];
  const aNePasManquer = [...new Set(ctx.symptomDefs.flatMap((s) => s.aNePasManquer))];
  const [hyp, setHyp] = useState('');
  const ajouterArg = (t: string, k: 'argumentsPour' | 'argumentsContre') => update((x) => { const cur = x.discussion[k].trim(); x.discussion[k] = cur ? `${cur.replace(/[.;]$/, '')} ; ${t}` : t; });
  return (
    <div className="stack">
      <ModuleHeader title="Discussion diagnostique" desc="Espace de réflexion médicale. L’application propose des éléments d’aide (signes documentés, diagnostics graves à évoquer) mais n’impose aucun diagnostic et ne rédige aucun argument à votre place." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', alignItems: 'start' }}>
        <div className="stack">
          <Card title="Raisonnement">
            <div className="grid g1 col">
              <Field label="Syndrome(s) clinique(s) identifié(s)"><Area rows={2} value={d.syndromes} onChange={(v) => update((x) => { x.discussion.syndromes = v; })} disabled={readOnly} /></Field>
              <Field label="Diagnostic principal envisagé"><Text value={d.diagnosticPrincipal} onChange={(v) => update((x) => { x.discussion.diagnosticPrincipal = v; })} disabled={readOnly} /></Field>
              <Field label="Arguments en faveur"><Area rows={3} value={d.argumentsPour} onChange={(v) => update((x) => { x.discussion.argumentsPour = v; })} disabled={readOnly} /></Field>
              <Field label="Arguments contre"><Area rows={2} value={d.argumentsContre} onChange={(v) => update((x) => { x.discussion.argumentsContre = v; })} disabled={readOnly} /></Field>
            </div>
          </Card>
          <Card title="Diagnostics différentiels" actions={!readOnly && <button className="btn sm" onClick={() => update((x) => { x.discussion.differentiels.push({ uid: uid(), diagnostic: '', pour: '', contre: '', examens: '' }); })}><Icon name="plus" size={14} />Ajouter</button>}>
            {d.differentiels.length === 0 && <p className="faint">Aucun diagnostic différentiel saisi.</p>}
            <div className="col">
              {d.differentiels.map((df) => {
                const set = (k: string, v: string) => update((x) => { const y = x.discussion.differentiels.find((z) => z.uid === df.uid); if (y) (y as unknown as Record<string, string>)[k] = v; });
                return (
                  <div key={df.uid} className="card flat soft" style={{ padding: 10 }}>
                    <div className="grid g2">
                      <Field label="Diagnostic" className="spanall"><Text value={df.diagnostic} onChange={(v) => set('diagnostic', v)} disabled={readOnly} /></Field>
                      <Field label="Pour"><Text value={df.pour} onChange={(v) => set('pour', v)} disabled={readOnly} /></Field>
                      <Field label="Contre"><Text value={df.contre} onChange={(v) => set('contre', v)} disabled={readOnly} /></Field>
                      <Field label="Examens pour confirmer / infirmer" className="spanall"><Text value={df.examens} onChange={(v) => set('examens', v)} disabled={readOnly} /></Field>
                    </div>
                    {!readOnly && <div className="row mt8"><span className="spacer" /><button className="btn ghost sm" onClick={() => update((x) => { x.discussion.differentiels = x.discussion.differentiels.filter((z) => z.uid !== df.uid); })}><Icon name="trash" size={14} />Retirer</button></div>}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Hypothèses diagnostiques hiérarchisées" sub="Par ordre de probabilité ; réordonnez avec les flèches.">
            <div className="col">
              {d.hypotheses.map((h, i) => (
                <div key={i} className="row nowrap">
                  <strong style={{ width: 22 }}>{i + 1}.</strong>
                  <Text value={h} onChange={(v) => update((x) => { x.discussion.hypotheses[i] = v; })} disabled={readOnly} aria-label={`Hypothèse ${i + 1}`} />
                  {!readOnly && <>
                    <button className="btn ghost sm icon" disabled={i === 0} aria-label="Monter" onClick={() => update((x) => { const a = x.discussion.hypotheses; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}><Icon name="up" size={14} /></button>
                    <button className="btn ghost sm icon" disabled={i === d.hypotheses.length - 1} aria-label="Descendre" onClick={() => update((x) => { const a = x.discussion.hypotheses; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}><Icon name="down" size={14} /></button>
                    <button className="btn ghost sm icon" aria-label="Retirer" onClick={() => update((x) => { x.discussion.hypotheses.splice(i, 1); })}><Icon name="trash" size={14} /></button>
                  </>}
                </div>
              ))}
              {!readOnly && (
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (hyp.trim()) { update((x) => { x.discussion.hypotheses.push(hyp.trim()); }); setHyp(''); } }}>
                  <div style={{ flex: 1 }}><Text value={hyp} onChange={setHyp} placeholder="Nouvelle hypothèse" aria-label="Nouvelle hypothèse" /></div>
                  <button className="btn" type="submit"><Icon name="plus" />Ajouter</button>
                </form>
              )}
            </div>
          </Card>
          <Card title="Urgences et examens">
            <div className="col">
              <Field label="Diagnostics à éliminer en urgence"><Area rows={2} value={d.urgences} onChange={(v) => update((x) => { x.discussion.urgences = v; })} disabled={readOnly} /></Field>
              <Field label="Examens nécessaires pour confirmer ou infirmer les hypothèses"><Area rows={2} value={d.examensNecessaires} onChange={(v) => update((x) => { x.discussion.examensNecessaires = v; })} disabled={readOnly} /></Field>
            </div>
          </Card>
          <Card title="Diagnostic retenu" sub="Seul le médecin valide un diagnostic.">
            <div className="col">
              <Field label="Statut"><Seg value={d.statutDiagnostic} options={[{ v: 'hypothese', l: 'Hypothèse principale' }, { v: 'retenu', l: 'Diagnostic retenu (validé)' }]} onChange={(v) => update((x) => { x.discussion.statutDiagnostic = v as typeof d.statutDiagnostic; })} disabled={readOnly} /></Field>
              <Field label="Libellé"><Text value={d.diagnosticRetenu} onChange={(v) => update((x) => { x.discussion.diagnosticRetenu = v; })} disabled={readOnly} /></Field>
              <Field label="Commentaire libre"><Area rows={2} value={d.commentaire} onChange={(v) => update((x) => { x.discussion.commentaire = v; })} disabled={readOnly} /></Field>
            </div>
          </Card>
        </div>
        <div className="stack" style={{ position: 'sticky', top: 0 }}>
          <Card title="Aide au raisonnement" sub="Éléments documentés dans ce dossier (cliquer pour les citer).">
            <h4 className="small mb8">Signes positifs documentés</h4>
            {elements.length === 0 && <p className="small faint">Aucun signe positif saisi.</p>}
            <div className="col" style={{ gap: 4 }}>
              {elements.slice(0, 40).map((e) => (
                <div key={e} className="row nowrap small" style={{ alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}>{e}</span>
                  {!readOnly && <button className="btn xs" title="Ajouter aux arguments en faveur" onClick={() => ajouterArg(e, 'argumentsPour')}>+ pour</button>}
                </div>
              ))}
            </div>
            {sig.physiquesA.length + sig.fonctionnelsA.length > 0 && (
              <>
                <h4 className="small mb8 mt12">Négatifs pertinents</h4>
                <div className="col" style={{ gap: 4 }}>
                  {[...sig.fonctionnelsA, ...sig.physiquesA].map((e) => (
                    <div key={e} className="row nowrap small"><span style={{ flex: 1 }}>absence de {e}</span>{!readOnly && <button className="btn xs" onClick={() => ajouterArg(`absence de ${e}`, 'argumentsContre')}>+ contre</button>}</div>
                  ))}
                </div>
              </>
            )}
          </Card>
          {aNePasManquer.length > 0 && (
            <Card title="Diagnostics graves à évoquer" sub="Rappel selon les symptômes analysés — à confirmer ou écarter.">
              <div className="col" style={{ gap: 4 }}>
                {aNePasManquer.map((x) => (
                  <div key={x} className="row nowrap small"><span style={{ flex: 1 }}>{x}</span>
                    {!readOnly && <button className="btn xs" onClick={() => update((y) => { const cur = y.discussion.urgences.trim(); if (!cur.includes(x)) y.discussion.urgences = cur ? `${cur.replace(/\.$/, '')}, ${x.toLowerCase()}` : x; })}>+ urgence</button>}
                    {!readOnly && <button className="btn xs" onClick={() => update((y) => { y.discussion.differentiels.push({ uid: uid(), diagnostic: x, pour: '', contre: '', examens: '' }); })}>+ différentiel</button>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
