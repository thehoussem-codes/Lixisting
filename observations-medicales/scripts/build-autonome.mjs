// Construit la version autonome (sans serveur) en un seul fichier HTML : dist-autonome/observations-medicales.html
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.VITE_LOCAL = '1';
const out = 'dist-autonome';
await build({
  configFile: false,
  base: './',
  plugins: [react()],
  logLevel: 'warn',
  build: {
    outDir: out,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const assets = join(out, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const page = [
  '<title>Observations médicales</title>',
  '<meta name="robots" content="noindex, nofollow">',
  `<style>${css}</style>`,
  '<div id="root"></div>',
  `<script type="module">${js.replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}</script>`,
].join('\n');
const dest = join(out, 'observations-medicales.html');
writeFileSync(dest, page);
console.log(`${dest} : ${(page.length / 1e6).toFixed(2)} Mo`);
