import { useEffect, useState } from 'react';
import type { Preferences, Role, TemplateContent, TemplateRecord, UserInfo } from '../../shared/types.ts';
import { api, ApiError, MODE_LOCAL } from '../app/api.ts';
import { applyTheme, getTheme, useSession, useToast } from '../app/context.tsx';
import { Area, Card, Chips, Confirm, Field, Modal, Seg, Select, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { SYMPTOMES } from '../knowledge/symptomes.ts';
import { APPAREILS } from '../knowledge/appareils.ts';
import { SCORES } from '../knowledge/scores.ts';
import { MODELES_INTEGRES } from '../knowledge/modeles.ts';

const ROLES: { v: Role; l: string; d: string }[] = [
  { v: 'admin', l: 'Administrateur', d: 'Gestion des comptes et du journal d’audit, accès clinique complet.' },
  { v: 'medecin', l: 'Médecin', d: 'Création, modification et validation finale des observations.' },
  { v: 'interne', l: 'Interne / étudiant', d: 'Création et modification ; la validation finale nécessite un médecin.' },
  { v: 'lecture', l: 'Lecture seule', d: 'Consultation uniquement.' },
];

/* ------------------------------------------------------------------ */
/* Administration                                                       */
/* ------------------------------------------------------------------ */
export function Admin() {
  const toast = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState('users');
  const [nouveau, setNouveau] = useState(false);
  const [reset, setReset] = useState<UserInfo | null>(null);
  const charger = () => {
    api<UserInfo[]>('/users').then(setUsers).catch(() => {});
    api<Record<string, unknown>[]>('/audit').then(setAudit).catch(() => {});
  };
  useEffect(charger, []);
  const patch = async (u: UserInfo, body: Record<string, unknown>) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body }); toast('Compte mis à jour.'); charger(); } catch (e) { toast(e instanceof ApiError ? e.message : 'Erreur', true); }
  };
  return (
    <div className="page">
      <div className="page-h"><div className="t"><h1>Administration</h1><p>Comptes, rôles et traçabilité des accès aux données de santé.</p></div>{tab === 'users' && <button className="btn primary" onClick={() => setNouveau(true)}><Icon name="plus" />Nouveau compte</button>}</div>
      <div className="tabs"><button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Utilisateurs</button><button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Journal d’audit</button></div>
      {tab === 'users' ? (
        <Card>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th /></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td>{u.nom}</td><td className="mono">{u.username}</td>
                <td><Select value={u.role} options={ROLES.map((r) => ({ v: r.v, l: r.l }))} onChange={(v) => v && void patch(u, { role: v })} aria-label="Rôle" /></td>
                <td>{u.actif ? <span className="badge ok">actif</span> : <span className="badge">désactivé</span>}</td>
                <td className="small">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('fr-FR') : '—'}</td>
                <td className="nowrap"><button className="btn xs" onClick={() => void patch(u, { actif: !u.actif })}>{u.actif ? 'Désactiver' : 'Réactiver'}</button> <button className="btn xs" onClick={() => setReset(u)}>Mot de passe</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="small muted mt12">{ROLES.map((r) => <div key={r.v}><strong>{r.l}</strong> : {r.d}</div>)}</div>
        </Card>
      ) : (
        <Card sub="300 derniers événements. Aucune donnée médicale n’est inscrite dans le journal.">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Cible</th><th>IP</th></tr></thead>
            <tbody>{audit.map((a) => <tr key={String(a.id)}><td className="small nowrap">{new Date(String(a.at)).toLocaleString('fr-FR')}</td><td>{String(a.username ?? '—')}</td><td>{String(a.action).replace(/_/g, ' ')}</td><td className="small">{String(a.target ?? '')}</td><td className="small mono">{String(a.ip ?? '')}</td></tr>)}</tbody>
          </table></div>
        </Card>
      )}
      {nouveau && <NouveauCompte onClose={() => setNouveau(false)} onDone={() => { setNouveau(false); charger(); }} />}
      {reset && <ResetMdp u={reset} onClose={() => setReset(null)} onDone={(pw) => { void patch(reset, { password: pw }); setReset(null); }} />}
    </div>
  );
}

