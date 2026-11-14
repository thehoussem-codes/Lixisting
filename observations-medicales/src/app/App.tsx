import { useCallback, useEffect, useState } from 'react';
import type { UserInfo } from '../../shared/types.ts';
import { api, onUnauthorized, MODE_LOCAL } from './api.ts';
import { SessionCtx, ToastProvider, applyTheme, getTheme, type Session } from './context.tsx';
import { href, useRoute } from './router.ts';
import { Icon } from '../ui/icons.tsx';
import { Modal } from '../ui/controls.tsx';
import { Login, Setup } from '../pages/Auth.tsx';
import { Dashboard } from '../pages/Dashboard.tsx';
import { PatientPage } from '../pages/Patient.tsx';
import { ObservationEditor } from '../pages/ObservationEditor.tsx';
import { Library, TermesLib } from '../pages/Library.tsx';
import { Admin, Modeles, Parametres } from '../pages/Admin.tsx';

interface Status {
  setupRequired: boolean;
  user: UserInfo | null;
  idleMinutes: number;
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [expire, setExpire] = useState(false);
  const [err, setErr] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const s = await api<Status>('/auth/status');
      setStatus(s);
      setErr(false);
      if (s.user) setExpire(false);
    } catch {
      setErr(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const off = onUnauthorized(() => setExpire(true)); return () => { off(); }; }, []);
  // Verrouillage après inactivité : vérification périodique de la session
  useEffect(() => {
    if (!status?.user) return;
    const t = setInterval(async () => {
      try {
        const s = await api<Status>('/auth/status?touch=0');
        if (!s.user) setExpire(true);
      } catch { /* hors ligne */ }
    }, 60000);
    return () => clearInterval(t);
  }, [status?.user]);

  if (err && !status) return <div className="auth"><div className="card"><div className="card-b">Serveur injoignable. Vérifiez que le serveur de l’application est démarré.</div></div></div>;
  if (!status) return null;
  if (status.setupRequired) return <ToastProvider><Setup onDone={refresh} /></ToastProvider>;
  if (!status.user) return <ToastProvider><Login onDone={refresh} /></ToastProvider>;
  const user = status.user;
  const session: Session = {
    user,
    refresh,
    logout: async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); window.location.hash = '/'; await refresh(); },
    canEdit: user.role !== 'lecture',
    canValidate: user.role === 'medecin' || user.role === 'admin',
  };
  return (
    <ToastProvider>
      <SessionCtx.Provider value={session}>
        <Shell />
        {expire && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
            <Login verrou onDone={async () => { setExpire(false); await refresh(); }} />
          </div>
        )}
      </SessionCtx.Provider>
    </ToastProvider>
  );
}

function Shell() {
  const route = useRoute();
  const [theme, setTheme] = useState(getTheme());
  const [termes, setTermes] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  return (
    <SessionCtx.Consumer>
      {(s) => s && (
        <div className="app">
          <header className="topbar">
            <a className="brand" href={href('/')}><span className="logo"><Icon name="stetho" size={17} /></span><span className="bt">Observations médicales</span></a>
            <nav className="topnav">
              <a className={!route[0] || route[0] === 'patients' || route[0] === 'obs' ? 'on' : ''} href={href('/')}>Patients</a>
              <a className={route[0] === 'bibliotheque' ? 'on' : ''} href={href('/bibliotheque')}>Bibliothèques</a>
              <a className={route[0] === 'modeles' ? 'on' : ''} href={href('/modeles')}>Modèles</a>
              {s.user.role === 'admin' && <a className={route[0] === 'admin' ? 'on' : ''} href={href('/admin')}>Administration</a>}
            </nav>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setTermes(true)} title="Insérer un terme médical dans le champ actif"><Icon name="book" size={15} /><span className="desktop-only">Termes</span></button>
            <button className="btn ghost icon sm" onClick={() => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); applyTheme(t); }} aria-label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
            <div style={{ position: 'relative' }}>
              <button className="btn ghost sm" onClick={() => setUserMenu(!userMenu)}><span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{s.user.nom.replace(/^Dr\.?\s*/i, '').slice(0, 2).toUpperCase()}</span><span className="desktop-only">{s.user.nom}</span></button>
              {userMenu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 40, width: 220, zIndex: 60 }} onMouseLeave={() => setUserMenu(false)}>
                  <div className="card-b col" style={{ gap: 4, padding: 8 }}>
                    <div className="small muted" style={{ padding: '4px 8px' }}>{s.user.username} — {s.user.role}</div>
                    <a className="navi" href={href('/bibliotheque')} onClick={() => setUserMenu(false)}><Icon name="book" />Bibliothèques</a>
                    <a className="navi" href={href('/modeles')} onClick={() => setUserMenu(false)}><Icon name="template" />Modèles</a>
                    {s.user.role === 'admin' && <a className="navi" href={href('/admin')} onClick={() => setUserMenu(false)}><Icon name="shield" />Administration</a>}
                    <a className="navi" href={href('/parametres')} onClick={() => setUserMenu(false)}><Icon name="settings" />Paramètres</a>
                    {!MODE_LOCAL && <button className="navi" onClick={() => void s.logout()}><Icon name="logout" />Se déconnecter</button>}
                  </div>
                </div>
              )}
            </div>
          </header>
          {MODE_LOCAL && <div className="demo-band">Version de démonstration : les données restent dans ce navigateur uniquement. Ne saisissez aucune donnée réelle de patient. <button className="btn xs" onClick={async () => { const { reinitialiserDemo } = await import('./localApi.ts'); reinitialiserDemo(); window.location.reload(); }}>Réinitialiser la démonstration</button></div>}
          <div className="main" style={route[0] === 'obs' ? { overflow: 'hidden' } : undefined}>
            <Route route={route} />
          </div>
          {termes && <Modal title="Bibliothèque de termes médicaux" large onClose={() => setTermes(false)}><TermesLib onInsert={() => setTermes(false)} /></Modal>}
        </div>
      )}
    </SessionCtx.Consumer>
  );
}

function Route({ route }: { route: string[] }) {
  const [a, b, c, d] = route;
  if (a === 'patients' && b) return <PatientPage id={Number(b)} />;
  if (a === 'obs' && b) return <ObservationEditor obsId={Number(b)} module={c ?? 'identite'} sub={d} />;
  if (a === 'bibliotheque') return <Library tab={b} />;
  if (a === 'modeles') return <Modeles />;
  if (a === 'admin') return <Admin />;
  if (a === 'parametres') return <Parametres />;
  return <Dashboard />;
}
