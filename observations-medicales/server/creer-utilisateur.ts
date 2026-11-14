/**
 * Création d'un compte en ligne de commande (ex. compte de démonstration ou premier administrateur).
 * Usage : node server/creer-utilisateur.ts <identifiant> <mot-de-passe> <role> [nom affiché]
 */
import { resolve } from 'node:path';
import { openDb, nowIso } from './db.ts';
import { hashPassword, initKey, politiqueMotDePasse } from './crypto.ts';

const [username, password, role = 'medecin', ...nom] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage : node server/creer-utilisateur.ts <identifiant> <mot-de-passe> <admin|medecin|interne|lecture> [nom]');
  process.exit(1);
}
const err = politiqueMotDePasse(password);
if (err) { console.error(err); process.exit(1); }
const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const db = openDb(dataDir);
initKey(dataDir);
db.prepare('INSERT INTO users (username, nom, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role, actif = 1')
  .run(username, nom.join(' ') || username, role, hashPassword(password), nowIso());
console.log(`Compte « ${username} » (${role}) enregistré.`);
