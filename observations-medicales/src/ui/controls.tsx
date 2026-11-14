/** Composants de formulaire réutilisables. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { FState, YN } from '../../shared/types.ts';
import { Icon } from './icons.tsx';

export function Hint({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <button type="button" className="hint" aria-label={`Aide : ${text}`} tabIndex={0}>
      ?<span className="tip" role="tooltip">{text}</span>
    </button>
  );
}

export function Field({ label, children, hint, help, required, className, htmlFor }: { label?: ReactNode; children: ReactNode; hint?: string; help?: ReactNode; required?: boolean; className?: string; htmlFor?: string }) {
  return (
    <div className={`field ${className ?? ''}`}>
      {label !== undefined && (
        <label className="lbl" htmlFor={htmlFor}>
          {label}
          {required && <span className="req" aria-hidden>*</span>}
          <Hint text={hint} />
        </label>
      )}
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

type InputProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  list?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
};

export function Text({ value, onChange, type = 'text', ...p }: InputProps & { type?: string }) {
  return <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />;
}

export function Area({ value, onChange, rows = 3, ...p }: InputProps & { rows?: number }) {
  return <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />;
}

export function Num({ value, onChange, min, max, step, unit, className, ...p }: InputProps & { min?: number; max?: number; step?: string; unit?: string }) {
  const n = value === '' || value === undefined ? null : Number(String(value).replace(',', '.'));
  const invalid = n !== null && (Number.isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max));
  return (
    <div className="row nowrap" style={{ gap: 6 }}>
      <input
        type="text"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,\-/<>]/g, ''))}
        className={`${className ?? ''} ${invalid ? 'invalid' : ''}`}
        aria-invalid={invalid}
        title={invalid ? `Valeur attendue entre ${min} et ${max}` : undefined}
        step={step}
        {...p}
      />
      {unit && <span className="faint small nowrap">{unit}</span>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder = '— Choisir —', disabled, id, className, 'aria-label': al }: { value: string; onChange: (v: string) => void; options: (string | { v: string; l: string })[]; placeholder?: string; disabled?: boolean; id?: string; className?: string; 'aria-label'?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} id={id} className={className} aria-label={al}>
      <option value="">{placeholder}</option>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>))}
    </select>
  );
}

/** Choix unique sous forme de pastilles (re-cliquer désélectionne). */
export function Seg({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: (string | { v: string; l: string })[]; disabled?: boolean }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        return (
          <button type="button" key={v} role="radio" aria-checked={value === v} className={`chip ${value === v ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(value === v ? '' : v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** Choix multiples. */
export function Chips({ value, onChange, options, disabled }: { value: string[]; onChange: (v: string[]) => void; options: string[]; disabled?: boolean }) {
  const set = new Set(value ?? []);
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} aria-pressed={set.has(o)} className={`chip ${set.has(o) ? 'on' : ''}`} disabled={disabled}
          onClick={() => {
            const n = new Set(set);
            if (n.has(o)) n.delete(o);
            else {
              n.add(o);
              // « sans … » exclut les autres choix et réciproquement
              if (/^(sans|aucun|non) /.test(o)) [...n].forEach((x) => x !== o && n.delete(x));
              else [...n].forEach((x) => /^(sans|aucun|non) /.test(x) && n.delete(x));
            }
            onChange(options.filter((x) => n.has(x)));
          }}>
          {o}
        </button>
      ))}
    </div>
  );
}

const ETATS: { v: FState; l: string; t: string }[] = [
  { v: 'p', l: 'Présent', t: 'Présent' },
  { v: 'a', l: 'Absent', t: 'Absent après recherche' },
  { v: 'nr', l: 'NR', t: 'Non recherché' },
  { v: 'na', l: 'NA', t: 'Non applicable' },
];

/** État d'un signe : présent / absent après recherche / non recherché / non applicable. Non sélectionné = non renseigné. */
export function Tri({ value, onChange, disabled, label, compact }: { value?: FState; onChange: (v: FState | undefined) => void; disabled?: boolean; label: string; compact?: boolean }) {
  return (
    <div className="tri" role="radiogroup" aria-label={label}>
      {ETATS.filter((e) => !compact || e.v !== 'na').map((e) => (
        <button type="button" key={e.v} title={e.t} role="radio" aria-checked={value === e.v} aria-label={`${label} : ${e.t}`} className={`${e.v} ${value === e.v ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(value === e.v ? undefined : e.v)}>
          {e.l}
        </button>
      ))}
    </div>
  );
}

/** Réponse oui / non / non recherché. */
export function YNInput({ value, onChange, disabled, label }: { value?: YN | string; onChange: (v: YN | undefined) => void; disabled?: boolean; label: string }) {
  const opts: { v: YN; l: string; c: string }[] = [
    { v: 'oui', l: 'Oui', c: 'p' },
    { v: 'non', l: 'Non', c: 'a' },
    { v: 'nr', l: 'NR', c: 'nr' },
  ];
  return (
    <div className="tri" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button type="button" key={o.v} role="radio" aria-checked={value === o.v} title={o.v === 'nr' ? 'Non recherché' : o.l} className={`${o.c} ${value === o.v ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(value === o.v ? undefined : o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, children, actions, className, sub, id }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; sub?: ReactNode; id?: string }) {
  return (
    <section className={`card ${className ?? ''}`} id={id}>
      {(title || actions) && (
        <div className="card-h">
          <h3>{title}{sub && <div className="small muted" style={{ fontWeight: 400, marginTop: 2 }}>{sub}</div>}</h3>
          {actions}
        </div>
      )}
      <div className="card-b">{children}</div>
    </section>
  );
}

export function Modal({ title, children, onClose, footer, large }: { title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode; large?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${large ? 'lg' : ''}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/** Saisie avec liste de suggestions. */
export function Suggest({ value, onChange, suggestions, placeholder, id, ariaLabel }: { value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string; id?: string; ariaLabel?: string }) {
  const listId = useId();
  return (
    <>
      <input type="text" id={id} list={listId} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

export function Confirm({ text, onYes, onNo, yes = 'Confirmer', danger }: { text: ReactNode; onYes: () => void; onNo: () => void; yes?: string; danger?: boolean }) {
  return (
    <Modal title="Confirmation" onClose={onNo} footer={<><button className="btn" onClick={onNo}>Annuler</button><button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onYes}>{yes}</button></>}>
      {text}
    </Modal>
  );
}

export function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? init : (JSON.parse(s) as T);
    } catch {
      return init;
    }
  });
  return [v, (x: T) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* ignoré */ } }];
}
