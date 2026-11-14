import { useState } from 'react';
import { api, ApiError } from '../app/api.ts';
import { Field, Text } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';

function Brand() {
  return <div className="brand"><span className="logo"><Icon name="stetho" size={18} /></span><span>Observations médicales</span></div>;
}

export function Login({ onDone, verrou }: { onDone: () => void; verrou?: boolean }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/auth/login', { method: 'POST', body: { username: u, password: p } });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <div className="card-b col" style={{ gap: 14, padding: 24 }}>
          <Brand />
          <p className="muted" style={{ textAlign: 'center' }}>{verrou ? 'Session expirée après inactivité. Reconnectez-vous pour continuer : les données non enregistrées sont conservées.' : 'Rédaction structurée des observations médicales'}</p>
          <Field label="Identifiant" htmlFor="u"><Text id="u" value={u} onChange={setU} autoFocus /></Field>
          <Field label="Mot de passe" htmlFor="p"><Text id="p" type="password" value={p} onChange={setP} /></Field>
          {err && <div className="alert danger"><Icon name="alert" className="alert-ico" />{err}</div>}
          <button className="btn primary" type="submit" disabled={busy || !u || !p}><Icon name="lock" />Se connecter</button>
          <p className="small faint" style={{ textAlign: 'center' }}>Accès réservé aux professionnels de santé autorisés. Les accès sont journalisés.</p>
        </div>
      </form>
    </div>
  );
}

export function Setup({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ username: '', nom: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setErr('Les mots de passe ne correspondent pas.');
    try {
      await api('/auth/setup', { method: 'POST', body: { username: f.username, nom: f.nom, password: f.password } });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Erreur.');
    }
  };
  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <div className="card-b col" style={{ gap: 14, padding: 24 }}>
          <Brand />
          <h3 style={{ textAlign: 'center' }}>Première utilisation</h3>
          <p className="muted small">Créez le compte administrateur. Il permettra ensuite de créer les comptes des médecins, internes et utilisateurs en lecture seule.</p>
          <Field label="Identifiant"><Text value={f.username} onChange={(v) => setF({ ...f, username: v })} autoFocus /></Field>
          <Field label="Nom affiché (ex. Dr Benali)"><Text value={f.nom} onChange={(v) => setF({ ...f, nom: v })} /></Field>
          <Field label="Mot de passe" help="10 caractères minimum, lettres et chiffres."><Text type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} /></Field>
          <Field label="Confirmation"><Text type="password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} /></Field>
          {err && <div className="alert danger"><Icon name="alert" className="alert-ico" />{err}</div>}
          <button className="btn primary" type="submit" disabled={!f.username || !f.nom || !f.password}>Créer le compte administrateur</button>
        </div>
      </form>
    </div>
  );
}
