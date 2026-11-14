import { useMemo, useState } from 'react';
import { useToast } from '../app/context.tsx';
import { Card, Num, Select } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { CATEGORIES_SCORES, SCORES, type Inputs, type ScoreDef } from '../knowledge/scores.ts';
import { TERMES } from '../knowledge/termes.ts';
import { SYMPTOMES } from '../knowledge/symptomes.ts';
import { ANALYTES, bornesAffichees } from '../knowledge/biologie.ts';
import { insererTexte } from '../ui/insertion.ts';

export function Library({ tab = 'scores' }: { tab?: string }) {
  const [t, setT] = useState(tab);
  return (
    <div className="page">
      <div className="page-h"><div className="t"><h1>Bibliothèques</h1><p>Classifications et scores, termes sémiologiques, aide-mémoire par symptôme et valeurs biologiques de référence.</p></div></div>
      <div className="tabs">
        {[['scores', 'Scores et classifications'], ['termes', 'Termes médicaux'], ['semio', 'Aide-mémoire sémiologique'], ['bio', 'Valeurs de référence']].map(([id, l]) => <button key={id} className={t === id ? 'on' : ''} onClick={() => setT(id)}>{l}</button>)}
      </div>
      {t === 'scores' && <ScoresLib />}
      {t === 'termes' && <TermesLib />}
      {t === 'semio' && <SemioLib />}
      {t === 'bio' && <BioLib />}
    </div>
  );
}

function ScoresLib() {
  const [q, setQ] = useState('');
  const list = SCORES.filter((s) => !q || (s.nom + s.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <input type="search" placeholder="Rechercher un score…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un score" style={{ maxWidth: 360 }} />
      {CATEGORIES_SCORES.map((c) => {
        const xs = list.filter((s) => s.categorie === c);
        if (!xs.length) return null;
        return <div key={c}><h3 className="mb8 muted">{c}</h3><div className="col">{xs.map((s) => <Calculateur key={s.id} def={s} />)}</div></div>;
      })}
    </div>
  );
}

/** Calculateur autonome (hors observation) */
function Calculateur({ def }: { def: ScoreDef }) {
  const [open, setOpen] = useState(false);
  const [inp, setInp] = useState<Inputs>({});
  const r = def.compute(inp);
  return (
    <div className="card flat" style={{ border: '1px solid var(--border)' }}>
      <div className="card-h" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h3>{def.nom}<div className="small muted" style={{ fontWeight: 400 }}>{def.description}</div></h3>
        {r.valeur && <span className="badge primary">{r.valeur}</span>}
        <Icon name={open ? 'chevronD' : 'chevronR'} />
      </div>
      {open && (
        <div className="card-b col">
          {def.items.map((it) => (
            <div key={it.id} className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 320px)', alignItems: 'center' }}>
              <span className="small">{it.label}{it.type === 'check' && <span className="faint"> ({(it.pts ?? 1) > 0 ? '+' : ''}{String(it.pts ?? 1).replace('.', ',')})</span>}</span>
              {it.type === 'select' ? <Select value={inp[it.id] ?? ''} options={(it.options ?? []).map((o) => ({ v: o.v, l: o.label }))} onChange={(v) => setInp({ ...inp, [it.id]: v || undefined })} aria-label={it.label} />
                : it.type === 'number' ? <Num value={inp[it.id] ?? ''} unit={it.unit} onChange={(v) => setInp({ ...inp, [it.id]: v || undefined })} aria-label={it.label} />
                : <div className="tri"><button className={`p ${inp[it.id] === '1' ? 'on' : ''}`} onClick={() => setInp({ ...inp, [it.id]: inp[it.id] === '1' ? undefined : '1' })}>Oui</button><button className={`a ${inp[it.id] === '0' ? 'on' : ''}`} onClick={() => setInp({ ...inp, [it.id]: inp[it.id] === '0' ? undefined : '0' })}>Non</button></div>}
            </div>
          ))}
          {r.valeur && <div className={`score-res ${r.niveau}`}><span className="v">{r.valeur}</span><div style={{ flex: 1 }}>{r.interpretation}{!r.complet && <div className="small" style={{ color: 'var(--warning)' }}>Critères non renseignés : {r.manquants.join(', ')}</div>}</div></div>}
          {def.reference && <p className="small faint">Référence : {def.reference}</p>}
        </div>
      )}
    </div>
  );
}

export function TermesLib({ onInsert }: { onInsert?: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return TERMES.filter((t) => !s || (t.terme + t.definition + t.domaine).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(s));
  }, [q]);
  return (
    <div className="stack">
      <input type="search" placeholder="Rechercher un terme…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un terme" style={{ maxWidth: 360 }} autoFocus={!!onInsert} />
      <Card>
        <div className="col" style={{ margin: '-14px -16px' }}>
          {list.map((t) => (
            <div key={t.terme} className="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}><strong>{t.terme}</strong> <span className="badge outline">{t.domaine}</span><div className="small muted">{t.definition}</div></div>
              {onInsert && <button className="btn xs" onClick={() => { if (insererTexte(t.terme.toLowerCase())) { toast(`« ${t.terme} » inséré.`); onInsert(); } else toast('Placez d’abord le curseur dans un champ de texte.', true); }}>Insérer</button>}
              <button className="btn xs" onClick={() => { void navigator.clipboard?.writeText(t.terme.toLowerCase()); toast('Terme copié.'); }}>Copier</button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SemioLib() {
  return (
    <div className="col">
      {SYMPTOMES.filter((s) => s.id !== 'autre').map((s) => (
        <Card key={s.id} title={s.label} sub={s.categorie}>
          <div className="grid g3 small">
            <div><strong>Rappels</strong><ul style={{ paddingLeft: 18 }}>{s.rappels.map((r) => <li key={r}>{r}</li>)}</ul></div>
            <div><strong style={{ color: 'var(--danger)' }}>Drapeaux rouges</strong><ul style={{ paddingLeft: 18 }}>{s.drapeaux.map((r) => <li key={r}>{r}</li>)}</ul></div>
            <div><strong>Diagnostics graves à ne pas manquer</strong><ul style={{ paddingLeft: 18 }}>{s.aNePasManquer.map((r) => <li key={r}>{r}</li>)}</ul></div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BioLib() {
  return (
    <Card sub="Valeurs indicatives chez l’adulte ; les valeurs du laboratoire priment.">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Analyse</th><th>Unité</th><th>Référence (homme)</th><th>Référence (femme)</th><th>Note</th></tr></thead>
          <tbody>{ANALYTES.map((a) => (
            <tr key={a.id}><td>{a.label}</td><td>{a.unites.map((u) => u.u || '—').join(' / ')}</td><td>{bornesAffichees(a, a.unites[0].u, 'M')}</td><td>{bornesAffichees(a, a.unites[0].u, 'F')}</td><td className="small muted">{a.note}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