function NouveauCompte({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ username: '', nom: '', role: 'medecin' as Role, password: '' });
  const [err, setErr] = useState('');
  const creer = async () => {
    try { await api('/users', { method: 'POST', body: f }); onDone(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Erreur'); }
  };
  return (
    <Modal title="Nouveau compte" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" onClick={creer}>Créer</button></>}>
      <div className="grid g2">
        <Field label="Identifiant"><Text value={f.username} onChange={(v) => setF({ ...f, username: v })} /></Field>
        <Field label="Nom affiché"><Text value={f.nom} onChange={(v) => setF({ ...f, nom: v })} /></Field>
        <Field label="Rôle" className="spanall"><Seg value={f.role} options={ROLES.map((r) => ({ v: r.v, l: r.l }))} onChange={(v) => setF({ ...f, role: (v || 'medecin') as Role })} /></Field>
        <Field label="Mot de passe initial" help="10 caractères minimum, lettres et chiffres." className="spanall"><Text type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} /></Field>
      </div>
      {err && <div className="alert danger mt12">{err}</div>}
    </Modal>
  );
}

function ResetMdp({ u, onClose, onDone }: { u: UserInfo; onClose: () => void; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <Modal title={`Nouveau mot de passe — ${u.nom}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={pw.length < 10} onClick={() => onDone(pw)}>Enregistrer</button></>}>
      <Field label="Mot de passe" help="Les sessions ouvertes de ce compte seront fermées."><Text type="password" value={pw} onChange={setPw} /></Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Paramètres                                                           */
/* ------------------------------------------------------------------ */
export function Parametres() {
  const toast = useToast();
  const session = useSession();
  const [prefs, setPrefs] = useState<Preferences>({ etablissement: '', service: '', enTete: '', signature: '' });
  const [theme, setTheme] = useState(getTheme());
  const [pw, setPw] = useState({ ancien: '', nouveau: '', confirm: '' });
  useEffect(() => { api<Preferences>('/preferences').then(setPrefs).catch(() => {}); }, []);
  const save = async () => { await api('/preferences', { method: 'PUT', body: prefs }); await session.refresh(); toast('Préférences enregistrées.'); };
  const changerMdp = async () => {
    if (pw.nouveau !== pw.confirm) return toast('Les mots de passe ne correspondent pas.', true);
    try { await api('/auth/password', { method: 'POST', body: { ancien: pw.ancien, nouveau: pw.nouveau } }); toast('Mot de passe modifié.'); setPw({ ancien: '', nouveau: '', confirm: '' }); } catch (e) { toast(e instanceof ApiError ? e.message : 'Erreur', true); }
  };
  return (
    <div className="page">
      <div className="page-h"><div className="t"><h1>Paramètres</h1><p>{MODE_LOCAL ? `Connecté en tant que ${session.user.nom}.` : `Compte : ${session.user.nom} (${session.user.username}) — rôle ${session.user.role}.`}</p></div></div>
      <div className="stack">
        {MODE_LOCAL && (
          <Card title="Votre nom" actions={<button className="btn primary sm" onClick={save}>Enregistrer</button>}>
            <Field label="Nom du médecin" help="Affiché en haut de l’écran, utilisé comme médecin responsable des observations et pour la validation.">
              <Text value={prefs.nom ?? ''} onChange={(v) => setPrefs({ ...prefs, nom: v })} placeholder="ex. Dr ARAR" />
            </Field>
          </Card>
        )}
        <Card title="Apparence">
          <Seg value={theme} options={[{ v: 'light', l: 'Mode clair' }, { v: 'dark', l: 'Mode sombre' }]} onChange={(v) => { const t = (v || 'light') as 'light' | 'dark'; setTheme(t); applyTheme(t); }} />
        </Card>
        <Card title="En-tête et signature des documents exportés" actions={<button className="btn primary sm" onClick={save}>Enregistrer</button>}>
          <div className="grid g2">
            <Field label="Établissement"><Text value={prefs.etablissement} onChange={(v) => setPrefs({ ...prefs, etablissement: v })} placeholder="ex. CHU …" /></Field>
            <Field label="Service"><Text value={prefs.service} onChange={(v) => setPrefs({ ...prefs, service: v })} /></Field>
            <Field label="Lignes d’en-tête supplémentaires" className="spanall"><Area rows={2} value={prefs.enTete} onChange={(v) => setPrefs({ ...prefs, enTete: v })} placeholder="Chef de service, téléphone, adresse…" /></Field>
            <Field label="Signature" className="spanall"><Text value={prefs.signature} onChange={(v) => setPrefs({ ...prefs, signature: v })} /></Field>
          </div>
        </Card>
        {!MODE_LOCAL && <Card title="Mot de passe">
          <div className="grid g3">
            <Field label="Mot de passe actuel"><Text type="password" value={pw.ancien} onChange={(v) => setPw({ ...pw, ancien: v })} /></Field>
            <Field label="Nouveau mot de passe"><Text type="password" value={pw.nouveau} onChange={(v) => setPw({ ...pw, nouveau: v })} /></Field>
            <Field label="Confirmation"><Text type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} /></Field>
          </div>
          <button className="btn mt12" onClick={changerMdp} disabled={!pw.ancien || pw.nouveau.length < 10}>Modifier le mot de passe</button>
        </Card>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modèles                                                              */
/* ------------------------------------------------------------------ */
export function Modeles() {
  const toast = useToast();
  const session = useSession();
  const [list, setList] = useState<TemplateRecord[]>([]);
  const [edit, setEdit] = useState(false);
  const [suppr, setSuppr] = useState<TemplateRecord | null>(null);
  const charger = () => api<TemplateRecord[]>('/templates').then(setList).catch(() => {});
  useEffect(() => { void charger(); }, []);
  const resume = (c: TemplateContent) => [
    c.motif?.principal && `Motif : ${c.motif.principal}`,
    c.symptomes?.length && `Symptômes : ${c.symptomes.map((s) => SYMPTOMES.find((x) => x.id === s.type)?.label ?? s.libelle).join(', ')}`,
    c.scores?.length && `Scores : ${c.scores.map((s) => SCORES.find((x) => x.id === s)?.nom ?? s).join(', ')}`,
    c.examensDemandes?.length && `${c.examensDemandes.length} examens`,
    c.surveillance?.length && `${c.surveillance.length} éléments de surveillance`,
  ].filter(Boolean).join(' · ');
  return (
    <div className="page">
      <div className="page-h"><div className="t"><h1>Modèles d’observations</h1><p>Un modèle pré-structure une observation (symptômes à analyser, scores, examens, surveillance) sans jamais pré-remplir de constatation clinique.</p></div>{session.canEdit && <button className="btn primary" onClick={() => setEdit(true)}><Icon name="plus" />Nouveau modèle</button>}</div>
      <Card title="Modèles intégrés">
        <div className="col">{MODELES_INTEGRES.map((m) => <div key={m.id}><strong>{m.nom}</strong><div className="small muted">{m.description}</div><div className="small faint">{resume(m.content)}</div></div>)}</div>
      </Card>
      <Card title={`Modèles personnalisés (${list.length})`}>
        {list.length === 0 && <p className="faint">Aucun modèle personnalisé.</p>}
        <div className="col">{list.map((m) => (
          <div key={m.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}><strong>{m.nom}</strong> {m.partage && <span className="badge primary">partagé</span>}<div className="small muted">{m.description}</div><div className="small faint">{resume(m.content)} — par {m.auteur}</div></div>
            {(m.ownerId === session.user.id || session.user.role === 'admin') && <button className="btn ghost sm icon" aria-label="Supprimer" onClick={() => setSuppr(m)}><Icon name="trash" size={14} /></button>}
          </div>
        ))}</div>
      </Card>
      {edit && <EditeurModele onClose={() => setEdit(false)} onDone={() => { setEdit(false); void charger(); toast('Modèle enregistré.'); }} />}
      {suppr && <Confirm danger text={`Supprimer le modèle « ${suppr.nom} » ?`} yes="Supprimer" onNo={() => setSuppr(null)} onYes={async () => { await api(`/templates/${suppr.id}`, { method: 'DELETE' }); setSuppr(null); void charger(); }} />}
    </div>
  );
}

export function EditeurModele({ onClose, onDone, initial }: { onClose: () => void; onDone: () => void; initial?: TemplateContent }) {
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [partage, setPartage] = useState(false);
  const [c, setC] = useState<TemplateContent>(initial ?? {});
  const [err, setErr] = useState('');
  const lignes = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const enregistrer = async () => {
    try { await api('/templates', { method: 'POST', body: { nom, description, partage, content: c } }); onDone(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Erreur'); }
  };
  return (
    <Modal title="Modèle d’observation" large onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!nom.trim()} onClick={enregistrer}>Enregistrer</button></>}>
      <div className="grid g2">
        <Field label="Nom du modèle"><Text value={nom} onChange={setNom} autoFocus /></Field>
        <Field label="Partage"><label className="check"><input type="checkbox" checked={partage} onChange={(e) => setPartage(e.target.checked)} />Partager avec les autres utilisateurs</label></Field>
        <Field label="Description" className="spanall"><Text value={description} onChange={setDescription} /></Field>
        <Field label="Motif principal"><Text value={c.motif?.principal ?? ''} onChange={(v) => setC({ ...c, motif: { ...(c.motif ?? {}), principal: v } })} /></Field>
        <Field label="Service"><Text value={c.service ?? ''} onChange={(v) => setC({ ...c, service: v })} /></Field>
        <Field label="Symptômes à analyser (le premier est principal)" className="spanall">
          <Chips value={(c.symptomes ?? []).map((s) => s.type)} options={SYMPTOMES.filter((s) => s.id !== 'autre').map((s) => s.id)} onChange={(v) => setC({ ...c, symptomes: v.map((t, i) => ({ type: t, principal: i === 0, libelle: '' })) })} />
          <div className="small faint">{(c.symptomes ?? []).map((s) => SYMPTOMES.find((x) => x.id === s.type)?.label).join(' · ')}</div>
        </Field>
        <Field label="Appareils non pertinents" className="spanall"><Chips value={c.appareilsNonPertinents ?? []} options={APPAREILS.map((a) => a.id)} onChange={(v) => setC({ ...c, appareilsNonPertinents: v })} /></Field>
        <Field label="Scores à inclure" className="spanall"><Select value="" options={SCORES.map((s) => ({ v: s.id, l: s.nom }))} onChange={(v) => v && setC({ ...c, scores: [...new Set([...(c.scores ?? []), v])] })} placeholder="Ajouter un score…" /><div className="small">{(c.scores ?? []).map((s) => SCORES.find((x) => x.id === s)?.nom).join(' · ')}</div></Field>
        <Field label="Examens demandés (un par ligne)"><Area rows={4} value={(c.examensDemandes ?? []).join('\n')} onChange={(v) => setC({ ...c, examensDemandes: lignes(v) })} /></Field>
        <Field label="Surveillance (un élément par ligne)"><Area rows={4} value={(c.surveillance ?? []).join('\n')} onChange={(v) => setC({ ...c, surveillance: lignes(v) })} /></Field>
        <Field label="Mesures immédiates (une par ligne)"><Area rows={3} value={(c.mesures ?? []).join('\n')} onChange={(v) => setC({ ...c, mesures: lignes(v) })} /></Field>
        <Field label="Diagnostics différentiels à discuter (un par ligne)"><Area rows={3} value={(c.differentiels ?? []).join('\n')} onChange={(v) => setC({ ...c, differentiels: lignes(v) })} /></Field>
      </div>
      {err && <div className="alert danger mt12">{err}</div>}
    </Modal>
  );
}
