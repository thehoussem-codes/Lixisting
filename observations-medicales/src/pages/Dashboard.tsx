import { useEffect, useState } from 'react';
import type { ObservationMeta, PatientSummary } from '../../shared/types.ts';
import { api, ApiError } from '../app/api.ts';
import { useSession, useToast } from '../app/context.tsx';
import { href, navigate } from '../app/router.ts';
import { Card } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { ageLabel, fmtDate, fmtDateTime } from '../engine/calc.ts';
import { NouveauPatient } from './Patient.tsx';

type Recente = ObservationMeta & { patient: PatientSummary };

export function Dashboard() {
  const session = useSession();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [nouveau, setNouveau] = useState(false);
  const charger = (query = q) => api<PatientSummary[]>(`/patients?q=${encodeURIComponent(query)}`).then(setPatients).catch(() => setPatients([]));
  useEffect(() => {
    const t = setTimeout(() => void charger(q), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<Recente[]>('/observations/recentes').then(setRecentes).catch(() => {}); }, []);
  const demo = async () => {
    try {
      await api('/demo', { method: 'POST' });
      toast('Trois dossiers fictifs de démonstration ont été créés.');
      void charger('');
      api<Recente[]>('/observations/recentes').then(setRecentes).catch(() => {});
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur', true);
    }
  };
  const brouillons = recentes.filter((r) => r.statut === 'brouillon').length;
  return (
    <div className="page">
      <div className="page-h">
        <div className="t"><h1>Bonjour, {session.user.nom}</h1><p>Recherchez un patient, reprenez une observation ou créez un nouveau dossier.</p></div>
        {session.canEdit && <button className="btn primary" onClick={() => setNouveau(true)}><Icon name="plus" />Nouveau patient</button>}
      </div>
      <div className="grid g3 mb8">
        <Card><div className="kpi"><span className="small muted">Dossiers patients</span><span className="v">{patients?.length ?? '—'}</span></div></Card>
        <Card><div className="kpi"><span className="small muted">Observations récentes</span><span className="v">{recentes.length}</span></div></Card>
        <Card><div className="kpi"><span className="small muted">Brouillons à valider</span><span className="v" style={{ color: brouillons ? 'var(--warning)' : undefined }}>{brouillons}</span></div></Card>
      </div>
      <div className="grid split">
        <Card title="Patients" actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou identifiant…" style={{ maxWidth: 280 }} aria-label="Rechercher un patient" autoFocus />}>
          <div style={{ margin: '-14px -16px' }}>
            {patients === null && <div className="empty">Chargement…</div>}
            {patients?.length === 0 && (
              <div className="empty">
                {q ? 'Aucun patient ne correspond.' : 'Aucun dossier patient.'}
                {!q && session.canEdit && <div className="mt12"><button className="btn" onClick={demo}><Icon name="sparkle" />Charger des cas de démonstration fictifs</button></div>}
              </div>
            )}
            {patients?.map((p) => (
              <a key={p.id} className="list-item" href={href(`/patients/${p.id}`)}>
                <div className="avatar">{(p.identity.prenom[0] ?? '') + (p.identity.nom[0] ?? '')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><strong>{p.identity.nom.toUpperCase()} {p.identity.prenom}</strong> {p.fictif && <span className="badge warn">fictif</span>}</div>
                  <div className="small muted">{[p.identity.sexe === 'M' ? 'H' : p.identity.sexe === 'F' ? 'F' : '', p.identity.dateNaissance && `${fmtDate(p.identity.dateNaissance)} (${ageLabel(p.identity.dateNaissance)})`, p.identity.ipp && `IPP ${p.identity.ipp}`].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="small faint">{p.nbObservations} obs.</span>
                <Icon name="chevronR" />
              </a>
            ))}
          </div>
        </Card>
        <Card title="Observations récentes">
          <div style={{ margin: '-14px -16px' }}>
            {recentes.length === 0 && <div className="empty">Aucune observation.</div>}
            {recentes.map((r) => (
              <a key={r.id} className="list-item" href={href(`/obs/${r.id}/identite`)}>
                <Icon name="doc" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><strong>{r.patient.identity.nom.toUpperCase()} {r.patient.identity.prenom}</strong></div>
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titre}</div>
                  <div className="small faint">{r.dateAdmission ? fmtDateTime(r.dateAdmission) : ''}</div>
                </div>
                <span className={`badge ${r.statut === 'validee' ? 'ok' : 'warn'}`}>{r.statut === 'validee' ? 'Validée' : 'Brouillon'}</span>
              </a>
            ))}
          </div>
        </Card>
      </div>
      {nouveau && <NouveauPatient onClose={() => setNouveau(false)} onCreated={(id) => navigate(`/patients/${id}`)} />}
    </div>
  );
}
