import { demoCases } from '../shared/demo.ts';
import { bilan } from '../src/engine/completude.ts';
const c = demoCases()[Number(process.argv[2] ?? 0)];
const b = bilan(c.observation);
console.log('global', b.global, 'manquants indisp', b.manquantsIndispensables, b.progression);
for (const v of b.verifs.filter((x) => !x.ok)) console.log(v.niveau.padEnd(14), v.module.padEnd(12), v.libelle, v.detail ?? '');
console.log('--- incohérences'); b.incoherences.forEach((i) => console.log(i.gravite, i.message));
console.log('--- alertes'); b.alertes.forEach((i) => console.log(i.niveau, i.message));
console.log('--- rappels'); b.rappels.forEach((r) => console.log(r.titre, r.items.filter((i) => i.fait === false).map((i) => i.texte).join(' | ')));
