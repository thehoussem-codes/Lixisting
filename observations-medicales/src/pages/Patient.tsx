import { useEffect, useState } from 'react';
import type { ObservationFull, ObservationMeta, PatientIdentity, PatientSummary, TemplateContent, TemplateRecord } from '../../shared/types.ts';
import { emptyIdentity } from '../../shared/defaults.ts';
import { api, ApiError } from '../app/api.ts';
import { useSession, useToast } from '../app/context.tsx';
import { href, navigate } from '../app/router.ts';
import { Card, Confirm, Field, Modal, Seg, Select, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { ageLabel, fmtDate, fmtDateTime } from '../engine/calc.ts';
import { MODELES_INTEGRES } from '../knowledge/modeles.ts';

export function NouveauPatient({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [id, setId] = useState<PatientIdentity>(emptyIdentity());
  const [err, setErr] = useState('');
  const creer = async () => {
    try {
      const p = await api<PatientSummary>('/patients', { method: 'POST', body: { identity: id } });
      toast('Dossier créé.');
      onCreated(p.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erreur');
    }
  };
  return (
    <Modal title="Nouveau dossier patient" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!id.nom.trim() || !id.prenom.trim()} onClick={creer}>Créer le dossier</button></>}>
      <div className="grid g2">
        <Field label="Nom" required><Text value={id.nom} onChange={(v) => setId({ ...id, nom: v })} autoFocus /></Field>
        <Field label="Prénom" required><Text value={id.prenom} onChange={(v) => setId({ ...id, prenom: v })} /></Field>
        <Field label="Date de naissance" help={id.dateNaissance ? ageLabel(id.dateNaissance) : undefined}><Text type="date" value={id.dateNaissance} onChange={(v) => setId({ ...id, dateNaissance: v })} aria-label="Date de naissance" /></Field>
        <Field label="Sexe"><Seg value={id.sexe} options={[{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }]} onChange={(v) => setId({ ...id, sexe: v as PatientIdentity['sexe'] })} /></Field>
        <Field label="Identifiant (IPP)"><Text value={id.ipp} onChange={(v) => setId({ ...id, ipp: v })} /></Field>
        <Field label="Téléphone"><Text value={id.telephone} onChange={(v) => setId({ ...id, telephone: v })} /></Field>
      </div>
      {err && <div className="alert danger mt12"><Icon name="alert" className="alert-ico" />{err}</div>}
      <p className="small faint mt12">Les autres informations d’état civil se complètent dans l’observation.</p>
    </Modal>
  );
}

export function PatientPage({ id }: { id: number }) {
  const session = useSession();
  const toast = useToast();
  const [p, setP] = useState<{ patient: PatientSummary; observations: ObservationMeta[] } | null>(null);
  const [err, setErr] = useState('');
  const [nouvelle, setNouvelle] = useState(false);
  const [suppr, setSuppr] = useState<null | { type: 'patient' | 'obs'; id: number }>(null);
  const charger = () => api<{ patient: PatientSummary; observations: ObservationMeta[] }>(`/patients/${id}`).then(setP).catch((e) => setErr(e instanceof ApiError ? e.message : 'Erreur'));
  useEffect(() => { void charger(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="page"><div className="alert danger">{err}</div></div>;
  if (!p) return <div className="page"><p className="muted">Chargement…</p></div>;
  const i = p.patient.identity;
  const dupliquer = async (oid: number) => {
    const o = await api<ObservationFull>(`/observations/${oid}/duplicate`, { method: 'POST' });
    toast('Observation dupliquée (nouveau brouillon).');
    navigate(`/obs/${o.id}/identite`);
  };
  const supprimer = async () => {
    if (!suppr) return;
    try {
      if (suppr.type === 'patient') { await api(`/patients/${id}`, { method: 'DELETE' }); toast('Dossier archivé.'); navigate('/'); }
      else { await api(`/observations/${suppr.id}`, { method: 'DELETE' }); toast('Observation archivée.'); void charger(); }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur', true);
    }
    setSuppr(null);
  };
  return (
    <div className="page">
      <div className="page-h">
        <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{(i.prenom[0] ?? '') + (i.nom[0] ?? '')}</div>
        <div className="t">
          <h1>{i.nom.toUpperCase()} {i.prenom} {p.patient.fictif && <span className="badge warn">dossier fictif</span>}</h1>
          <p>{[i.sexe === 'M' ? 'Homme' : i.sexe === 'F' ? 'Femme' : '', i.dateNaissance && `né(e) le ${fmtDate(i.dateNaissance)} (${ageLabel(i.dateNaissance)})`, i.ipp && `IPP ${i.ipp}`, i.telephone].filter(Boolean).join(' · ')}</p>
        </div>
        {session.canEdit && <button className="btn primary" onClick={() => setNouvelle(true)}><Icon name="plus" />Nouvelle observation</button>}
        {(session.user.role === 'admin' || session.user.role === 'medecin') && <button className="btn danger" onClick={() => setSuppr({ type: 'patient', id })}><Icon name="trash" />Archiver le dossier</button>}
      </div>
      <Card title={`Historique des observations (${p.observations.length})`}>
        <div style={{ margin: '-14px -16px' }}>
          {p.observations.length === 0 && <div className="empty">Aucune observation pour ce patient.</div>}
          {p.observations.map((o) => (
            <div key={o.id} className="list-item obs-row" style={{ cursor: 'default' }}>
              <Icon name="doc" />
              <a className="obs-main" href={href(`/obs/${o.id}/identite`)} style={{ flex: 1, minWidth: 0, color: 'inherit' }}>
                <div><strong>{o.titre}</strong></div>
                <div className="small muted">Admission : {o.dateAdmission ? fmtDateTime(o.dateAdmission) : '—'} · Auteur : {o.auteur} · Modifiée le {new Date(o.updatedAt).toLocaleString('fr-FR')}</div>
                {o.statut === 'validee' && <div className="small" style={{ color: 'var(--ok)' }}>Validée par {o.validePar} le {o.valideLe ? new Date(o.valideLe).toLocaleString('fr-FR') : ''}</div>}
              </a>
              <span className={`badge ${o.statut === 'validee' ? 'ok' : 'warn'}`}>{o.statut === 'validee' ? 'Validée' : 'Brouillon'}</span>
              <a className="btn sm" href={href(`/obs/${o.id}/redaction`)}><Icon name="doc" size={14} />Document</a>
              {session.canEdit && <button className="btn sm" onClick={() => void dupliquer(o.id)} title="Créer une copie modifiable"><Icon name="copy" size={14} />Dupliquer</button>}
              {(session.user.role === 'admin' || session.user.role === 'medecin') && <button className="btn ghost sm icon" aria-label="Archiver l’observation" onClick={() => setSuppr({ type: 'obs', id: o.id })}><Icon name="trash" size={14} /></button>}
            </div>
          ))}
        </div>
      </Card>
      {nouvelle && <NouvelleObservation patientId={id} observations={p.observations} onClose={() => setNouvelle(false)} />}
      {suppr && <Confirm danger yes="Archiver" text={suppr.type === 'patient' ? 'Archiver ce dossier patient et toutes ses observations ? Ils n’apparaîtront plus dans les recherches (conservation en base pour traçabilité).' : 'Archiver cette observation ?'} onNo={() => setSuppr(null)} onYes={() => void supprimer()} />}
    </div>
  );
}

function NouvelleObservation({ patientId, observations, onClose }: { patientId: number; observations: ObservationMeta[]; onClose: () => void }) {
  const toast = useToast();
  const [modeles, setModeles] = useState<TemplateRecord[]>([]);
  const [modele, setModele] = useState('');
  const [reprise, setReprise] = useState(observations[0] ? String(observations[0].id) : '');
  useEffect(() => { api<TemplateRecord[]>('/templates').then(setModeles).catch(() => {}); }, []);
  const tous: { id: string; nom: string; content: TemplateContent }[] = [...MODELES_INTEGRES.map((m) => ({ id: m.id, nom: `${m.nom} (intégré)`, content: m.content })), ...modeles.map((m) => ({ id: String(m.id), nom: m.nom, content: m.content }))];
  const creer = async () => {
    try {
      const m = tous.find((x) => x.id === modele);
      const o = await api<ObservationFull>(`/patients/${patientId}/observations`, { method: 'POST', body: { reprendreDe: reprise ? Number(reprise) : undefined, modele: m?.content } });
      toast('Observation créée.');
      navigate(`/obs/${o.id}/${m ? 'hdm' : 'identite'}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur', true);
    }
  };
  return (
    <Modal title="Nouvelle observation" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" onClick={creer}>Créer</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <Field label="Modèle d’observation (facultatif)" help="Un modèle pré-structure l’observation (symptômes à analyser, scores, examens, surveillance) sans jamais pré-remplir de constatation clinique.">
          <Select value={modele} onChange={setModele} options={tous.map((m) => ({ v: m.id, l: m.nom }))} placeholder="— Observation vierge —" />
        </Field>
        {observations.length > 0 && (
          <Field label="Reprendre les antécédents d’une observation antérieure" help="Les antécédents, allergies et traitements sont copiés ; les statuts « aucune allergie » et « aucun traitement » repassent à « non vérifié » pour imposer leur revérification.">
            <Select value={reprise} onChange={setReprise} options={observations.map((o) => ({ v: String(o.id), l: `${o.titre} — ${o.dateAdmission ? fmtDate(o.dateAdmission) : ''}` }))} placeholder="— Ne pas reprendre —" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
