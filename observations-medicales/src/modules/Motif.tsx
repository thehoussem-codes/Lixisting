import { useState } from 'react';
import { useObs } from '../app/context.tsx';
import { Area, Card, Field, Seg, Suggest, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { SYMPTOMES } from '../knowledge/symptomes.ts';
import { ageLabel } from '../engine/calc.ts';
import { liste, minus, patient } from '../engine/fr.ts';
import { ModuleHeader } from './common.tsx';

const MOTIFS = [
  ...SYMPTOMES.filter((s) => s.id !== 'autre').map((s) => s.label),
  'Altération de l’état général', 'Bilan étiologique', 'Décompensation de diabète', 'Insuffisance rénale aiguë', 'Anémie', 'Hyponatrémie', 'Chute', 'Bilan de fièvre prolongée', 'Polyarthralgies',
];

export function Motif() {
  const { data, update, readOnly } = useObs();
  const m = data.motif;
  const [ajout, setAjout] = useState('');
  const proposer = () => {
    const pt = patient(data.identite.sexe);
    const age = ageLabel(data.identite.dateNaissance, data.admission.date?.slice(0, 10));
    const motifs = [m.principal, ...m.secondaires].filter(Boolean).map(minus);
    if (!motifs.length) return;
    const qui = `${pt.sujet === 'la patiente' ? 'Patiente' : 'Patient'}${age ? ` de ${age}` : ''}`;
    const txt = `${qui} hospitalisé${pt.e}${m.caractere === 'urgent' ? ' en urgence' : m.caractere === 'programme' ? ' de façon programmée' : ''} pour ${liste(motifs)}.`;
    update((d) => { d.motif.formulation = txt; });
  };
  return (
    <div className="stack">
      <ModuleHeader title="Motif d’hospitalisation" desc="Motif principal, motifs associés et circonstances. Le motif principal oriente les rappels sémiologiques." />
      <Card title="Motif">
        <div className="grid g2">
          <Field label="Motif principal" required className="spanall"><Suggest value={m.principal} suggestions={MOTIFS} onChange={(v) => update((d) => { d.motif.principal = v; })} placeholder="ex. douleur thoracique" /></Field>
          <Field label="Motifs secondaires" className="spanall">
            <div className="chips">
              {m.secondaires.map((s, i) => (
                <span key={i} className="chip on">{s} {!readOnly && <button type="button" className="btn ghost xs" style={{ height: 18, padding: '0 3px' }} aria-label={`Retirer ${s}`} onClick={() => update((d) => { d.motif.secondaires.splice(i, 1); })}>×</button>}</span>
              ))}
            </div>
            {!readOnly && (
              <form className="row mt8" onSubmit={(e) => { e.preventDefault(); if (ajout.trim()) { update((d) => { d.motif.secondaires.push(ajout.trim()); }); setAjout(''); } }}>
                <div style={{ flex: 1 }}><Suggest value={ajout} onChange={setAjout} suggestions={MOTIFS} placeholder="Ajouter un motif secondaire" ariaLabel="Motif secondaire" /></div>
                <button className="btn" type="submit"><Icon name="plus" />Ajouter</button>
              </form>
            )}
          </Field>
          <Field label="Symptômes ayant motivé l’admission" className="spanall"><Text value={m.symptomes} onChange={(v) => update((d) => { d.motif.symptomes = v; })} disabled={readOnly} /></Field>
          <Field label="Date de début des symptômes"><Text type="date" value={m.dateDebut} onChange={(v) => update((d) => { d.motif.dateDebut = v; })} disabled={readOnly} aria-label="Date de début des symptômes" /></Field>
          <Field label="Caractère"><Seg value={m.caractere} options={[{ v: 'urgent', l: 'Urgent' }, { v: 'programme', l: 'Programmé' }]} onChange={(v) => update((d) => { d.motif.caractere = v as typeof m.caractere; })} disabled={readOnly} /></Field>
          <Field label="Circonstances de découverte" className="spanall"><Text value={m.circonstances} onChange={(v) => update((d) => { d.motif.circonstances = v; })} placeholder="ex. découverte fortuite lors d’un bilan" disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Formulation médicale synthétique" actions={!readOnly && <button className="btn sm" onClick={proposer}><Icon name="sparkle" size={14} />Proposer une formulation</button>}
        sub="Facultatif : si renseignée, elle remplace la phrase générée automatiquement.">
        <Area rows={3} value={m.formulation} onChange={(v) => update((d) => { d.motif.formulation = v; })} disabled={readOnly} aria-label="Formulation du motif" />
      </Card>
    </div>
  );
}
