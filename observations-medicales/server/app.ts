/**
 * API HTTP : authentification, gestion des accès, dossiers patients, observations,
 * modèles, préférences et journal d'audit.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { nowIso } from './db.ts';
import { decrypt, encrypt, hashPassword, newToken, politiqueMotDePasse, sha256, verifyPassword } from './crypto.ts';
import type {
  ObservationFull, ObservationMeta, Observation, PatientIdentity, PatientSummary, Preferences, Role, TemplateContent, TemplateRecord, UserInfo,
} from '../shared/types.ts';
import { emptyObservation, normalizeObservation } from '../shared/defaults.ts';
import { demoCases } from '../shared/demo.ts';
import { appliquerModele, sanitiserModele } from '../shared/modeles.ts';

export interface AppOptions {
  db: DB;
  staticDir?: string;
  secureCookies: boolean;
  idleMinutes: number;
  absoluteHours: number;
}

interface SessionUser {
  id: number;
  username: string;
  nom: string;
  role: Role;
  tokenHash: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

const COOKIE = 'obs_session';
const ROLES: Role[] = ['admin', 'medecin', 'interne', 'lecture'];
const CLINIQUES: Role[] = ['admin', 'medecin', 'interne'];

type Row = Record<string, unknown>;

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  /* ---------------- En-têtes de sécurité ---------------- */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    );
    if (opts.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '4mb' }));

  /* ---------------- Utilitaires ---------------- */
  const audit = (req: Request, action: string, target?: string, user?: { id: number; username: string }) => {
    const u = user ?? req.user;
    db.prepare('INSERT INTO audit (at, user_id, username, action, target, ip) VALUES (?, ?, ?, ?, ?, ?)').run(nowIso(), u?.id ?? null, u?.username ?? null, action, target ?? null, req.ip ?? null);
  };
  const lastUpdateAudit = new Map<string, number>();

  const parseCookies = (req: Request): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  };

  const setCookie = (res: Response, token: string | null) => {
    const attrs = ['Path=/', 'HttpOnly', 'SameSite=Strict'];
    if (opts.secureCookies) attrs.push('Secure');
    if (token === null) attrs.push('Max-Age=0');
    res.setHeader('Set-Cookie', `${COOKIE}=${token ?? ''}; ${attrs.join('; ')}`);
  };

  const userInfo = (r: Row): UserInfo => ({
    id: Number(r.id), username: String(r.username), nom: String(r.nom), role: r.role as Role, actif: !!r.actif,
    createdAt: String(r.created_at), lastLogin: (r.last_login as string) ?? null,
  });

  /* ---------------- Session ---------------- */
  app.use('/api', (req, _res, next) => {
    const token = parseCookies(req)[COOKIE];
    if (!token) return next();
    const th = sha256(token);
    const s = db.prepare('SELECT s.*, u.username, u.nom, u.role, u.actif FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(th) as Row | undefined;
    const now = Date.now();
    if (!s || !s.actif || Number(s.expires_at) < now || Number(s.last_seen) + opts.idleMinutes * 60000 < now) {
      if (s) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(th);
      return next();
    }
    if (!req.path.startsWith('/auth/status') || req.query.touch !== '0') db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(now, th);
    req.user = { id: Number(s.user_id), username: String(s.username), nom: String(s.nom), role: s.role as Role, tokenHash: th };
    next();
  });

  /* Protection CSRF : en-tête personnalisé + origine identique pour les requêtes modifiantes */
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-Requested-With') !== 'observations') return res.status(403).json({ error: 'Requête refusée (protection CSRF).' });
    const origin = req.get('Origin');
    if (origin) {
      const host = req.get('Host');
      try {
        if (new URL(origin).host !== host) return res.status(403).json({ error: 'Origine refusée.' });
      } catch {
        return res.status(403).json({ error: 'Origine invalide.' });
      }
    }
    next();
  });

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Session expirée ou non authentifiée.' });
    next();
  };
  const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Droits insuffisants pour cette action.' });
    next();
  };

  const usersCount = () => Number((db.prepare('SELECT COUNT(*) AS n FROM users').get() as Row).n);

  /* ================================================================ */
  /* Authentification                                                   */
  /* ================================================================ */

  app.get('/api/auth/status', (req, res) => {
    const setup = usersCount() === 0;
    if (!req.user) return res.json({ setupRequired: setup, user: null, idleMinutes: opts.idleMinutes });
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as Row;
    res.json({ setupRequired: false, user: userInfo(r), idleMinutes: opts.idleMinutes });
  });

  const ouvrirSession = (req: Request, res: Response, userId: number) => {
    const token = newToken();
    const now = Date.now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)').run(sha256(token), userId, now, now, now + opts.absoluteHours * 3600000, req.ip ?? null);
    db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?').run(now, now - opts.idleMinutes * 60000);
    setCookie(res, token);
  };

  app.post('/api/auth/setup', (req, res) => {
    if (usersCount() > 0) return res.status(409).json({ error: 'L’application est déjà initialisée.' });
    const { username, nom, password } = req.body ?? {};
    if (!username || !nom) return res.status(400).json({ error: 'Identifiant et nom requis.' });
    const pe = politiqueMotDePasse(password);
    if (pe) return res.status(400).json({ error: pe });
    const r = db.prepare('INSERT INTO users (username, nom, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(String(username).trim(), String(nom).trim(), 'admin', hashPassword(password), nowIso());
    const id = Number(r.lastInsertRowid);
    audit(req, 'initialisation', `utilisateur ${id}`, { id, username });
    ouvrirSession(req, res, id);
    res.json({ ok: true });
  });

  const tentatives = new Map<string, { n: number; t: number }>();
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const ip = req.ip ?? '';
    const now = Date.now();
    const tIp = tentatives.get(ip);
    if (tIp && tIp.n >= 20 && now - tIp.t < 60000) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' });
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim()) as Row | undefined;
    const echec = () => {
      tentatives.set(ip, { n: (tIp && now - tIp.t < 60000 ? tIp.n : 0) + 1, t: tIp && now - tIp.t < 60000 ? tIp.t : now });
      if (u) {
        const failed = Number(u.failed) + 1;
        db.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').run(failed, failed >= 5 ? now + 5 * 60000 : null, Number(u.id));
      }
      audit(req, 'connexion_echec', String(username ?? ''), u ? { id: Number(u.id), username: String(u.username) } : undefined);
      res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    };
    if (!u || !u.actif) return echec();
    if (u.locked_until && Number(u.locked_until) > now) return res.status(423).json({ error: 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.' });
    if (!verifyPassword(String(password ?? ''), String(u.password_hash))) return echec();
    db.prepare('UPDATE users SET failed = 0, locked_until = NULL, last_login = ? WHERE id = ?').run(nowIso(), Number(u.id));
    ouvrirSession(req, res, Number(u.id));
    audit(req, 'connexion', undefined, { id: Number(u.id), username: String(u.username) });
    res.json({ ok: true, user: userInfo(u) });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.user) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.user.tokenHash);
      audit(req, 'deconnexion');
    }
    setCookie(res, null);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireAuth, (req, res) => {
    const { ancien, nouveau } = req.body ?? {};
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Row;
    if (!verifyPassword(String(ancien ?? ''), String(u.password_hash))) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    const pe = politiqueMotDePasse(nouveau);
    if (pe) return res.status(400).json({ error: pe });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(nouveau), req.user!.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user!.id, req.user!.tokenHash);
    audit(req, 'mot_de_passe_modifie');
    res.json({ ok: true });
  });

  /* ================================================================ */
  /* Utilisateurs (administrateur)                                      */
  /* ================================================================ */

  app.get('/api/users', requireRole('admin'), (_req, res) => {
    res.json((db.prepare('SELECT * FROM users ORDER BY nom').all() as Row[]).map(userInfo));
  });

  app.post('/api/users', requireRole('admin'), (req, res) => {
    const { username, nom, role, password } = req.body ?? {};
    if (!username || !nom || !ROLES.includes(role)) return res.status(400).json({ error: 'Identifiant, nom et rôle valides requis.' });
    const pe = politiqueMotDePasse(password);
    if (pe) return res.status(400).json({ error: pe });
    try {
      const r = db.prepare('INSERT INTO users (username, nom, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(String(username).trim(), String(nom).trim(), role, hashPassword(password), nowIso());
      audit(req, 'utilisateur_cree', `utilisateur ${r.lastInsertRowid} (${role})`);
      res.json(userInfo(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid)) as Row));
    } catch {
      res.status(409).json({ error: 'Cet identifiant existe déjà.' });
    }
  });

  app.patch('/api/users/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const { role, actif, password, nom } = req.body ?? {};
    if (id === req.user!.id && (actif === false || (role && role !== 'admin'))) return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits d’administration.' });
    if (role !== undefined) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide.' });
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    }
    if (nom) db.prepare('UPDATE users SET nom = ? WHERE id = ?').run(String(nom), id);
    if (actif !== undefined) {
      db.prepare('UPDATE users SET actif = ? WHERE id = ?').run(actif ? 1 : 0, id);
      if (!actif) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (password) {
      const pe = politiqueMotDePasse(password);
      if (pe) return res.status(400).json({ error: pe });
      db.prepare('UPDATE users SET password_hash = ?, failed = 0, locked_until = NULL WHERE id = ?').run(hashPassword(password), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    audit(req, 'utilisateur_modifie', `utilisateur ${id}`);
    res.json(userInfo(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row));
  });

  app.get('/api/audit', requireRole('admin'), (req, res) => {
    const limit = Math.min(1000, Number(req.query.limit ?? 300));
    res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit));
  });

  /* ================================================================ */
  /* Préférences                                                        */
  /* ================================================================ */

  app.get('/api/preferences', requireAuth, (req, res) => {
    const r = db.prepare('SELECT prefs FROM users WHERE id = ?').get(req.user!.id) as Row;
    const prefs: Preferences = { etablissement: '', service: '', enTete: '', signature: req.user!.nom, ...(r.prefs ? JSON.parse(String(r.prefs)) : {}) };
    res.json(prefs);
  });
  app.put('/api/preferences', requireAuth, (req, res) => {
    const b = req.body ?? {};
    const prefs: Preferences = { etablissement: String(b.etablissement ?? ''), service: String(b.service ?? ''), enTete: String(b.enTete ?? ''), signature: String(b.signature ?? '') };
    db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user!.id);
    res.json(prefs);
  });

  /* ================================================================ */
  /* Patients                                                           */
  /* ================================================================ */

  const patientSummary = (r: Row): PatientSummary => {
    const st = db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM observations WHERE patient_id = ? AND deleted = 0').get(Number(r.id)) as Row;
    return {
      id: Number(r.id), identity: decrypt<PatientIdentity>(String(r.identity_enc)), fictif: !!r.fictif,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at), nbObservations: Number(st.n), derniereObservation: (st.last as string) ?? null,
    };
  };

  const normaliser = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  app.get('/api/patients', requireAuth, (req, res) => {
    const q = normaliser(String(req.query.q ?? '').trim());
    const rows = db.prepare('SELECT * FROM patients WHERE deleted = 0 ORDER BY updated_at DESC').all() as Row[];
    let list = rows.map(patientSummary);
    if (q) {
      list = list.filter((p) => {
        const i = p.identity;
        const hay = normaliser(`${i.nom} ${i.prenom} ${i.prenom} ${i.nom} ${i.ipp} ${i.dateNaissance}`);
        return q.split(/\s+/).every((t) => hay.includes(t));
      });
    }
    if (q) audit(req, 'recherche_patients');
    res.json(list);
  });

  const cleanIdentity = (b: Partial<PatientIdentity> | undefined): PatientIdentity => ({
    ipp: String(b?.ipp ?? '').trim(), nom: String(b?.nom ?? '').trim(), prenom: String(b?.prenom ?? '').trim(),
    dateNaissance: String(b?.dateNaissance ?? ''), sexe: (['M', 'F'].includes(String(b?.sexe)) ? b?.sexe : '') as PatientIdentity['sexe'],
    adresse: String(b?.adresse ?? ''), telephone: String(b?.telephone ?? ''), profession: String(b?.profession ?? ''),
    situationFamiliale: String(b?.situationFamiliale ?? ''), origine: String(b?.origine ?? ''),
    personnePrevenir: { nom: String(b?.personnePrevenir?.nom ?? ''), lien: String(b?.personnePrevenir?.lien ?? ''), telephone: String(b?.personnePrevenir?.telephone ?? '') },
  });

  const creerPatient = (identity: PatientIdentity, userId: number, fictif = false): number => {
    const now = nowIso();
    const r = db.prepare('INSERT INTO patients (identity_enc, fictif, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(encrypt(identity), fictif ? 1 : 0, userId, now, now);
    return Number(r.lastInsertRowid);
  };

  app.post('/api/patients', requireRole(...CLINIQUES), (req, res) => {
    const identity = cleanIdentity(req.body?.identity);
    if (!identity.nom || !identity.prenom) return res.status(400).json({ error: 'Nom et prénom requis.' });
    if (identity.ipp) {
      const dup = (db.prepare('SELECT * FROM patients WHERE deleted = 0').all() as Row[]).map(patientSummary).find((p) => p.identity.ipp && p.identity.ipp === identity.ipp);
      if (dup) return res.status(409).json({ error: `L’identifiant ${identity.ipp} est déjà attribué à un dossier.`, patientId: dup.id });
    }
    const id = creerPatient(identity, req.user!.id);
    audit(req, 'patient_cree', `patient ${id}`);
    res.json(patientSummary(db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as Row));
  });

  const getPatientRow = (id: number) => db.prepare('SELECT * FROM patients WHERE id = ? AND deleted = 0').get(id) as Row | undefined;

  app.get('/api/patients/:id', requireAuth, (req, res) => {
    const r = getPatientRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Dossier introuvable.' });
    const obs = (db.prepare('SELECT * FROM observations WHERE patient_id = ? AND deleted = 0 ORDER BY created_at DESC').all(Number(r.id)) as Row[]).map(obsMeta);
    audit(req, 'patient_consulte', `patient ${r.id}`);
    res.json({ patient: patientSummary(r), observations: obs });
  });

  app.put('/api/patients/:id', requireRole(...CLINIQUES), (req, res) => {
    const r = getPatientRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Dossier introuvable.' });
    const identity = cleanIdentity(req.body?.identity);
    if (!identity.nom || !identity.prenom) return res.status(400).json({ error: 'Nom et prénom requis.' });
    db.prepare('UPDATE patients SET identity_enc = ?, updated_at = ? WHERE id = ?').run(encrypt(identity), nowIso(), Number(r.id));
    audit(req, 'patient_modifie', `patient ${r.id}`);
    res.json(patientSummary(getPatientRow(Number(r.id))!));
  });

  app.delete('/api/patients/:id', requireRole('admin', 'medecin'), (req, res) => {
    const r = getPatientRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Dossier introuvable.' });
    db.prepare('UPDATE patients SET deleted = 1, updated_at = ? WHERE id = ?').run(nowIso(), Number(r.id));
    db.prepare('UPDATE observations SET deleted = 1 WHERE patient_id = ?').run(Number(r.id));
    audit(req, 'patient_archive', `patient ${r.id}`);
    res.json({ ok: true });
  });

  /* ================================================================ */
  /* Observations                                                       */
  /* ================================================================ */

  const nomUser = (id: unknown): string | null => {
    if (id === null || id === undefined) return null;
    const u = db.prepare('SELECT nom FROM users WHERE id = ?').get(Number(id)) as Row | undefined;
    return u ? String(u.nom) : null;
  };

  function obsMeta(r: Row): ObservationMeta {
    const s = decrypt<{ titre: string; dateAdmission: string }>(String(r.summary_enc));
    return {
      id: Number(r.id), patientId: Number(r.patient_id), statut: r.statut as ObservationMeta['statut'], rev: Number(r.rev),
      titre: s.titre, dateAdmission: s.dateAdmission, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      auteur: nomUser(r.author_id) ?? '—', validePar: nomUser(r.validated_by), valideLe: (r.validated_at as string) ?? null,
    };
  }

  const resume = (o: Observation) => ({ titre: o.motif.principal || o.hdm.symptomes[0]?.libelle || 'Observation sans motif', dateAdmission: o.admission.date });

  const creerObservation = (patientId: number, data: Observation, userId: number): number => {
    const now = nowIso();
    const r = db.prepare('INSERT INTO observations (patient_id, data_enc, summary_enc, statut, rev, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
      .run(patientId, encrypt(data), encrypt(resume(data)), 'brouillon', userId, now, now);
    db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, patientId);
    return Number(r.lastInsertRowid);
  };

  const getObsRow = (id: number) => db.prepare('SELECT * FROM observations WHERE id = ? AND deleted = 0').get(id) as Row | undefined;

  const fullObs = (r: Row): ObservationFull => ({
    ...obsMeta(r),
    data: normalizeObservation(decrypt(String(r.data_enc))),
    patient: patientSummary(getPatientRow(Number(r.patient_id))!),
  });

  app.get('/api/observations/recentes', requireAuth, (_req, res) => {
    const rows = db.prepare('SELECT o.* FROM observations o JOIN patients p ON p.id = o.patient_id WHERE o.deleted = 0 AND p.deleted = 0 ORDER BY o.updated_at DESC LIMIT 15').all() as Row[];
    res.json(rows.map((r) => ({ ...obsMeta(r), patient: patientSummary(getPatientRow(Number(r.patient_id))!) })));
  });

  app.post('/api/patients/:id/observations', requireRole(...CLINIQUES), (req, res) => {
    const pr = getPatientRow(Number(req.params.id));
    if (!pr) return res.status(404).json({ error: 'Dossier introuvable.' });
    const ps = patientSummary(pr);
    const data = emptyObservation(ps.identity);
    const { reprendreDe, modele } = req.body ?? {};
    // Reprise des antécédents d'une observation antérieure du même patient (à revérifier)
    if (reprendreDe) {
      const src = getObsRow(Number(reprendreDe));
      if (src && Number(src.patient_id) === ps.id) {
        const o = normalizeObservation(decrypt(String(src.data_enc)));
        data.atcd = o.atcd;
        data.atcd.allergies.statut = o.atcd.allergies.statut === 'aucune' ? 'non_verifiees' : o.atcd.allergies.statut;
        data.atcd.traitements.statut = o.atcd.traitements.statut === 'aucun' ? 'non_verifies' : o.atcd.traitements.statut;
      }
    }
    if (modele && typeof modele === 'object') appliquerModele(data, modele as TemplateContent);
    if (req.body?.service) data.admission.service = String(req.body.service);
    data.admission.medecin = data.admission.medecin || req.user!.nom;
    const id = creerObservation(ps.id, data, req.user!.id);
    audit(req, 'observation_creee', `observation ${id} / patient ${ps.id}`);
    res.json(fullObs(getObsRow(id)!));
  });

  app.get('/api/observations/:id', requireAuth, (req, res) => {
    const r = getObsRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Observation introuvable.' });
    audit(req, 'observation_consultee', `observation ${r.id}`);
    res.json(fullObs(r));
  });

  app.put('/api/observations/:id', requireRole(...CLINIQUES), (req, res) => {
    const r = getObsRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Observation introuvable.' });
    const { data, rev } = req.body ?? {};
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Données manquantes.' });
    if (Number(rev) !== Number(r.rev)) return res.status(409).json({ error: 'L’observation a été modifiée ailleurs (autre poste ou autre onglet).', current: fullObs(r) });
    const obs = normalizeObservation(data);
    const newRev = Number(r.rev) + 1;
    const wasValidated = r.statut === 'validee';
    const now = nowIso();
    db.prepare('UPDATE observations SET data_enc = ?, summary_enc = ?, rev = ?, updated_at = ?, statut = ?, validated_by = ?, validated_at = ? WHERE id = ?')
      .run(encrypt(obs), encrypt(resume(obs)), newRev, now, 'brouillon', wasValidated ? null : (r.validated_by as number | null), wasValidated ? null : (r.validated_at as string | null), Number(r.id));
    // Mise à jour de l'identité du dossier patient depuis l'observation
    const pr = getPatientRow(Number(r.patient_id));
    if (pr) {
      const cur = decrypt<PatientIdentity>(String(pr.identity_enc));
      const next = cleanIdentity(obs.identite);
      if (next.nom && next.prenom && JSON.stringify(cur) !== JSON.stringify(next)) {
        db.prepare('UPDATE patients SET identity_enc = ?, updated_at = ? WHERE id = ?').run(encrypt(next), now, Number(pr.id));
      } else db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, Number(pr.id));
    }
    const k = `${req.user!.id}:${r.id}`;
    if (wasValidated || (lastUpdateAudit.get(k) ?? 0) < Date.now() - 10 * 60000) {
      audit(req, wasValidated ? 'observation_modifiee_apres_validation' : 'observation_modifiee', `observation ${r.id}`);
      lastUpdateAudit.set(k, Date.now());
    }
    res.json({ rev: newRev, updatedAt: now, statut: 'brouillon', devalidee: wasValidated });
  });

  app.post('/api/observations/:id/validate', requireRole('admin', 'medecin'), (req, res) => {
    const r = getObsRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Observation introuvable.' });
    const { attestation, justification, rev } = req.body ?? {};
    if (attestation !== true) return res.status(400).json({ error: 'L’attestation de relecture est requise.' });
    if (rev !== undefined && Number(rev) !== Number(r.rev)) return res.status(409).json({ error: 'Des modifications récentes ne sont pas encore enregistrées.' });
    const now = nowIso();
    db.prepare('UPDATE observations SET statut = ?, validated_by = ?, validated_at = ? WHERE id = ?').run('validee', req.user!.id, now, Number(r.id));
    db.prepare('INSERT INTO versions (observation_id, rev, kind, data_enc, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(Number(r.id), Number(r.rev), 'validation', String(r.data_enc), req.user!.id, now);
    audit(req, 'observation_validee', `observation ${r.id}${justification ? ` — justification : ${String(justification).slice(0, 300)}` : ''}`);
    res.json(fullObs(getObsRow(Number(r.id))!));
  });

  app.get('/api/observations/:id/versions', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT id, rev, kind, user_id, created_at FROM versions WHERE observation_id = ? ORDER BY id DESC').all(Number(req.params.id)) as Row[];
    res.json(rows.map((v) => ({ id: v.id, rev: v.rev, kind: v.kind, auteur: nomUser(v.user_id), createdAt: v.created_at })));
  });

  app.post('/api/observations/:id/duplicate', requireRole(...CLINIQUES), (req, res) => {
    const r = getObsRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Observation introuvable.' });
    const data = normalizeObservation(decrypt(String(r.data_enc)));
    data.redaction.verifies = {};
    const id = creerObservation(Number(r.patient_id), data, req.user!.id);
    audit(req, 'observation_dupliquee', `observation ${r.id} -> ${id}`);
    res.json(fullObs(getObsRow(id)!));
  });

  app.delete('/api/observations/:id', requireRole('admin', 'medecin'), (req, res) => {
    const r = getObsRow(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Observation introuvable.' });
    db.prepare('UPDATE observations SET deleted = 1, updated_at = ? WHERE id = ?').run(nowIso(), Number(r.id));
    audit(req, 'observation_archivee', `observation ${r.id}`);
    res.json({ ok: true });
  });

  app.post('/api/observations/:id/journal', requireAuth, (req, res) => {
    const action = String(req.body?.action ?? '');
    if (!['export_pdf', 'export_word', 'impression', 'copie'].includes(action)) return res.status(400).json({ error: 'Action inconnue.' });
    audit(req, action, `observation ${req.params.id}`);
    res.json({ ok: true });
  });

  /* ================================================================ */
  /* Modèles                                                            */
  /* ================================================================ */

  const tplRow = (r: Row): TemplateRecord => ({
    id: Number(r.id), nom: String(r.nom), description: String(r.description), partage: !!r.partage, ownerId: Number(r.owner_id),
    auteur: nomUser(r.owner_id) ?? '—', createdAt: String(r.created_at), content: JSON.parse(String(r.content)),
  });

  app.get('/api/templates', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM templates WHERE owner_id = ? OR partage = 1 ORDER BY nom').all(req.user!.id) as Row[];
    res.json(rows.map(tplRow));
  });
  app.post('/api/templates', requireRole(...CLINIQUES), (req, res) => {
    const { nom, description, partage, content } = req.body ?? {};
    if (!nom || !content) return res.status(400).json({ error: 'Nom et contenu requis.' });
    const r = db.prepare('INSERT INTO templates (owner_id, nom, description, partage, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.user!.id, String(nom), String(description ?? ''), partage ? 1 : 0, JSON.stringify(sanitiserModele(content)), nowIso());
    res.json(tplRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(r.lastInsertRowid)) as Row));
  });
  app.delete('/api/templates/:id', requireAuth, (req, res) => {
    const r = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(req.params.id)) as Row | undefined;
    if (!r) return res.status(404).json({ error: 'Modèle introuvable.' });
    if (Number(r.owner_id) !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'Seul l’auteur peut supprimer ce modèle.' });
    db.prepare('DELETE FROM templates WHERE id = ?').run(Number(r.id));
    res.json({ ok: true });
  });

  /* ================================================================ */
  /* Données de démonstration (fictives)                                */
  /* ================================================================ */

  app.post('/api/demo', requireRole(...CLINIQUES), (req, res) => {
    const ids: number[] = [];
    for (const c of demoCases()) {
      const pid = creerPatient(c.identity, req.user!.id, true);
      creerObservation(pid, c.observation, req.user!.id);
      ids.push(pid);
    }
    audit(req, 'demo_chargee', `patients ${ids.join(', ')}`);
    res.json({ ok: true, patients: ids });
  });

  /* ---------------- Erreurs API ---------------- */
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ressource inconnue.' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  /* ---------------- Interface (fichiers statiques) ---------------- */
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')));
  }

  return app;
}

export { appliquerModele, sanitiserModele };
