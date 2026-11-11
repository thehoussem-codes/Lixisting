import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : le jeu fonctionne aussi une fois publié dans un sous-dossier (GitHub Pages).
export default defineConfig({
  base: './',
  // Numéro de version unique à chaque construction : force le navigateur à recharger les fichiers de carte.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  plugins: [react()],
  server: { port: 5173 },
});
