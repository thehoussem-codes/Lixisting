import { useMemo, useState } from 'react';
import type { BioPanel, ECG, ExamenLibre } from '../../shared/types.ts';
import { uid } from '../../shared/defaults.ts';
import { useObs } from '../app/context.tsx';
import { Area, Card, Field, Select, Seg, Suggest, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { ANALYTES, ANALYTE_BY_ID, EXAMENS_AUTRES, PANELS, PANEL_BY_ID, bornesAffichees, statutValeur } from '../knowledge/biologie.ts';
import { buildContext } from '../engine/context.ts';
import { calculsBio } from '../engine/generate.ts';
import { fmtDate, num } from '../engine/calc.ts';
import { ModuleHeader } from './common.tsx';

export function Examens() {
  const { data, update, readOnly } = useObs();
  const [type, setType] = useState('nfs');
  const ctx = useMemo(() => buildContext(data), [data]);
  const calc = calculsBio({ obs: data, ctx });
  const ajouterPanel = () => update((d) => {
    const p = PANEL_BY_ID[type];
    d.examens.bio.push({
      uid: uid(), type, date: d.admission.date?.slice(0, 10) ?? '', interpretation: '',
      valeurs: (p?.analytes ?? []).map((a) => ({ uid: uid(), analyte: a, libelle: '', valeur: '', unite: ANALYTE_BY_ID[a].unites[0].u, refMin: '', refMax: '' })),
    });
  });
  return (
    <div className="stack">
      <ModuleHeader title="Examens complémentaires" desc="Saisie structurée avec unités et valeurs de référence (celles du laboratoire priment). Les valeurs hors normes sont signalées ; l’interprétation reste celle du médecin." />
      <Card title="Biologie" actions={!readOnly && (
        <div className="row"><Select value={type} options={PANELS.map((p) => ({ v: p.id, l: p.label }))} onChange={(v) => setType(v || 'nfs')} aria-label="Type de bilan" placeholder="Type de bilan" /><button className="btn sm primary" onClick={ajouterPanel}><Icon name="plus" size={14} />Ajouter</button></div>
      )}>
        {data.examens.bio.length === 0 && <p className="faint">Aucun bilan biologique saisi.</p>}
        <div className="col">{data.examens.bio.map((p) => <Panel key={p.uid} p={p} />)}</div>
        {calc.length > 0 && <div className="alert info mt12"><Icon name="info" className="alert-ico" /><div><strong>Calculs automatiques :</strong> {calc.join(' ; ')}.</div></div>}
      </Card>
      <ECGCard e={data.examens.ecg} />
      <Card title="Bactériologie, imagerie, endoscopie et autres explorations" actions={!readOnly && <button className="btn sm" onClick={() => update((d) => { d.examens.autres.push({ uid: uid(), categorie: 'Imagerie', type: '', region: '', date: d.admission.date?.slice(0, 10) ?? '', resultat: '', conclusion: '', interpretation: '' }); })}><Icon name="plus" size={14} />Ajouter un examen</button>}>
        {data.examens.autres.length === 0 && <p className="faint">Aucun examen saisi.</p>}
        <div className="col">{data.examens.autres.map((x) => <Autre key={x.uid} x={x} />)}</div>
      </Card>
    </div>
  );
}

function Panel({ p }: { p: BioPanel }) {
  const { data, update, readOnly } = useObs();
  const sexe = data.identite.sexe;
  const upd = (fn: (x: BioPanel) => void) => update((d) => { const x = d.examens.bio.find((y) => y.uid === p.uid); if (x) fn(x as BioPanel); });
  return (
    <div className="card flat soft" style={{ padding: 12 }}>
      <div className="row mb8">
        <strong>{PANEL_BY_ID[p.type]?.label ?? 'Bilan'}</strong>
        <input type="date" value={p.date} onChange={(e) => upd((x) => { x.date = e.target.value; })} disabled={readOnly} style={{ width: 160 }} aria-label="Date du bilan" />
        <span className="spacer" />
        {!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { d.examens.bio = d.examens.bio.filter((x) => x.uid !== p.uid); })}><Icon name="trash" size={14} />Retirer</button>}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 160 }}>Analyse</th><th style={{ width: 110 }}>Valeur</th><th style={{ width: 110 }}>Unité</th><th>Référence</th><th style={{ width: 70 }} /><th style={{ width: 36 }} /></tr></thead>
          <tbody>
            {p.valeurs.map((v) => {
              const a = ANALYTE_BY_ID[v.analyte];
              const n = num(v.valeur);
              const st = n === null ? null : statutValeur(n, v.unite, a, num(v.refMin), num(v.refMax), sexe);
              const setV = (k: string, val: string) => upd((x) => { const y = x.valeurs.find((z) => z.uid === v.uid); if (y) (y as unknown as Record<string, string>)[k] = val; });
              return (
                <tr key={v.uid} className={st === 'haut' || st === 'bas' ? `flag-${st}` : ''}>
                  <td>{a ? <>{a.label}{a.note && <span className="faint small" title={a.note}> ⓘ</span>}</> : <Suggest value={v.libelle} suggestions={ANALYTES.map((x) => x.label)} onChange={(val) => {
                    const match = ANALYTES.find((x) => x.label === val);
                    upd((x) => { const y = x.valeurs.find((z) => z.uid === v.uid); if (!y) return; if (match) { y.analyte = match.id; y.libelle = ''; y.unite = match.unites[0].u; } else y.libelle = val; });
                  }} placeholder="Analyse" ariaLabel="Analyse" />}</td>
                  <td className="val"><input type="text" inputMode="decimal" value={v.valeur} onChange={(e) => setV('valeur', e.target.value)} disabled={readOnly} aria-label={`Valeur ${a?.label ?? v.libelle}`} /></td>
                  <td>{a && a.unites.length > 1 ? <select value={v.unite} onChange={(e) => setV('unite', e.target.value)} disabled={readOnly} aria-label="Unité">{a.unites.map((u) => <option key={u.u}>{u.u}</option>)}</select> : <input type="text" value={v.unite} onChange={(e) => setV('unite', e.target.value)} disabled={readOnly || !!a} aria-label="Unité" />}</td>
                  <td>
                    <div className="row nowrap" style={{ gap: 4 }}>
                      <input type="text" value={v.refMin} onChange={(e) => setV('refMin', e.target.value)} placeholder="min" disabled={readOnly} style={{ width: 70 }} aria-label="Référence minimale" />
                      <input type="text" value={v.refMax} onChange={(e) => setV('refMax', e.target.value)} placeholder="max" disabled={readOnly} style={{ width: 70 }} aria-label="Référence maximale" />
                      {!v.refMin && !v.refMax && <span className="small faint nowrap">{bornesAffichees(a, v.unite, sexe)}</span>}
                    </div>
                  </td>
                  <td>{st === 'haut' ? <span className="badge danger">↑ élevé</span> : st === 'bas' ? <span className="badge danger">↓ bas</span> : st === 'normal' ? <span className="badge ok">N</span> : null}</td>
                  <td>{!readOnly && <button className="btn ghost sm icon" aria-label="Retirer la ligne" onClick={() => upd((x) => { x.valeurs = x.valeurs.filter((z) => z.uid !== v.uid); })}><Icon name="x" size={13} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && <button className="btn xs mt8" onClick={() => upd((x) => { x.valeurs.push({ uid: uid(), analyte: '', libelle: '', valeur: '', unite: '', refMin: '', refMax: '' }); })}><Icon name="plus" size={12} />Ligne</button>}
      <Field label="Interprétation (médecin)" className="mt8"><Area rows={2} value={p.interpretation} onChange={(v) => upd((x) => { x.interpretation = v; })} disabled={readOnly} /></Field>
    </div>
  );
}

function ECGCard({ e }: { e: ECG }) {
  const { update, readOnly } = useObs();
  const set = (k: keyof ECG, v: string) => update((d) => { (d.examens.ecg as unknown as Record<string, string>)[k] = v; });
  return (
    <Card title="Électrocardiogramme" actions={<Seg value={e.realise} options={[{ v: 'oui', l: 'Réalisé' }, { v: 'non', l: 'Non réalisé' }]} onChange={(v) => set('realise', v)} disabled={readOnly} />}>
      {e.realise === 'oui' ? (
        <div className="grid g4">
          <Field label="Date et heure"><Text type="datetime-local" value={e.date} onChange={(v) => set('date', v)} disabled={readOnly} aria-label="Date de l’ECG" /></Field>
          <Field label="Rythme"><Suggest value={e.rythme} suggestions={['sinusal régulier', 'fibrillation atriale', 'flutter atrial', 'tachycardie supraventriculaire', 'rythme électro-entraîné', 'bloc atrio-ventriculaire']} onChange={(v) => set('rythme', v)} /></Field>
          <Field label="FC (bpm)"><Text value={e.fc} onChange={(v) => set('fc', v)} disabled={readOnly} /></Field>
          <Field label="Axe"><Suggest value={e.axe} suggestions={['normal', 'gauche', 'droit', 'hyper-gauche']} onChange={(v) => set('axe', v)} /></Field>
          <Field label="PR (ms)"><Text value={e.pr} onChange={(v) => set('pr', v)} disabled={readOnly} /></Field>
          <Field label="QRS (ms)"><Text value={e.qrs} onChange={(v) => set('qrs', v)} disabled={readOnly} /></Field>
          <Field label="QTc (ms)"><Text value={e.qtc} onChange={(v) => set('qtc', v)} disabled={readOnly} /></Field>
          <Field label="Ondes T"><Text value={e.ondeT} onChange={(v) => set('ondeT', v)} disabled={readOnly} /></Field>
          <Field label="Segment ST" className="span2"><Text value={e.st} onChange={(v) => set('st', v)} placeholder="ex. sus-décalage de 2 mm en V1–V4" disabled={readOnly} /></Field>
          <Field label="Autres anomalies" className="span2"><Text value={e.autres} onChange={(v) => set('autres', v)} disabled={readOnly} /></Field>
          <Field label="Interprétation (médecin)" className="spanall"><Area rows={2} value={e.interpretation} onChange={(v) => set('interpretation', v)} disabled={readOnly} /></Field>
        </div>
      ) : <p className="muted">{e.realise === 'non' ? 'ECG non réalisé.' : 'Non renseigné.'}</p>}
    </Card>
  );
}

function Autre({ x }: { x: ExamenLibre }) {
  const { update, readOnly } = useObs();
  const set = (k: keyof ExamenLibre, v: string) => update((d) => { const y = d.examens.autres.find((z) => z.uid === x.uid); if (y) (y as unknown as Record<string, string>)[k] = v; });
  return (
    <div className="card flat soft" style={{ padding: 12 }}>
      <div className="grid g4">
        <Field label="Catégorie"><Select value={x.categorie} options={Object.keys(EXAMENS_AUTRES)} onChange={(v) => set('categorie', v)} disabled={readOnly} /></Field>
        <Field label="Examen"><Suggest value={x.type} suggestions={EXAMENS_AUTRES[x.categorie] ?? []} onChange={(v) => set('type', v)} /></Field>
        <Field label="Région / précision"><Text value={x.region} onChange={(v) => set('region', v)} disabled={readOnly} /></Field>
        <Field label="Date" help={x.date ? fmtDate(x.date) : undefined}><Text type="date" value={x.date} onChange={(v) => set('date', v)} disabled={readOnly} aria-label="Date de l’examen" /></Field>
        <Field label="Résultat / compte rendu" className="spanall"><Area rows={2} value={x.resultat} onChange={(v) => set('resultat', v)} disabled={readOnly} /></Field>
        <Field label="Conclusion" className="span2"><Text value={x.conclusion} onChange={(v) => set('conclusion', v)} disabled={readOnly} /></Field>
        <Field label="Interprétation (médecin)" className="span2"><Text value={x.interpretation} onChange={(v) => set('interpretation', v)} disabled={readOnly} /></Field>
      </div>
      {!readOnly && <div className="row mt8"><span className="spacer" /><button className="btn ghost sm" onClick={() => update((d) => { d.examens.autres = d.examens.autres.filter((z) => z.uid !== x.uid); })}><Icon name="trash" size={14} />Retirer</button></div>}
    </div>
  );
}
