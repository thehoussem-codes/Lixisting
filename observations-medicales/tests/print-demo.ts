import { demoCases } from '../shared/demo.ts';
import { generate } from '../src/engine/generate.ts';
import { docToText } from '../src/engine/doc.ts';
const i = Number(process.argv[2] ?? 0);
const fmt = (process.argv[3] ?? 'standard') as 'complet' | 'standard' | 'court';
const c = demoCases()[i];
console.log(docToText(generate(c.observation, fmt)));
