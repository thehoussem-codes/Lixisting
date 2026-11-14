/** Base de données SQLite (module natif node:sqlite) et schéma. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','medecin','interne','lecture')),
  password_hash TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login TEXT,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  prefs TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  identity_enc TEXT NOT NULL,
  fictif INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  data_enc TEXT NOT NULL,
  summary_enc TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  rev INTEGER NOT NULL DEFAULT 1,
  author_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  validated_by INTEGER,
  validated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON observations(patient_id);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data_enc TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  nom TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  partage INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  target TEXT,
  ip TEXT
);
`;

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'observations.sqlite'));
  db.exec(SCHEMA);
  return db;
}

export const nowIso = () => new Date().toISOString();
