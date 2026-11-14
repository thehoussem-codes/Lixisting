/**
 * Point d'entrée du serveur.
 * Variables d'environnement :
 *   PORT (3180), HOST (127.0.0.1), DATA_DIR (./data), OBS_DATA_KEY (clé AES-256 en base64),
 *   SESSION_IDLE_MIN (30), SESSION_MAX_HOURS (12), SECURE_COOKIES (1 en production), TRUST_PROXY.
 */
import { resolve } from 'node:path';
import { openDb } from './db.ts';
import { initKey } from './crypto.ts';
import { createApp } from './app.ts';

const prod = process.env.NODE_ENV === 'production';
const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const db = openDb(dataDir);
const cle = initKey(dataDir);
if (cle.source !== 'env') {
  console.warn(`[sécurité] Clé de chiffrement ${cle.source === 'generated' ? 'générée' : 'lue'} dans ${dataDir}. En production, fournissez OBS_DATA_KEY depuis un coffre de secrets et sauvegardez-la séparément des données.`);
}
const secureCookies = process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === '1' : prod;
const app = createApp({
  db,
  staticDir: resolve('dist'),
  secureCookies,
  idleMinutes: Number(process.env.SESSION_IDLE_MIN ?? 30),
  absoluteHours: Number(process.env.SESSION_MAX_HOURS ?? 12),
});
const port = Number(process.env.PORT ?? 3180);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Observations médicales — serveur sur http://${host}:${port} (${prod ? 'production' : 'développement'})`);
  if (prod && !secureCookies) console.warn('[sécurité] Cookies non sécurisés : à n’utiliser que derrière HTTPS ou en local.');
});
