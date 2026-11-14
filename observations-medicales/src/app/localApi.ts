/**
 * Mode démonstration autonome : émulation de l'API dans le navigateur.
 * Utilisé par la version « lien direct » (aucun serveur). Les données restent
 * uniquement dans ce navigateur ; des dossiers fictifs sont chargés au premier lancement.
 */
import type { ObservationFull, ObservationMeta, Observation, PatientIdentity, PatientSummary, Preferences, TemplateRecord, UserInfo } from '../../shared/types.ts';
import { emptyObservation, normalizeObservation } from '../../shared/defaults.ts';
import { demoCases } from '../../shared/demo.ts';
import { appliquerModele, sanitiserModele } from '../../shared/modeles.ts';

interface PRow { id: number; identity: PatientIdentity; fictif: boolean; createdAt: string; updatedAt: string; deleted?: boolean }
interface ORow { id: number; patientId: number; data: Observation; statut: 'brouillon' | 'validee'; rev: number; createdAt: string; updatedAt: string; valideLe: string | null; deleted?: boolean }
interface TRow { id: number; nom: string; description: string; partage: boolean; content: TemplateRecord['content']; createdAt: string }
interface Base { seq: number; patients: PRow[]; observations: ORow[]; templates: TRow[]; prefs: Preferences; v?: number }

const CLE = 'obs-demo-base-v1';
const NOM_DEFAUT = 'Dr ARAR';
const nomMedecin = () => (memoire?.prefs.nom || '').trim() || NOM_DEFAUT;
const user = (): UserInfo => ({ id: 1, username: 'medecin', nom: nomMedecin(), role: 'medecin', actif: true, createdAt: new Date().toISOString(), lastLogin: null });

let memoire: Base | null = null;

function nouvelleBase(): Base {
  const b: Base = { seq: 0, patients: [], observations: [], templates: [], prefs: { nom: memoire?.prefs.nom || NOM_DEFAUT, etablissement: '', service: '', enTete: '', signature: memoire?.prefs.nom || NOM_DEFAUT }, v: 2 };
  chargerDemo(b);
  return b;
}

function lire(): Base {
  if (memoire) return memoire;
  try {
    const s = localStorage.getItem(CLE);
    if (s) memoire = JSON.parse(s) as Base;
  } catch { /* stockage indisponible */ }
  if (!memoire) { memoire = nouvelleBase(); ecrire(); }
  if (memoire.v !== 2) {
    // Migration : remplace le médecin fictif des premières versions par le nom du médecin
    memoire.prefs.nom ||= NOM_DEFAUT;
    if (/Démo/.test(memoire.prefs.signature)) memoire.prefs.signature = memoire.prefs.nom;
    for (const o of memoire.observations) if (/Démo/.test(o.data.admission.medecin)) o.data.admission.medecin = memoire.prefs.nom;
    memoire.v = 2;
    ecrire();
  }
  return memoire;
}

function ecrire() {
  try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch { /* données conservées en mémoire pour cette visite */ }
}

export function reinitialiserDemo() {
  memoire = nouvelleBase();
  ecrire();
}

const now = () => new Date().toISOString();

function chargerDemo(b: Base) {
  for (const c of demoCases()) {
    const pid = ++b.seq;
    b.patients.push({ id: pid, identity: c.identity, fictif: true, createdAt: now(), updatedAt: now() });
    c.observation.admission.medecin = b.prefs.nom || NOM_DEFAUT;
    b.observations.push({ id: ++b.seq, patientId: pid, data: c.observation, statut: 'brouillon', rev: 1, createdAt: now(), updatedAt: now(), valideLe: null });
  }
}

class Err extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

function summary(b: Base, p: PRow): PatientSummary {
  const obs = b.observations.filter((o) => o.patientId === p.id && !o.deleted);
  return { id: p.id, identity: p.identity, fictif: p.fictif, createdAt: p.createdAt, updatedAt: p.updatedAt, nbObservations: obs.length, derniereObservation: obs.map((o) => o.updatedAt).sort().pop() ?? null };
}

function meta(o: ORow): ObservationMeta {
  return {
    id: o.id, patientId: o.patientId, statut: o.statut, rev: o.rev, titre: o.data.motif.principal || 'Observation sans motif', dateAdmission: o.data.admission.date,
    createdAt: o.createdAt, updatedAt: o.updatedAt, auteur: nomMedecin(), validePar: o.statut === 'validee' ? nomMedecin() : null, valideLe: o.valideLe,
  };
}

function full(b: Base, o: ORow): ObservationFull {
  return { ...meta(o), data: normalizeObservation(structuredClone(o.data)), patient: summary(b, patient(b, o.patientId)) };
}

