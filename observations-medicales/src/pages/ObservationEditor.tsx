import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { FormatObs, ObservationFull } from '../../shared/types.ts';
import { api, ApiError } from '../app/api.ts';
import { ObsCtx, useSession, useToast } from '../app/context.tsx';
import { ObsStore, useObsStore } from '../app/store.ts';
import { href, navigate } from '../app/router.ts';
import { useLocal } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { bilan } from '../engine/completude.ts';
import { generate } from '../engine/generate.ts';
import { analyserAppareil } from '../engine/examen.ts';
import { ageLabel } from '../engine/calc.ts';
import { APPAREIL_BY_ID } from '../knowledge/appareils.ts';
import { DocView, MODULES, NavEtapes } from '../modules/common.tsx';
import { Identite } from '../modules/Identite.tsx';
import { Motif } from '../modules/Motif.tsx';
import { Antecedents } from '../modules/Antecedents.tsx';
import { HDM } from '../modules/HDM.tsx';
import { Examen } from '../modules/Examen.tsx';
import { Scores } from '../modules/Scores.tsx';
import { Examens } from '../modules/Examens.tsx';
import { Synthese } from '../modules/Synthese.tsx';
import { Discussion } from '../modules/Discussion.tsx';
import { CAT } from '../modules/CAT.tsx';
import { Completude } from '../modules/Completude.tsx';
import { FORMATS, Redaction } from '../modules/Redaction.tsx';
import { ValidationDialog } from '../modules/Validation.tsx';

export function ObservationEditor({ obsId, module, sub }: { obsId: number; module: string; sub?: string }) {
  const session = useSession();
  const [store, setStore] = useState<ObsStore | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setStore(null);
    api<ObservationFull>(`/observations/${obsId}`)
      .then((full) => alive && setStore(new ObsStore(full, !session.canEdit)))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : 'Chargement impossible.'));
    return () => { alive = false; };
  }, [obsId, session.canEdit]);
  if (err) return <div className="page"><div className="alert danger"><Icon name="alert" className="alert-ico" />{err}</div></div>;
  if (!store) return <div className="page"><p className="muted">Chargement de l’observation…</p></div>;
  return <Editor store={store} module={module} sub={sub} />;
}

