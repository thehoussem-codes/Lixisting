import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { initKey } from '../server/crypto.ts';
import { createApp } from '../server/app.ts';

let server: Server;
let base = '';
let cookie = '';
const dir = mkdtempSync(join(tmpdir(), 'obs-api-'));

async function call(path: string, method = 'GET', body?: unknown, opts: { csrf?: boolean; cookie?: string } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(opts.csrf === false ? {} : { 'X-Requested-With': 'observations' }), ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: opts.cookie ?? cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set && opts.cookie === undefined) cookie = set.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> & unknown[] };
}

beforeAll(async () => {
  const db = openDb(dir);
  initKey(dir);
  const app = createApp({ db, secureCookies: false, idleMinutes: 30, absoluteHours: 12 });
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

describe('API', () => {
  it('initialisation, authentification et protections', async () => {
    expect((await call('/auth/status')).body.setupRequired).toBe(true);
    expect((await call('/auth/setup', 'POST', { username: 'admin', nom: 'Dr A', password: 'court' })).status).toBe(400);
    expect((await call('/auth/setup', 'POST', { username: 'admin', nom: 'Dr A', password: 'motdepasse2026' })).status).toBe(200);
    expect((await call('/auth/setup', 'POST', { username: 'x', nom: 'x', password: 'motdepasse2026' })).status).toBe(409);
    expect((await call('/patients', 'GET', undefined, { cookie: '' })).status).toBe(401);
    expect((await call('/patients', 'POST', { identity: { nom: 'A', prenom: 'B' } }, { csrf: false })).status).toBe(403);
    expect((await call('/auth/login', 'POST', { username: 'admin', password: 'faux' }, { cookie: '' })).status).toBe(401);
  });

  it('dossiers, observations, conflits de version et validation', async () => {
    const p = await call('/patients', 'POST', { identity: { nom: 'Fictif', prenom: 'Test', sexe: 'F', ipp: 'T-1' } });
    expect(p.status).toBe(200);
    expect((await call('/patients', 'POST', { identity: { nom: 'Autre', prenom: 'X', ipp: 'T-1' } })).status).toBe(409);
    const o = await call(`/patients/${p.body.id}/observations`, 'POST', {});
    const id = o.body.id as number;
    const data = o.body.data as Record<string, unknown>;
    const put = await call(`/observations/${id}`, 'PUT', { data, rev: 1 });
    expect(put.body.rev).toBe(2);
    expect((await call(`/observations/${id}`, 'PUT', { data, rev: 1 })).status).toBe(409);
    expect((await call(`/observations/${id}/validate`, 'POST', { attestation: false })).status).toBe(400);
    const v = await call(`/observations/${id}/validate`, 'POST', { attestation: true, rev: 2 });
    expect(v.body.statut).toBe('validee');
    const apres = await call(`/observations/${id}`, 'PUT', { data, rev: 2 });
    expect(apres.body.devalidee).toBe(true);
    const search = await call('/patients?q=fictif');
    expect((search.body as unknown[]).length).toBe(1);
  });

  it('rôles : un compte en lecture seule ne peut pas modifier', async () => {
    expect((await call('/users', 'POST', { username: 'lecteur', nom: 'L', role: 'lecture', password: 'motdepasse2026' })).status).toBe(200);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'observations' }, body: JSON.stringify({ username: 'lecteur', password: 'motdepasse2026' }) });
    const c = login.headers.get('set-cookie')!.split(';')[0];
    expect((await call('/patients', 'POST', { identity: { nom: 'A', prenom: 'B' } }, { cookie: c })).status).toBe(403);
    expect((await call('/users', 'GET', undefined, { cookie: c })).status).toBe(403);
    expect((await call('/patients', 'GET', undefined, { cookie: c })).status).toBe(200);
  });

  it('les données de santé sont chiffrées en base', async () => {
    const db = openDb(dir);
    const row = db.prepare('SELECT identity_enc FROM patients LIMIT 1').get() as { identity_enc: string };
    expect(row.identity_enc.startsWith('v1.')).toBe(true);
    expect(row.identity_enc).not.toContain('Fictif');
  });
});
