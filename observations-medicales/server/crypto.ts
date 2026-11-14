/**
 * Chiffrement des données de santé au repos (AES-256-GCM) et hachage des mots de passe (scrypt).
 * La clé provient de la variable d'environnement OBS_DATA_KEY (32 octets en base64) ;
 * à défaut, une clé locale est générée dans le dossier de données (mode 0600) — à réserver
 * au développement : en production, la clé doit être fournie par un coffre de secrets.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

let KEY: Buffer | null = null;

export function initKey(dataDir: string): { source: 'env' | 'file' | 'generated' } {
  const env = process.env.OBS_DATA_KEY;
  if (env) {
    const k = Buffer.from(env, 'base64');
    if (k.length !== 32) throw new Error('OBS_DATA_KEY doit contenir 32 octets encodés en base64.');
    KEY = k;
    return { source: 'env' };
  }
  const file = join(dataDir, 'cle-donnees.key');
  if (existsSync(file)) {
    KEY = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (KEY.length !== 32) throw new Error('Fichier de clé invalide.');
    return { source: 'file' };
  }
  KEY = randomBytes(32);
  writeFileSync(file, KEY.toString('base64'), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* systèmes sans permissions POSIX */ }
  return { source: 'generated' };
}

function key(): Buffer {
  if (!KEY) throw new Error('Clé de chiffrement non initialisée.');
  return KEY;
}

/** Chiffre une valeur JSON ; format : v1.<iv>.<tag>.<données> (base64url) */
export function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt<T = unknown>(payload: string): T {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1') throw new Error('Format chiffré inconnu.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const out = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
  return JSON.parse(out.toString('utf8')) as T;
}

/* ------------------------------------------------------------------ */
/* Mots de passe                                                        */
/* ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const h = scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { ...SCRYPT, N: Number(n) });
  return h.length === expected.length && timingSafeEqual(h, expected);
}

export function politiqueMotDePasse(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Le mot de passe doit contenir des lettres et des chiffres.';
  return null;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
