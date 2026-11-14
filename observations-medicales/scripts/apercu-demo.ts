// Affiche l'observation générée d'un cas de démonstration : npx vite-node scripts/apercu-demo.ts 0 standard
import { demoCases } from '../shared/demo.ts';
import { generate } from '../src/engine/generate.ts';
import { docToText } from '../src/engine/doc.ts';
const c = demoCases()[Number(process.argv[2] ?? 0)];
console.log(docToText(generate(c.observation, (process.argv[3] ?? 'standard') as 'complet' | 'standard' | 'court')));