function patient(b: Base, id: number): PRow {
  const p = b.patients.find((x) => x.id === id && !x.deleted);
  if (!p) throw new Err(404, 'Dossier introuvable.');
  return p;
}
function observation(b: Base, id: number): ORow {
  const o = b.observations.find((x) => x.id === id && !x.deleted);
  if (!o) throw new Err(404, 'Observation introuvable.');
  return o;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function creerObs(b: Base, pid: number, data: Observation): ORow {
  const o: ORow = { id: ++b.seq, patientId: pid, data, statut: 'brouillon', rev: 1, createdAt: now(), updatedAt: now(), valideLe: null };
  b.observations.push(o);
  patient(b, pid).updatedAt = now();
  return o;
}

function router(method: string, path: string, body: Record<string, unknown>): unknown {
  const b = lire();
  const [p, qs] = path.split('?');
  const q = new URLSearchParams(qs ?? '');
  const seg = p.split('/').filter(Boolean);
  const id = Number(seg[1]);
  const M = method.toUpperCase();

  if (seg[0] === 'auth') {
    if (seg[1] === 'status') return { setupRequired: false, user: user(), idleMinutes: 0 };
    return { ok: true, user: user() };
  }
  if (seg[0] === 'preferences') {
    if (M === 'PUT') {
      const ancien = nomMedecin();
      b.prefs = { ...b.prefs, ...(body as Partial<Preferences>) };
      const nouveau = nomMedecin();
      if (ancien !== nouveau) {
        // Le médecin responsable des observations existantes suit le changement de nom
        for (const o of b.observations) if (o.data.admission.medecin === ancien) o.data.admission.medecin = nouveau;
        if (b.prefs.signature === ancien) b.prefs.signature = nouveau;
      }
    }
    return b.prefs;
  }
  if (seg[0] === 'demo') { chargerDemo(b); return { ok: true }; }
  if (seg[0] === 'patients') {
    if (!seg[1]) {
      if (M === 'POST') {
        const identity = { ...emptyObservation().identite, ...(body.identity as PatientIdentity) };
        if (!identity.nom.trim() || !identity.prenom.trim()) throw new Err(400, 'Nom et prénom requis.');
        const row: PRow = { id: ++b.seq, identity, fictif: false, createdAt: now(), updatedAt: now() };
        b.patients.push(row);
        return summary(b, row);
      }
      const t = norm(q.get('q') ?? '').split(/\s+/).filter(Boolean);
      return b.patients.filter((x) => !x.deleted)
        .filter((x) => t.every((w) => norm(`${x.identity.nom} ${x.identity.prenom} ${x.identity.ipp} ${x.identity.dateNaissance}`).includes(w)))
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)).map((x) => summary(b, x));
    }
    const pr = patient(b, id);
    if (seg[2] === 'observations') {
      const data = emptyObservation(pr.identity);
      if (body.reprendreDe) {
        const src = observation(b, Number(body.reprendreDe));
        data.atcd = structuredClone(src.data.atcd);
        if (data.atcd.allergies.statut === 'aucune') data.atcd.allergies.statut = 'non_verifiees';
        if (data.atcd.traitements.statut === 'aucun') data.atcd.traitements.statut = 'non_verifies';
      }
      if (body.modele) appliquerModele(data, sanitiserModele(body.modele));
      data.admission.medecin ||= nomMedecin();
      return full(b, creerObs(b, pr.id, data));
    }
    if (M === 'DELETE') { pr.deleted = true; return { ok: true }; }
    if (M === 'PUT') { pr.identity = { ...pr.identity, ...(body.identity as PatientIdentity) }; pr.updatedAt = now(); return summary(b, pr); }
    return { patient: summary(b, pr), observations: b.observations.filter((o) => o.patientId === pr.id && !o.deleted).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map(meta) };
  }
  if (seg[0] === 'observations') {
    if (seg[1] === 'recentes') {
      return b.observations.filter((o) => !o.deleted && b.patients.some((x) => x.id === o.patientId && !x.deleted))
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)).slice(0, 15).map((o) => ({ ...meta(o), patient: summary(b, patient(b, o.patientId)) }));
    }
    const o = observation(b, id);
    if (seg[2] === 'validate') {
      if (body.attestation !== true) throw new Err(400, 'L’attestation de relecture est requise.');
      o.statut = 'validee';
      o.valideLe = now();
      return full(b, o);
    }
    if (seg[2] === 'duplicate') {
      const data = structuredClone(o.data);
      data.redaction.verifies = {};
      return full(b, creerObs(b, o.patientId, data));
    }
    if (seg[2] === 'journal') return { ok: true };
    if (seg[2] === 'versions') return [];
    if (M === 'DELETE') { o.deleted = true; return { ok: true }; }
    if (M === 'PUT') {
      if (Number(body.rev) !== o.rev) throw new Err(409, 'L’observation a été modifiée dans un autre onglet.');
      const devalidee = o.statut === 'validee';
      o.data = normalizeObservation(body.data);
      o.rev += 1;
      o.statut = 'brouillon';
      o.valideLe = null;
      o.updatedAt = now();
      const pr = patient(b, o.patientId);
      if (o.data.identite.nom && o.data.identite.prenom) pr.identity = { ...o.data.identite };
      pr.updatedAt = now();
      return { rev: o.rev, updatedAt: o.updatedAt, statut: 'brouillon', devalidee };
    }
    return full(b, o);
  }
  if (seg[0] === 'templates') {
    const rec = (t: TRow): TemplateRecord => ({ ...t, auteur: nomMedecin(), ownerId: 1 });
    if (M === 'POST') {
      const t: TRow = { id: ++b.seq, nom: String(body.nom ?? ''), description: String(body.description ?? ''), partage: !!body.partage, content: sanitiserModele(body.content), createdAt: now() };
      b.templates.push(t);
      return rec(t);
    }
    if (M === 'DELETE') { b.templates = b.templates.filter((t) => t.id !== id); return { ok: true }; }
    return b.templates.map(rec);
  }
  throw new Err(404, 'Fonction non disponible dans la version de démonstration.');
}

export async function localApi<T>(path: string, method: string, body: unknown): Promise<T> {
  try {
    const r = router(method, path, (body ?? {}) as Record<string, unknown>);
    if (method !== 'GET') ecrire();
    return structuredClone(r) as T;
  } catch (e) {
    if (e instanceof Err) throw e;
    throw new Err(500, (e as Error).message);
  }
}

export { Err as LocalErr };