function Editor({ store, module, sub }: { store: ObsStore; module: string; sub?: string }) {
  const st = useObsStore(store);
  const toast = useToast();
  const data = st.data;
  const deferred = useDeferredValue(data);
  const b = useMemo(() => bilan(deferred), [deferred]);
  const [preview, setPreview] = useLocal('obs-preview', typeof window !== 'undefined' ? window.innerWidth > 1100 : true);
  const [pFormat, setPFormat] = useLocal<FormatObs>('obs-preview-format', 'standard');
  const [menu, setMenu] = useState(false);
  const [valider, setValider] = useState(false);
  const id = data.identite;
  const ctxValue = useMemo(() => ({ store, data, update: store.update, readOnly: st.readOnly }), [store, data, st.readOnly]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (store.state.save !== 'saved') { void store.flush(); e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void store.flush().then((ok) => ok && toast('Enregistré.')); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', onKey); void store.flush(); };
  }, [store, toast]);
  useEffect(() => setMenu(false), [module, sub]);

  const age = ageLabel(id.dateNaissance, data.admission.date?.slice(0, 10));
  const allergies = data.atcd.allergies;
  const obsId = st.full.id;
  const mod = MODULES.some((m) => m.id === module) ? module : 'identite';
  const subId = mod === 'examen' ? sub || 'general' : undefined;

  let content: React.ReactNode;
  switch (mod) {
    case 'identite': content = <Identite />; break;
    case 'motif': content = <Motif />; break;
    case 'antecedents': content = <Antecedents />; break;
    case 'hdm': content = <HDM />; break;
    case 'examen': content = <Examen sub={subId!} obsId={obsId} />; break;
    case 'scores': content = <Scores />; break;
    case 'examens': content = <Examens />; break;
    case 'synthese': content = <Synthese obsId={obsId} />; break;
    case 'discussion': content = <Discussion />; break;
    case 'cat': content = <CAT />; break;
    case 'completude': content = <Completude obsId={obsId} />; break;
    case 'redaction': content = <Redaction />; break;
  }

  const etatApp = (appId: string): 'full' | 'part' | 'na' | '' => {
    const s = deferred.appareils[appId]?.statut;
    if (s === 'na' || s === 'nr') return 'na';
    const an = analyserAppareil(deferred, APPAREIL_BY_ID[appId], new Set(), true);
    if (!an.renseignes && !an.aDuContenu) return '';
    return an.renseignes / Math.max(1, an.total) >= 0.6 ? 'full' : 'part';
  };

  return (
    <ObsCtx.Provider value={ctxValue}>
      <div className="patient-banner">
        <button className="btn ghost icon mobile-only" onClick={() => setMenu(!menu)} aria-label="Menu des rubriques"><Icon name="menu" /></button>
        <a className="btn ghost sm desktop-only" href={href(`/patients/${st.full.patientId}`)}><Icon name="chevronL" size={14} />Dossier</a>
        <div className="avatar">{(id.prenom[0] ?? '') + (id.nom[0] ?? '')}</div>
        <div>
          <div className="pn">{id.nom.toUpperCase()} {id.prenom} {st.full.patient.fictif && <span className="badge warn">fictif</span>}</div>
          <div className="meta">
            {id.sexe && <span>{id.sexe === 'M' ? 'Homme' : 'Femme'}</span>}{age && <span>{age}</span>}{id.ipp && <span>IPP {id.ipp}</span>}
            {data.admission.service && <span>{data.admission.service}</span>}
          </div>
        </div>
        {allergies.entries.some((e) => e.agent) ? <span className="badge danger" title="Allergies déclarées"><Icon name="alert" size={12} />Allergie : {allergies.entries.filter((e) => e.agent).map((e) => e.agent).join(', ')}</span>
          : allergies.statut === 'aucune' ? <span className="badge ok">Pas d’allergie connue</span> : <span className="badge warn">Allergies non vérifiées</span>}
        <span className={`badge ${st.full.statut === 'validee' ? 'ok' : 'outline'}`}>{st.full.statut === 'validee' ? 'Validée' : 'Brouillon'}</span>
        {st.readOnly && <span className="badge"><Icon name="lock" size={12} />Lecture seule</span>}
        <span className="spacer" />
        <SaveIndicator store={store} />
        <div className="row nowrap" title="Complétude globale">
          <div className="progress desktop-only" style={{ width: 120 }}><span style={{ width: `${b.global}%` }} /></div><strong className="small">{b.global}%</strong>
        </div>
        <button className={`btn sm ${preview ? 'primary' : ''}`} onClick={() => setPreview(!preview)} title="Aperçu permanent de l’observation"><Icon name={preview ? 'eyeOff' : 'eye'} size={14} /><span className="desktop-only">Aperçu</span></button>
        {!st.readOnly && <button className="btn sm" onClick={() => setValider(true)}><Icon name="checkCircle" size={14} /><span className="desktop-only">Valider</span></button>}
      </div>
      {st.save === 'conflict' && (
        <div className="alert danger" style={{ borderRadius: 0 }}><Icon name="alert" className="alert-ico" /><div style={{ flex: 1 }}>{st.error} Choisissez la version à conserver.</div>
          <button className="btn sm" onClick={() => void store.reload()}>Recharger la version du serveur</button>
          <button className="btn sm danger" onClick={() => void store.forceSave()}>Conserver ma version</button></div>
      )}
      {(st.save === 'error' || st.save === 'offline') && (
        <div className="alert warn" style={{ borderRadius: 0 }}><Icon name="alert" className="alert-ico" /><div style={{ flex: 1 }}>{st.error}</div><button className="btn sm" onClick={store.retry}>Réessayer</button></div>
      )}
      <div className={`editor ${preview ? '' : 'no-preview'}`} style={{ height: 'calc(100% - 58px)' }}>
        <div className={`drawer-bg ${menu ? 'open' : ''}`} onClick={() => setMenu(false)} />
        <nav className={`side ${menu ? 'open' : ''}`} aria-label="Rubriques de l’observation">
          {MODULES.map((m) => {
            const pct = m.progress ? b.progression[m.progress as keyof typeof b.progression] : undefined;
            return (
              <div key={m.id}>
                <a className={`navi ${mod === m.id ? 'on' : ''}`} href={href(`/obs/${obsId}/${m.id}${m.subs ? '/general' : ''}`)}>
                  <Icon name={m.icon} size={17} /><span className="n">{m.label}</span>
                  {pct !== undefined && <span className={`pct ${pct === 100 ? 'full' : ''}`}>{pct}%</span>}
                  {m.id === 'completude' && b.manquantsIndispensables > 0 && <span className="badge danger">{b.manquantsIndispensables}</span>}
                </a>
                {m.subs && mod === m.id && m.subs.map((s) => (
                  <a key={s.id} className={`navi sub ${subId === s.id ? 'on' : ''}`} href={href(`/obs/${obsId}/${m.id}/${s.id}`)}>
                    <span className={`dot ${s.id === 'general' ? (deferred.fields.conscience && deferred.constantes.fc ? 'full' : deferred.constantes.fc || deferred.fields.conscience ? 'part' : '') : etatApp(s.id)}`} />
                    <span className="n">{s.label}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <main className="content">
          <div className="content-in">
            {content}
            <NavEtapes obsId={obsId} module={mod} sub={subId} />
          </div>
        </main>
        {preview && (
          <aside className="preview" aria-label="Aperçu de l’observation">
            <div className="preview-h">
              <strong className="small">Aperçu</strong>
              <select value={pFormat} onChange={(e) => setPFormat(e.target.value as FormatObs)} style={{ flex: 1, minHeight: 28, padding: '2px 6px' }} aria-label="Format de l’aperçu">
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.l}</option>)}
              </select>
              <button className="btn ghost sm icon" onClick={() => setPreview(false)} aria-label="Fermer l’aperçu"><Icon name="x" size={14} /></button>
            </div>
            <div style={{ padding: '10px 16px 40px' }}>
              <Apercu data={deferred} format={pFormat} />
              <button className="btn sm mt12" onClick={() => navigate(`/obs/${obsId}/redaction`)}><Icon name="edit" size={14} />Vérifier et modifier le texte</button>
            </div>
          </aside>
        )}
      </div>
      {valider && <ValidationDialog onClose={() => setValider(false)} />}
    </ObsCtx.Provider>
  );
}

function Apercu({ data, format }: { data: ObservationFull['data']; format: FormatObs }) {
  const doc = useMemo(() => generate(data, format), [data, format]);
  return <DocView doc={doc} />;
}

function SaveIndicator({ store }: { store: ObsStore }) {
  const st = useObsStore(store);
  const txt: Record<string, string> = {
    saved: st.lastSaved ? `Enregistré ${st.lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Enregistré',
    dirty: 'Modifications en attente…', saving: 'Enregistrement…', error: 'Erreur d’enregistrement', conflict: 'Conflit de version', offline: 'Hors ligne — nouvel essai',
  };
  return <span className={`savestate ${st.save}`} role="status"><span className="d" />{txt[st.save]}</span>;
}
