import { describe, expect, it } from 'vitest';
import { emptyObservation } from '../shared/defaults.ts';
import { demoCases } from '../shared/demo.ts';
import { generate } from '../src/engine/generate.ts';
import { docToText, textToNodes, nodesToText } from '../src/engine/doc.ts';
import { bilan, coherence } from '../src/engine/completude.ts';
import { buildContext } from '../src/engine/context.ts';
import { SCORE_BY_ID, effectiveInputs } from '../src/knowledge/scores.ts';
import { ckdEpi2021, imc, paquetsAnnees, ageAt } from '../src/engine/calc.ts';
import { de, liste, listeDe, feminiser } from '../src/engine/fr.ts';
import { FINDINGS } from '../src/knowledge/registry.ts';
import { APPAREILS } from '../src/knowledge/appareils.ts';
import { SYMPTOMES } from '../src/knowledge/symptomes.ts';

const texte = (o = emptyObservation(), f: 'complet' | 'standard' | 'court' = 'standard') => docToText(generate(o, f));

describe('Règles de sécurité de la rédaction', () => {
  it('une observation vide ne contient aucun signe absent ni examen normal', () => {
    for (const f of ['complet', 'standard', 'court'] as const) {
      const t = texte(emptyObservation(), f);
      expect(t).not.toMatch(/Absence d|Pas d[e’]|normale?s? et symétrique|sans anomalie|bien perçu/);
    }
  });

  it('un signe non renseigné n’est jamais rédigé comme absent', () => {
    const o = emptyObservation({ sexe: 'M' });
    o.findings.dyspnee = { s: 'a' };
    const t = texte(o, 'complet');
    expect(t).toContain('dyspnée');
    expect(t).not.toContain('orthopnée');
    expect(t).not.toContain('palpitations');
  });

  it('les éléments non recherchés sont distingués dans le format complet', () => {
    const o = emptyObservation({ sexe: 'F' });
    o.findings.b3 = { s: 'nr' };
    expect(texte(o, 'complet')).toMatch(/Non recherché : galop protodiastolique/);
    expect(texte(o, 'standard')).not.toMatch(/galop/);
  });

  it('un appareil non examiné est mentionné comme tel, jamais comme normal', () => {
    const o = emptyObservation();
    o.appareils.cv = { statut: 'nr', notes: {}, conclusion: '' };
    expect(texte(o, 'standard')).toMatch(/Appareils non examinés : cardiovasculaire/);
    expect(texte(o, 'complet')).toMatch(/Non examiné\./);
  });

  it('aucun signe propre à l’autre sexe n’est rédigé', () => {
    const o = emptyObservation({ sexe: 'M' });
    o.findings.metrorragies = { s: 'p' };
    expect(texte(o, 'complet')).not.toContain('métrorragies');
  });

  it('les cas de démonstration se rédigent dans les trois formats sans valeur « undefined »', () => {
    for (const c of demoCases()) for (const f of ['complet', 'standard', 'court'] as const) {
      const t = texte(c.observation, f);
      expect(t).not.toMatch(/undefined|null|NaN|\[object/);
      expect(t.length).toBeGreaterThan(800);
    }
  });

  it('accorde le texte au sexe du patient', () => {
    const t = texte(demoCases()[1].observation);
    expect(t).toContain('âgée de');
    expect(t).toContain('la patiente est consciente');
  });
});

describe('Modification manuelle', () => {
  it('relit un texte édité en paragraphes, listes et libellés', () => {
    const n = textToNodes('Inspection : RAS.\n\n- un\n- deux\n\nTexte libre.');
    expect(n).toEqual([{ t: 'p', label: 'Inspection', text: 'RAS.' }, { t: 'ul', items: ['un', 'deux'] }, { t: 'p', text: 'Texte libre.' }]);
    expect(nodesToText(n)).toContain('- deux');
  });

  it('applique le texte modifié et signale les données changées depuis', () => {
    const o = structuredClone(demoCases()[0].observation);
    o.redaction.overrides.standard = { motif: { text: 'Motif réécrit.', base: 'empreinte-ancienne' } };
    const s = generate(o, 'standard').sections.find((x) => x.id === 'motif')!;
    expect(s.edited).toBe(true);
    expect(s.stale).toBe(true);
    expect(nodesToText(s.nodes)).toBe('Motif réécrit.');
  });
});

describe('Français médical', () => {
  it('élide et énumère correctement', () => {
    expect(de('orthopnée')).toBe('d’orthopnée');
    expect(de('hernie', true)).toBe('de hernie');
    expect(liste(['a', 'b', 'c'])).toBe('a, b et c');
    expect(listeDe([{ t: 'toux' }, { t: 'hémoptysie' }], 'ni')).toBe('de toux ni d’hémoptysie');
    expect(feminiser('conscient, orienté')).toBe('consciente, orientée');
  });
});

describe('Calculs', () => {
  it('IMC, paquets-années, âge, DFG', () => {
    expect(imc(86, 174)).toBeCloseTo(28.4, 1);
    expect(paquetsAnnees(20, 30)).toBe(30);
    expect(ageAt('1968-03-14', '2026-03-13')).toBe(57);
    expect(ageAt('1968-03-14', '2026-03-14')).toBe(58);
    // Homme 60 ans, créatinine 1,0 mg/dL (88,4 µmol/L) : ≈ 86 mL/min/1,73 m² (CKD-EPI 2021)
    expect(Math.round(ckdEpi2021(88.4, 60, 'M')!)).toBe(86);
  });
});

describe('Scores', () => {
  it('Glasgow', () => {
    expect(SCORE_BY_ID.glasgow.compute({ E: '4', V: '5', M: '6' }).total).toBe(15);
    expect(SCORE_BY_ID.glasgow.compute({ E: '2', V: '2', M: '4' }).niveau).toBe('critique');
  });
  it('CHA₂DS₂-VASc pré-rempli depuis le dossier', () => {
    const o = demoCases()[2].observation;
    const ctx = buildContext(o);
    const { inputs } = effectiveInputs(SCORE_BY_ID.chads, {}, ctx);
    expect(inputs.hta).toBe('1');
    expect(inputs.age).toBe('1'); // 72 ans
    expect(inputs.ic).toBe('1');
  });
  it('NEWS2 calculé depuis les constantes', () => {
    const r = SCORE_BY_ID.news2.compute({ fr: '28', spo2: '89', o2: '0', echelle: '1', pas: '146', fc: '118', conscience: 'a', t: '36.7' });
    expect(r.total).toBe(3 + 3 + 0 + 0 + 2 + 0);
    expect(r.niveau).toBe('critique'); // NEWS2 ≥ 7
  });
  it('les critères manquants sont signalés', () => {
    const r = SCORE_BY_ID.curb65.compute({ c: '0' });
    expect(r.complet).toBe(false);
    expect(r.manquants.length).toBe(4);
  });
});

describe('Complétude et cohérence', () => {
  it('une observation vide a des manquants indispensables', () => {
    const b = bilan(emptyObservation());
    expect(b.manquantsIndispensables).toBeGreaterThan(10);
    expect(b.global).toBeLessThan(20);
  });
  it('détecte une allergie à une molécule de la même classe prescrite', () => {
    const o = emptyObservation();
    o.atcd.allergies = { statut: 'presentes', entries: [{ uid: '1', type: 'Médicament', agent: 'Pénicilline', reaction: 'Urticaire', date: '', documentee: '' }] };
    o.cat.traitements.push({ uid: 't', nom: 'Amoxicilline', dose: '1 g', posologie: '', voie: 'per os', frequence: '', duree: '', indication: '', ciVerifiees: false, surveillance: '', effets: '' });
    expect(coherence(o).some((i) => i.gravite === 'critique' && /ALLERGIE/.test(i.message))).toBe(true);
  });
  it('détecte fièvre notée absente avec température élevée', () => {
    const o = emptyObservation();
    o.constantes.temperature = '39.2';
    o.findings.fievre = { s: 'a' };
    expect(coherence(o).some((i) => i.id === 'fievre')).toBe(true);
  });
  it('détecte des données gynécologiques chez un homme', () => {
    const o = emptyObservation({ sexe: 'M' });
    o.atcd.gyneco.ddr = '2026-01-01';
    expect(coherence(o).some((i) => i.id === 'sexe_gyneco')).toBe(true);
  });
});

describe('Base de connaissances', () => {
  it('toutes les références de signes et de symptômes existent', () => {
    for (const a of APPAREILS) for (const b of a.blocks) for (const i of b.items) if (i.kind === 'ref') expect(FINDINGS[i.id] ?? true, i.id).toBeTruthy();
    for (const s of SYMPTOMES) for (const f of s.associes) expect(FINDINGS[f], `${s.id} → ${f}`).toBeDefined();
    expect(APPAREILS).toHaveLength(11);
  });
});
