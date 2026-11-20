/**
 * Test « ce point est-il dans ces polygones ? » rapide, pour de grands contours (côte de toute la ville).
 * Même règle que le test classique (on compte les bords coupés par une demi-droite vers l'est), mais on ne
 * regarde que les bords qui traversent la bande horizontale du point : les bords sont rangés par bandes de
 * `band` mètres. Résultat identique, des centaines de fois plus rapide sur un contour de milliers de points.
 */
export function ringTester(rings: [number, number][][], band = 10): (x: number, n: number) => boolean {
  const bands = new Map<number, number[]>();   // bords : ax, an, bx, bn
  let minN = Infinity, maxN = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, an] = ring[i], [bx, bn] = ring[j];
      if (an === bn) continue;                 // bord horizontal : jamais coupé par la demi-droite
      minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
      minN = Math.min(minN, an, bn); maxN = Math.max(maxN, an, bn);
      for (let k = Math.floor(Math.min(an, bn) / band); k <= Math.floor(Math.max(an, bn) / band); k++) {
        const list = bands.get(k);
        if (list) list.push(ax, an, bx, bn); else bands.set(k, [ax, an, bx, bn]);
      }
    }
  }
  return (x: number, n: number) => {
    if (n < minN || n > maxN || x < minX || x > maxX) return false;
    const list = bands.get(Math.floor(n / band));
    if (!list) return false;
    let inside = false;
    for (let k = 0; k < list.length; k += 4) {
      const ax = list[k], an = list[k + 1], bx = list[k + 2], bn = list[k + 3];
      if ((an > n) !== (bn > n) && x < ((bx - ax) * (n - an)) / (bn - an) + ax) inside = !inside;
    }
    return inside;
  };
}
