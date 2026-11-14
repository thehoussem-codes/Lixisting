// Parcours de bout en bout : initialisation, démonstration, saisie, rédaction, exports.
// Usage : npm run build && node e2e/parcours.mjs
import { createRequire } from 'node:module';
const pw = createRequire(import.meta.url)('playwright');
const { chromium, devices } = pw;
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';

const PORT = 3990;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = '/tmp/obs-e2e-data';
const CAP = 'e2e/captures';
rmSync(DATA, { recursive: true, force: true });
mkdirSync(CAP, { recursive: true });

const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
  env: { ...process.env, NODE_ENV: 'production', SECURE_COOKIES: '0', PORT: String(PORT), DATA_DIR: DATA },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));
await new Promise((r) => setTimeout(r, 1500));

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = (n) => page.screenshot({ path: `${CAP}/${n}.png`, fullPage: false });
const step = (s) => console.log(`→ ${s}`);

try {
  step('Initialisation');
  await page.goto(BASE);
  await page.getByText('Première utilisation').waitFor();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill('admin');
  await inputs.nth(1).fill('Dr Démo Admin');
  await inputs.nth(2).fill('motdepasse2026');
  await inputs.nth(3).fill('motdepasse2026');
  await page.getByRole('button', { name: 'Créer le compte administrateur' }).click();
  await page.getByText('Bonjour').waitFor();

  step('Chargement de la démonstration');
  await page.getByRole('button', { name: /cas de démonstration/ }).click();
  await page.getByText('BENALI Karim').first().waitFor();
  await shot('01-accueil');

  step('Ouverture du dossier et de l’observation');
  await page.getByText('BENALI Karim').first().click();
  await page.getByText('Historique des observations').waitFor();
  await shot('02-dossier');
  await page.locator('a[href*="/obs/"][href$="/identite"]').first().click();
  await page.getByText('État civil et identification').waitFor();
  await shot('03-identite');

  for (const [mod, titre, n] of [
    ['hdm', 'Histoire de la maladie', '04-hdm'],
    ['examen/general', 'État général et constantes', '05-constantes'],
    ['examen/cv', 'Appareil cardiovasculaire', '06-cardio'],
    ['examen/neuro', 'Appareil neurologique', '07-neuro'],
    ['antecedents', 'Antécédents', '08-atcd'],
    ['scores', 'Scores et classifications', '09-scores'],
    ['examens', 'Examens complémentaires', '10-examens'],
    ['discussion', 'Discussion diagnostique', '11-discussion'],
    ['cat', 'Conduite à tenir', '12-cat'],
    ['completude', 'Contrôle de complétude', '13-completude'],
    ['redaction', 'Rédaction et export', '14-redaction'],
  ]) {
    step(`Module ${mod}`);
    const url = page.url().replace(/#\/obs\/(\d+)\/.*/, `#/obs/$1/${mod}`);
    await page.goto(url);
    await page.getByRole('heading', { name: titre }).first().waitFor();
    await page.waitForTimeout(300);
    await shot(n);
  }

  step('Saisie : marquer la marche (neuro) puis vérifier l’aperçu et la sauvegarde');
  await page.goto(page.url().replace(/#\/obs\/(\d+)\/.*/, '#/obs/$1/examen/neuro'));
  await page.locator('[data-finding="kernig"] button', { hasText: 'Absent' }).click();
  await page.getByText('Enregistré').first().waitFor({ timeout: 8000 });
  const apercu = await page.locator('.preview').innerText();
  if (!apercu.includes('signe de Kernig')) throw new Error('Aperçu non mis à jour (Kernig)');

  step('Export PDF (brouillon)');
  await page.goto(page.url().replace(/#\/obs\/(\d+)\/.*/, '#/obs/$1/redaction'));
  await page.getByRole('heading', { name: 'Rédaction et export' }).waitFor();
  await page.getByRole('button', { name: 'PDF' }).click();
  await page.getByRole('button', { name: 'Exporter le brouillon' }).waitFor();
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: 'Exporter le brouillon' }).click()]);
  await pdf.saveAs(`${CAP}/observation.pdf`);
  console.log('   PDF', statSync(`${CAP}/observation.pdf`).size, 'octets');

  step('Validation finale');
  await page.getByRole('main').getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByText('Validation finale de l’observation').waitFor();
  await shot('15-validation');
  const justif = page.locator('.modal textarea');
  if (await justif.count()) await justif.fill('Relecture complète effectuée ; paragraphes vérifiés à l’écran.');
  await page.locator('.modal input[type="checkbox"]').check();
  await page.locator('.modal').getByRole('button', { name: 'Valider l’observation' }).click();
  await page.getByText('Observation validée.').waitFor();

  step('Export Word (validé)');
  const [docx] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: 'Word' }).click()]);
  await docx.saveAs(`${CAP}/observation.docx`);
  console.log('   DOCX', statSync(`${CAP}/observation.docx`).size, 'octets');

  step('Format complet et mode sombre');
  await page.getByRole('button', { name: 'Observation complète détaillée' }).click();
  await page.getByRole('button', { name: 'Aperçu du document' }).click();
  await shot('16-complet');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.goto(page.url().replace(/#\/obs\/(\d+)\/.*/, '#/obs/$1/examen/resp'));
  await page.getByRole('heading', { name: 'Appareil respiratoire' }).waitFor();
  await shot('17-sombre');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

  step('Nouveau patient + nouvelle observation depuis un modèle');
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: 'Nouveau patient' }).click();
  const m = page.locator('.modal');
  await m.locator('input').nth(0).fill('Test');
  await m.locator('input').nth(1).fill('Patiente');
  await m.getByRole('radio', { name: 'Féminin' }).click();
  await m.getByRole('button', { name: 'Créer le dossier' }).click();
  await page.getByRole('button', { name: 'Nouvelle observation' }).click();
  await page.locator('.modal select').first().selectOption({ label: 'Fièvre / sepsis (intégré)' });
  await page.locator('.modal').getByRole('button', { name: 'Créer' }).click();
  await page.getByRole('heading', { name: 'Histoire de la maladie', exact: true }).waitFor();
  await shot('18-modele');

  step('Mobile');
  const mob = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mob.newPage();
  mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
  await mp.goto(BASE);
  await mp.locator('#u').fill('admin');
  await mp.locator('#p').fill('motdepasse2026');
  await mp.getByRole('button', { name: 'Se connecter' }).click();
  await mp.getByText('Bonjour').waitFor();
  await mp.screenshot({ path: `${CAP}/19-mobile-accueil.png` });
  await mp.locator('.list-item[href^="#/patients/"]', { hasText: 'BENALI' }).first().click();
  await mp.getByText('Historique des observations').waitFor();
  await mp.screenshot({ path: `${CAP}/19b-mobile-dossier.png` });
  try { await mp.locator('a.obs-main').first().click({ timeout: 8000 }); } catch (x) { await mp.screenshot({ path: `${CAP}/zz-mobile.png` }); throw x; }
  await mp.getByText('État civil et identification').waitFor();
  await mp.screenshot({ path: `${CAP}/20-mobile-obs.png` });
  await mob.close();
} catch (e) {
  console.error('ÉCHEC :', e.message);
  await shot('zz-echec').catch(() => {});
  errors.push(`échec : ${e.message}`);
} finally {
  await browser.close();
  srv.kill();
}
if (errors.length) { console.log('\nErreurs :\n' + errors.join('\n')); process.exit(1); }
console.log('\nParcours complet : OK');
