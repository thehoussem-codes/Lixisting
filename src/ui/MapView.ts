import type { WorldData } from '../world/WorldData';

const SCALE = 0.25;        // pixels par mètre sur l'image de la carte
const MINI_SIZE = 180;     // taille de la mini-carte à l'écran (pixels)
const MINI_SPAN = 500;     // largeur de terrain visible dans la mini-carte (mètres)

const AREA_COLORS: Record<string, string> = {
  beach: '#f3e3a3', wood: '#9cc48a', scrub: '#bcd3a0', grass: '#b9dba0', pitch: '#a5d08f', rock: '#c9c5bb',
};

/**
 * Carte 2D d'Annaba : une mini-carte toujours visible, et une grande carte
 * qui s'ouvre avec la touche M ou en cliquant sur la mini-carte.
 * La carte est dessinée une seule fois ; ensuite on ne redessine que le marqueur.
 */
export class MapView {
  private base = document.createElement('canvas');
  private mini = document.createElement('canvas');
  private full = document.createElement('canvas');
  private x0: number; private n1: number;
  private isOpen = false;
  /** Position à l'écran de chaque repère sur la grande carte (pour les clics). */
  private placeDots: { x: number; y: number }[] = [];

  constructor(private data: WorldData, private onPlace: (index: number) => void) {
    const [x0, n0, x1, n1] = data.meta.rect_m;
    this.x0 = x0; this.n1 = n1;
    this.base.width = Math.ceil((x1 - x0) * SCALE);
    this.base.height = Math.ceil((n1 - n0) * SCALE);
    this.drawBase();

    this.mini.width = this.mini.height = MINI_SIZE;
    this.mini.className = 'minimap';
    this.mini.title = 'Ouvrir la carte (M)';
    this.mini.addEventListener('click', this.toggle);
    this.full.className = 'fullmap';
    this.full.addEventListener('click', this.onFullClick);
    document.body.append(this.mini, this.full);
  }

  /** Clic sur la grande carte : sur un repère on s'y rend, ailleurs on ferme. */
  private onFullClick = (e: MouseEvent): void => {
    const index = this.placeDots.findIndex((dot) => Math.hypot(dot.x - e.clientX, dot.y - e.clientY) < 16);
    if (index >= 0) this.onPlace(index);
    this.toggle();
  };

  toggle = (): void => {
    this.isOpen = !this.isOpen;
    // On libère la souris pour pouvoir cliquer sur la carte.
    if (this.isOpen && document.pointerLockElement) document.exitPointerLock();
    this.full.style.display = this.isOpen ? 'block' : 'none';
  };

  dispose(): void {
    this.mini.remove();
    this.full.remove();
  }

  /** À appeler à chaque image : position du joueur et direction (radians). */
  update(x: number, z: number, heading: number): void {
    const px = (x - this.x0) * SCALE;
    const py = (this.n1 + z) * SCALE; // z = -nord

    const mini = this.mini.getContext('2d')!;
    const span = MINI_SPAN * SCALE;
    mini.fillStyle = '#8cc0dc';
    mini.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    mini.drawImage(this.base, px - span / 2, py - span / 2, span, span, 0, 0, MINI_SIZE, MINI_SIZE);
    this.drawMarker(mini, MINI_SIZE / 2, MINI_SIZE / 2, heading, 7);

    if (!this.isOpen) return;
    const w = window.innerWidth, h = window.innerHeight;
    if (this.full.width !== w || this.full.height !== h) { this.full.width = w; this.full.height = h; }
    const ctx = this.full.getContext('2d')!;
    ctx.fillStyle = 'rgba(10, 20, 30, 0.85)';
    ctx.fillRect(0, 0, w, h);
    const fit = Math.min((w - 40) / this.base.width, (h - 40) / this.base.height);
    const ox = (w - this.base.width * fit) / 2, oy = (h - this.base.height * fit) / 2;
    ctx.drawImage(this.base, ox, oy, this.base.width * fit, this.base.height * fit);

    ctx.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
    ctx.lineWidth = 3;
    this.placeDots = [];
    this.data.places.forEach((place, i) => {
      const lx = ox + (place.x - this.x0) * SCALE * fit, ly = oy + (this.n1 - place.n) * SCALE * fit;
      this.placeDots.push({ x: lx, y: ly });
      ctx.fillStyle = '#1b3a57';
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
      const label = i < 9 ? `${i + 1} · ${place.name}` : place.name;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(label, lx + 8, ly + 4);
      ctx.fillText(label, lx + 8, ly + 4);
    });
    this.drawMarker(ctx, ox + px * fit, oy + py * fit, heading, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Clique sur un lieu pour t\'y rendre · Nord en haut · M pour fermer · © contributeurs OpenStreetMap', 16, h - 14);
  }

  private drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.4); ctx.lineTo(size, size); ctx.lineTo(0, size * 0.5); ctx.lineTo(-size, size);
    ctx.closePath();
    ctx.fillStyle = '#e02020';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawBase(): void {
    const ctx = this.base.getContext('2d')!;
    const X = (x: number) => (x - this.x0) * SCALE;
    const Y = (n: number) => (this.n1 - n) * SCALE;
    const trace = (p: number[], close: boolean) => {
      ctx.beginPath();
      ctx.moveTo(X(p[0]), Y(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      if (close) ctx.closePath();
    };

    ctx.fillStyle = '#8cc0dc';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.fillStyle = '#efe6d0';
    for (const ring of this.data.land) { trace(ring, true); ctx.fill(); }
    for (const area of this.data.areas) {
      ctx.fillStyle = AREA_COLORS[area.k] ?? '#cccccc';
      trace(area.p, true); ctx.fill();
    }
    ctx.fillStyle = '#c7b49c';
    for (const building of this.data.buildings) { trace(building.p, true); ctx.fill(); }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Deux passes : d'abord les petites voies, puis les grands axes par-dessus.
    for (const major of [false, true]) {
      for (const road of this.data.roads) {
        if ((road.w >= 10) !== major) continue;
        const walk = road.k === 'footway' || road.k === 'path' || road.k === 'steps';
        ctx.strokeStyle = major ? '#f2b84b' : walk ? '#d8cdb8' : '#ffffff';
        ctx.lineWidth = Math.max(walk ? 0.6 : 1.2, road.w * SCALE);
        trace(road.p, false); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#7a6a5c'; ctx.lineWidth = 1;
    for (const rail of this.data.rails) { trace(rail.p, false); ctx.stroke(); }
  }
}
