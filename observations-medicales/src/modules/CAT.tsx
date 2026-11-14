import { useMemo, useState } from 'react';
import type { Prescription } from '../../shared/types.ts';
import { uid } from '../../shared/defaults.ts';
import { useObs } from '../app/context.tsx';
import { Area, Card, Chips, Field, Seg, Select, Suggest, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { MEDICAMENTS } from '../knowledge/medicaments.ts';
import { VOIES } from '../knowledge/antecedents.ts';
import { coherence } from '../engine/completude.ts';
import { ModuleHeader } from './common.tsx';

const MESURES = ['Monitorage cardio-tensionnel continu', 'Surveillance rapprochée des constantes', 'Oxygénothérapie (cible SpO₂ à préciser)', 'Voie veineuse périphérique', 'Position demi-assise', 'Repos au lit', 'À jeun', 'Remplissage vasculaire', 'Antalgie adaptée', 'Prévention des escarres', 'Contention veineuse', 'Isolement (précautions complémentaires)'];
const EXAMENS = ['NFS', 'CRP', 'Ionogramme sanguin', 'Fonction rénale', 'Bilan hépatique', 'Bilan de coagulation', 'Troponine', 'D-dimères', 'Hémocultures', 'ECBU', 'Gaz du sang', 'Lactates', 'Groupe sanguin, RAI', 'ECG', 'Radiographie thoracique', 'Échographie abdominale', 'Échocardiographie', 'Scanner (préciser)', 'Avis spécialisé'];
const SURVEILLANCE = ['Pression artérielle, FC', 'Fréquence respiratoire, SpO₂', 'Température', 'Diurèse', 'Douleur (EVA)', 'État neurologique (Glasgow)', 'Glycémie capillaire', 'Poids quotidien', 'Évolution des symptômes', 'Ionogramme et créatinine', 'NFS', 'CRP', 'Bilan entrées-sorties'];
const ORIENTATIONS = ['Hospitalisation dans le service', 'Hospitalisation en médecine interne', 'Transfert dans un autre service', 'Transfert en soins intensifs / réanimation', 'Transfert inter-hospitalier', 'Retour à domicile', 'Consultation spécialisée programmée', 'Hospitalisation de jour'];

export function CAT() {
  const { data, update, readOnly } = useObs();
  const c = data.cat;
  const alertes = useMemo(() => coherence(data).filter((x) => x.module === 'cat'), [data]);
  const [libre, setLibre] = useState('');
  return (
    <div className="stack">
      <ModuleHeader title="Conduite à tenir" desc="Aucun traitement n’est proposé automatiquement. Chaque prescription est saisie et validée par le médecin ; les allergies et doublons déclarés sont contrôlés." />
      {alertes.length > 0 && <div className="col">{alertes.map((a) => <div key={a.id} className={`alert ${a.gravite === 'critique' ? 'danger' : 'warn'}`}><Icon name="alert" className="alert-ico" />{a.message}</div>)}</div>}
      <Card title="A. Mesures immédiates">
        <Chips value={c.mesures} options={[...new Set([...MESURES, ...c.mesures])]} onChange={(v) => update((d) => { d.cat.mesures = v; })} disabled={readOnly} />
        <Field label="Autres mesures / précisions" className="mt12"><Area rows={2} value={c.mesuresDetail} onChange={(v) => update((d) => { d.cat.mesuresDetail = v; })} disabled={readOnly} /></Field>
      </Card>
      <Card title="B. Traitement" actions={!readOnly && <button className="btn sm" onClick={() => update((d) => { d.cat.traitements.push({ uid: uid(), nom: '', dose: '', posologie: '', voie: '', frequence: '', duree: '', indication: '', ciVerifiees: false, surveillance: '', effets: '' }); })}><Icon name="plus" size={14} />Ajouter un traitement</button>}>
        {c.traitements.length === 0 && <p className="faint">Aucun traitement saisi.</p>}
        <div className="col">{c.traitements.map((t) => <Traitement key={t.uid} t={t} />)}</div>
      </Card>
      <Card title="C. Examens complémentaires demandés">
        <Chips value={c.examensDemandes} options={[...new Set([...EXAMENS, ...c.examensDemandes])]} onChange={(v) => update((d) => { d.cat.examensDemandes = v; })} disabled={readOnly} />
        {!readOnly && (
          <form className="row mt12" onSubmit={(e) => { e.preventDefault(); if (libre.trim()) { update((d) => { d.cat.examensDemandes.push(libre.trim()); }); setLibre(''); } }}>
            <div style={{ flex: 1 }}><Text value={libre} onChange={setLibre} placeholder="Autre examen à ajouter" aria-label="Autre examen" /></div><button className="btn" type="submit"><Icon name="plus" />Ajouter</button>
          </form>
        )}
        <Field label="Précisions" className="mt12"><Area rows={2} value={c.examensDetail} onChange={(v) => update((d) => { d.cat.examensDetail = v; })} disabled={readOnly} /></Field>
      </Card>
      <Card title="D. Surveillance clinique et biologique">
        <Chips value={c.surveillance} options={[...new Set([...SURVEILLANCE, ...c.surveillance])]} onChange={(v) => update((d) => { d.cat.surveillance = v; })} disabled={readOnly} />
        <Field label="Fréquence et précisions" className="mt12"><Area rows={2} value={c.surveillanceDetail} onChange={(v) => update((d) => { d.cat.surveillanceDetail = v; })} placeholder="ex. constantes toutes les 4 heures" disabled={readOnly} /></Field>
      </Card>
      <Card title="E. Avis spécialisés" actions={!readOnly && <button className="btn sm" onClick={() => update((d) => { d.cat.avis.push({ uid: uid(), specialite: '', motif: '', date: '', reponse: '' }); })}><Icon name="plus" size={14} />Ajouter</button>}>
        {c.avis.length === 0 && <p className="faint">Aucun avis demandé.</p>}
        <div className="col">
          {c.avis.map((a) => {
            const set = (k: string, v: string) => update((d) => { const x = d.cat.avis.find((y) => y.uid === a.uid); if (x) (x as unknown as Record<string, string>)[k] = v; });
            return (
              <div key={a.uid} className="grid g4" style={{ alignItems: 'end' }}>
                <Field label="Spécialité"><Suggest value={a.specialite} suggestions={['Cardiologie', 'Pneumologie', 'Neurologie', 'Gastro-entérologie', 'Néphrologie', 'Réanimation', 'Chirurgie viscérale', 'Infectiologie', 'Hématologie', 'Rhumatologie', 'Dermatologie', 'Psychiatrie', 'Gynécologie']} onChange={(v) => set('specialite', v)} /></Field>
                <Field label="Motif"><Text value={a.motif} onChange={(v) => set('motif', v)} disabled={readOnly} /></Field>
                <Field label="Date"><Text type="date" value={a.date} onChange={(v) => set('date', v)} disabled={readOnly} aria-label="Date de l’avis" /></Field>
                <div className="row nowrap"><Field label="Réponse"><Text value={a.reponse} onChange={(v) => set('reponse', v)} disabled={readOnly} /></Field>
                  {!readOnly && <button className="btn ghost sm icon" style={{ marginTop: 18 }} aria-label="Retirer" onClick={() => update((d) => { d.cat.avis = d.cat.avis.filter((x) => x.uid !== a.uid); })}><Icon name="trash" size={14} /></button>}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="F. Orientation">
        <Seg value={c.orientation} options={ORIENTATIONS} onChange={(v) => update((d) => { d.cat.orientation = v; })} disabled={readOnly} />
        <Field label="Précisions (service, suivi, rendez-vous)" className="mt12"><Text value={c.orientationDetail} onChange={(v) => update((d) => { d.cat.orientationDetail = v; })} disabled={readOnly} /></Field>
      </Card>
      <Card title="G. Consignes et réévaluation">
        <div className="grid g2">
          <Field label="Consignes (équipe soignante, patient)"><Area rows={3} value={c.consignes} onChange={(v) => update((d) => { d.cat.consignes = v; })} disabled={readOnly} /></Field>
          <Field label="Réévaluation prévue"><Area rows={3} value={c.reevaluation} onChange={(v) => update((d) => { d.cat.reevaluation = v; })} placeholder="ex. réévaluation clinique et biologique à H6" disabled={readOnly} /></Field>
        </div>
      </Card>
    </div>
  );
}

function Traitement({ t }: { t: Prescription }) {
  const { update, readOnly } = useObs();
  const set = (k: keyof Prescription, v: string | boolean) => update((d) => { const x = d.cat.traitements.find((y) => y.uid === t.uid); if (x) (x as unknown as Record<string, unknown>)[k] = v; });
  return (
    <div className="card flat soft" style={{ padding: 12 }}>
      <div className="grid g4">
        <Field label="Dénomination (DCI)" className="span2"><Suggest value={t.nom} suggestions={MEDICAMENTS} onChange={(v) => set('nom', v)} /></Field>
        <Field label="Dose"><Text value={t.dose} onChange={(v) => set('dose', v)} disabled={readOnly} /></Field>
        <Field label="Posologie"><Text value={t.posologie} onChange={(v) => set('posologie', v)} disabled={readOnly} /></Field>
        <Field label="Voie"><Select value={t.voie} options={VOIES} onChange={(v) => set('voie', v)} disabled={readOnly} /></Field>
        <Field label="Fréquence"><Text value={t.frequence} onChange={(v) => set('frequence', v)} disabled={readOnly} /></Field>
        <Field label="Durée"><Text value={t.duree} onChange={(v) => set('duree', v)} disabled={readOnly} /></Field>
        <Field label="Indication"><Text value={t.indication} onChange={(v) => set('indication', v)} disabled={readOnly} /></Field>
        <Field label="Surveillance" className="span2"><Text value={t.surveillance} onChange={(v) => set('surveillance', v)} disabled={readOnly} /></Field>
        <Field label="Effets indésirables à surveiller" className="span2"><Text value={t.effets} onChange={(v) => set('effets', v)} disabled={readOnly} /></Field>
      </div>
      <div className="row mt8">
        <label className="check"><input type="checkbox" checked={t.ciVerifiees} disabled={readOnly} onChange={(e) => set('ciVerifiees', e.target.checked)} /> Contre-indications, interactions et adaptation (fonction rénale, grossesse, allergies) vérifiées</label>
        <span className="spacer" />
        {!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { d.cat.traitements = d.cat.traitements.filter((x) => x.uid !== t.uid); })}><Icon name="trash" size={14} />Retirer</button>}
      </div>
    </div>
  );
}
