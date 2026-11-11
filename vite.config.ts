import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : le jeu fonctionne aussi une fois publié dans un sous-dossier (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
