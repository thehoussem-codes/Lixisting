import { MOBILE } from '../engine/Mobile';
import type { WorldData } from '../world/WorldData';
import type { RegionData } from '../world/Region';

const BASE_SCALE = 0.25;   // pixels par mètre de l'image d'ensemble (vue éloignée)
const MINI_SIZE = 180;     // taille de la mini-carte à l'écran (pixels)
const MINI_SPAN = 500;     // largeur de terrain visible dans la mini-carte (mètres)
const MIN_ZOOM = 0.06, MAX_ZOOM = 6; // pixels par mètre
const DETAIL_ZOOM = 0.5;   // au-delà, la carte est redessinée trait par trait : elle reste nette
const REGION_SCALE = MOBILE ? 0.018 : 0.035; // pixels par mètre de l'image de la wilaya (80 km → 2 800 pixels ; 1 450 sur téléphone)
const MIN_REGION_ZOOM = 0.008;
const CITY_LABELS_ZOOM = 0.03;  // en dessous, la ville n'a plus qu'une étiquette « Annaba »

const AREA_COLORS: Record<string, string> = {
  beach: '#f3e3a3', wood: '#9cc48a', scrub: '#bcd3a0', grass: '#b9dba0', pitch: '#a5d08f', rock: '#c9c5bb',
};
const SEA = '#8cc0dc', LAND = '#efe6d0', BUILDING = '#c7b49c';

interface Box { x0: number; n0: number; x1: number; n1: number }

function boxOf(points: number[]): Box {
  let x0 = Infinity, n0 = Infinity, x1 = -Infinity, n1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]);
    n0 = Math.min(n0, points[i + 1]); n1 = Math.max(n1, points[i + 1]);
  }
  return { x0, n0, x1, n1 };
}

/**
 * Carte d'Annaba, construite avec les mêmes données réelles que le monde 3D.
 *  - Mini-carte toujours visible, centrée sur le joueur.
 *  - Grande carte (touche M ou clic sur la mini-carte) : molette pour zoomer, glisser pour
 *    se déplacer, boutons + / − / recentrer / fermer, clic sur un repère pour s'y rendre.
 *    En zoomant, rues, bâtiments et noms de rues sont redessinés : rien n'est déformé.
 */
export class MapView {
  private base = document.createElement('canvas');
  private mini = document.createElement('canvas');
  private full = document.createElement('canvas');
  private panel = document.createElement('div');
  private x0: number; private n1: number;
  private isOpen = false;
  // Vue de la grande carte : point du monde au centre de l'écran, et zoom en pixels par mètre.
  private centerX = 0; private centerN = 0; private zoom = 0.12;
  private follow = true;          // la vue reste centrée sur le joueur tant qu'on n'a pas déplacé la carte
  private dragging: { x: number; y: number; moved: boolean } | null = null;
  private playerX = 0; private playerN = 0; private playerHeading = 0;
  private dirty = true;
  private roadBoxes: Box[]; private buildingBoxes: Box[];
  /** Wilaya autour de la ville (image à petite échelle), une fois chargée. */
  private region: RegionData | null = null;
  private regionBase = document.createElement('canvas');
  private rx0 = 0; private rn1 = 0;

  constructor(private data: WorldData, private onPlace: (index: number) => void, private onPoint: (x: number, n: number) => void = () => undefined) {
    const [x0, n0, x1, n1] = data.meta.rect_m;
    this.x0 = x0; this.n1 = n1;
    this.base.width = Math.ceil((x1 - x0) * BASE_SCALE);
    this.base.height = Math.ceil((n1 - n0) * BASE_SCALE);
    this.roadBoxes = data.roads.map((road) => boxOf(road.p));
    this.buildingBoxes = data.buildings.map((building) => boxOf(building.p));
    this.drawBase();

    this.mini.width = this.mini.height = MINI_SIZE;
    this.mini.className = 'minimap';
    this.mini.title = 'Ouvrir la carte (M)';
    this.mini.addEventListener('click', this.toggle);

    this.full.className = 'fullmap';
    this.full.addEventListener('wheel', this.onWheel, { passive: false });
    this.full.addEventListener('mousedown', this.onDown);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);

    this.panel.className = 'map-buttons';
    const button = (label: string, title: string, action: () => void) => {
      const element = document.createElement('button');
      element.textContent = label; element.title = title;
      element.addEventListener('click', (e) => { e.stopPropagation(); action(); this.dirty = true; });
      this.panel.append(element);
    };
    button('+', 'Zoomer', () => this.zoomBy(1.6));
    button('−', 'Dézoomer', () => this.zoomBy(1 / 1.6));
    button('◎', 'Revenir à ma position', () => { this.follow = true; this.zoom = Math.max(this.zoom, 0.8); });
    button('▣', 'Voir toute la carte', () => this.fitAll());
    button('✕', 'Fermer la carte (M)', () => this.toggle());
    document.body.append(this.mini, this.full, this.panel);
  }

  toggle = (): void => {
    this.isOpen = !this.isOpen;
    // On libère la souris pour pouvoir utiliser la carte.
    if (this.isOpen && document.pointerLockElement) document.exitPointerLock();
    if (this.isOpen) { this.follow = true; this.zoom = 0.9; }
    this.full.style.display = this.panel.style.display = this.isOpen ? 'block' : 'none';
    this.dirty = true;
  };

  dispose(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    this.mini.remove(); this.full.remove(); this.panel.remove();
  }

  private fitAll(): void {
    const [x0, n0, x1, n1] = this.region ? this.region.meta.rect_m : this.data.meta.rect_m;
    this.follow = false;
    this.centerX = (x0 + x1) / 2; this.centerN = (n0 + n1) / 2;
    this.zoom = Math.max(MIN_REGION_ZOOM, Math.min((window.innerWidth - 60) / (x1 - x0), (window.innerHeight - 60) / (n1 - n0)));
  }

  private zoomBy(factor: number, screenX = window.innerWidth / 2, screenY = window.innerHeight / 2): void {
    // Le point sous le curseur reste sous le curseur pendant le zoom.
    const worldX = this.centerX + (screenX - window.innerWidth / 2) / this.zoom;
    const worldN = this.centerN - (screenY - window.innerHeight / 2) / this.zoom;
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.region ? MIN_REGION_ZOOM : MIN_ZOOM, this.zoom * factor));
    if (!this.follow) {
      this.centerX = worldX - (screenX - window.innerWidth / 2) / this.zoom;
      this.centerN = worldN + (screenY - window.innerHeight / 2) / this.zoom;
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    this.dirty = true;
  };

  private onDown = (e: MouseEvent): void => { this.dragging = { x: e.clientX, y: e.clientY, moved: false }; };

  private onMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
    if (!this.dragging.moved && Math.hypot(dx, dy) < 4) return;
    this.dragging = { x: e.clientX, y: e.clientY, moved: true };
    this.follow = false;
    this.centerX -= dx / this.zoom; this.centerN += dy / this.zoom;
    this.dirty = true;
  };

  private onUp = (e: MouseEvent): void => {
    const drag = this.dragging;
    this.dragging = null;
    if (!drag || drag.moved || !this.isOpen) return;
    // Simple clic (sans glisser) : sur un repère, on s'y rend.
    const w = window.innerWidth, h = window.innerHeight;
    const index = this.zoom < CITY_LABELS_ZOOM ? -1 : this.data.places.findIndex((place) =>
      Math.hypot(w / 2 + (place.x - this.centerX) * this.zoom - e.clientX, h / 2 - (place.n - this.centerN) * this.zoom - e.clientY) < 16);
    if (index >= 0) { this.onPlace(index); this.toggle(); return; }
    const town = this.region?.places.find((place) => this.townShown(place.k) &&
      Math.hypot(w / 2 + (place.x - this.centerX) * this.zoom - e.clientX, h / 2 - (place.n - this.centerN) * this.zoom - e.clientY) < 12);
    if (town) { this.onPoint(town.x, town.n); this.toggle(); }
  };

  /** Villes et villages affichés à ce zoom (les hameaux seulement de près). */
  private townShown(kind: string): boolean {
    return kind === 'city' || kind === 'town' || kind === 'aerodrome' || (kind === 'village' && this.zoom > 0.02) || ((kind === 'suburb' || kind === 'hamlet') && this.zoom > 0.09);
  }

  /** La wilaya autour de la ville : image d'ensemble à petite échelle (côte, lacs, routes, limites). */
  setRegion(region: RegionData): void {
    this.region = region;
    const [x0, n0, x1, n1] = region.meta.rect_m;
    this.rx0 = x0; this.rn1 = n1;
    this.regionBase.width = Math.ceil((x1 - x0) * REGION_SCALE);
    this.regionBase.height = Math.ceil((n1 - n0) * REGION_SCALE);
    const ctx = this.regionBase.getContext('2d')!;
    const X = (x: number) => (x - x0) * REGION_SCALE, Y = (n: number) => (n1 - n) * REGION_SCALE;
    const trace = (p: number[], close: boolean) => {
      ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      if (close) ctx.closePath();
    };
    ctx.fillStyle = SEA; ctx.fillRect(0, 0, this.regionBase.width, this.regionBase.height);
    ctx.fillStyle = LAND;
    for (const ring of region.land) { trace(ring, true); ctx.fill(); }
    ctx.fillStyle = '#b7d4a0';
    for (const ring of region.wetlands) { trace(ring, true); ctx.fill(); }
    ctx.fillStyle = SEA;
    for (const ring of region.lakes) { trace(ring, true); ctx.fill(); }
    ctx.strokeStyle = SEA; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const river of region.rivers) { ctx.lineWidth = Math.max(1, river.w * REGION_SCALE); trace(river.p, false); ctx.stroke(); }
    for (const major of [false, true]) {
      for (const road of region.roads) {
        const big = road.w >= 9 || road.k.startsWith('motorway') || road.k.startsWith('trunk') || road.k.startsWith('primary');
        if (big !== major) continue;
        ctx.strokeStyle = major ? '#f2b84b' : '#ffffff';
        ctx.lineWidth = major ? 2.2 : road.k === 'residential' || road.k === 'unclassified' ? 0.7 : 1.3;
        trace(road.p, false); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#7a6a5c'; ctx.lineWidth = 1;
    for (const rail of region.rails) { trace(rail.p, false); ctx.stroke(); }
    // La ville détaillée, réduite, par-dessus.
    const [cx0, , , cn1] = this.data.meta.rect_m;
    ctx.drawImage(this.base, X(cx0), Y(cn1), this.base.width * (REGION_SCALE / BASE_SCALE), this.base.height * (REGION_SCALE / BASE_SCALE));
    this.dirty = true;
  }

  /** À appeler à chaque image : position du joueur et direction (radians). */
  update(x: number, z: number, heading: number): void {
    const moved = Math.abs(x - this.playerX) + Math.abs(-z - this.playerN) > 0.3 || Math.abs(heading - this.playerHeading) > 0.02;
    this.playerX = x; this.playerN = -z; this.playerHeading = heading;

    const px = (x - this.x0) * BASE_SCALE, py = (this.n1 + z) * BASE_SCALE;
    const mini = this.mini.getContext('2d')!;
    const span = MINI_SPAN * BASE_SCALE;
    mini.fillStyle = SEA;
    mini.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    if (this.region) {
      const rpx = (x - this.rx0) * REGION_SCALE, rpy = (this.rn1 + z) * REGION_SCALE, rspan = MINI_SPAN * REGION_SCALE;
      mini.imageSmoothingEnabled = true;
      mini.drawImage(this.regionBase, rpx - rspan / 2, rpy - rspan / 2, rspan, rspan, 0, 0, MINI_SIZE, MINI_SIZE);
    }
    mini.drawImage(this.base, px - span / 2, py - span / 2, span, span, 0, 0, MINI_SIZE, MINI_SIZE);
    this.drawMarker(mini, MINI_SIZE / 2, MINI_SIZE / 2, heading, 7);

    if (!this.isOpen) return;
    if (this.follow) { this.centerX = this.playerX; this.centerN = this.playerN; }
    if (this.dirty || moved) { this.drawFull(); this.dirty = false; }
  }

  private drawFull(): void {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.full.width !== w || this.full.height !== h) { this.full.width = w; this.full.height = h; }
    const ctx = this.full.getContext('2d')!;
    const zoom = this.zoom;
    const X = (x: number) => w / 2 + (x - this.centerX) * zoom, Y = (n: number) => h / 2 - (n - this.centerN) * zoom;
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, w, h);
    if (this.region) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.regionBase, X(this.rx0), Y(this.rn1), this.regionBase.width * (zoom / REGION_SCALE), this.regionBase.height * (zoom / REGION_SCALE));
    }

    if (zoom < DETAIL_ZOOM) {
      // Vue d'ensemble : l'image pré-dessinée suffit.
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.base, X(this.x0), Y(this.n1), this.base.width * (zoom / BASE_SCALE), this.base.height * (zoom / BASE_SCALE));
    } else {
      // Vue rapprochée : on redessine ce qui est à l'écran, à la bonne taille.
      const view: Box = { x0: this.centerX - w / 2 / zoom, x1: this.centerX + w / 2 / zoom, n0: this.centerN - h / 2 / zoom, n1: this.centerN + h / 2 / zoom };
      const visible = (b: Box) => b.x1 >= view.x0 && b.x0 <= view.x1 && b.n1 >= view.n0 && b.n0 <= view.n1;
      const trace = (p: number[], close: boolean) => {
        ctx.beginPath();
        ctx.moveTo(X(p[0]), Y(p[1]));
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
        if (close) ctx.closePath();
      };
      ctx.fillStyle = LAND;
      for (const ring of this.data.land) { trace(ring, true); ctx.fill(); }
      for (const area of this.data.areas) { ctx.fillStyle = AREA_COLORS[area.k] ?? '#cccccc'; trace(area.p, true); ctx.fill(); }
      ctx.fillStyle = BUILDING; ctx.strokeStyle = '#a8957d'; ctx.lineWidth = 1;
      this.data.buildings.forEach((building, i) => {
        if (!visible(this.buildingBoxes[i])) return;
        trace(building.p, true); ctx.fill();
        if (zoom > 1.5) ctx.stroke();
      });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Rues : un liseré gris puis la chaussée claire ; les grands axes en jaune par-dessus.
      for (const pass of ['edge', 'minor', 'major'] as const) {
        this.data.roads.forEach((road, i) => {
          if (!visible(this.roadBoxes[i])) return;
          const walk = road.k === 'footway' || road.k === 'path' || road.k === 'steps' || road.k === 'track';
          const major = road.w >= 9;
          if (pass === 'major' ? !major : pass === 'minor' ? major || walk : walk) return;
          const width = Math.max(walk ? 1 : 2, road.w * zoom);
          trace(road.p, false);
          if (pass === 'edge') { ctx.strokeStyle = '#b9b2a4'; ctx.lineWidth = width + 2; }
          else { ctx.strokeStyle = major ? '#f2b84b' : '#ffffff'; ctx.lineWidth = width; }
          ctx.stroke();
        });
        if (pass === 'edge') { // les chemins piétons, en pointillé
          ctx.setLineDash([4, 4]); ctx.strokeStyle = '#b0a48c'; ctx.lineWidth = 1.5;
          this.data.roads.forEach((road, i) => {
            if (visible(this.roadBoxes[i]) && (road.k === 'footway' || road.k === 'path' || road.k === 'steps' || road.k === 'track')) { trace(road.p, false); ctx.stroke(); }
          });
          ctx.setLineDash([]);
        }
      }
      ctx.strokeStyle = '#7a6a5c'; ctx.lineWidth = 1.5;
      for (const rail of this.data.rails) { trace(rail.p, false); ctx.stroke(); }
      // Noms de rues, écrits le long de la rue, une fois par nom dans la vue.
      if (zoom > 1.1) {
        ctx.font = `${Math.min(15, 9 + zoom * 2)}px "Trebuchet MS", Verdana, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const written = new Set<string>();
        this.data.roads.forEach((road, i) => {
          if (!road.n || written.has(road.n) || !visible(this.roadBoxes[i]) || road.p.length < 4) return;
          const k = Math.floor(road.p.length / 4) * 2;
          const ax = X(road.p[k - 2]), ay = Y(road.p[k - 1]), bx = X(road.p[k]), by = Y(road.p[k + 1]);
          if (ax < 40 || ax > w - 40 || ay < 20 || ay > h - 20) return;
          written.add(road.n);
          let angle = Math.atan2(by - ay, bx - ax);
          if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
          ctx.save();
          ctx.translate(ax, ay); ctx.rotate(angle);
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(road.n, 0, 0);
          ctx.fillStyle = '#4a4338'; ctx.fillText(road.n, 0, 0);
          ctx.restore();
        });
      }
    }

    // Limite de la wilaya d'Annaba (tracée à chaque fois : reste nette à tous les zooms).
    if (this.region) {
      ctx.setLineDash([7, 5]); ctx.strokeStyle = 'rgba(128,40,150,0.75)'; ctx.lineWidth = 2;
      for (const b of this.region.boundaries) {
        if (b.name !== 'Annaba') continue;
        for (const ring of b.rings) {
          ctx.beginPath(); ctx.moveTo(X(ring[0]), Y(ring[1]));
          for (let i = 2; i < ring.length; i += 2) ctx.lineTo(X(ring[i]), Y(ring[i + 1]));
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Repères (cliquables) et position du joueur.
    ctx.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (zoom < CITY_LABELS_ZOOM) {
      // Vue de toute la wilaya : une seule étiquette pour la ville (au Cours de la Révolution).
      const centre = this.data.places.find((place) => place.name.startsWith('Cours')) ?? this.data.places[0];
      ctx.font = 'bold 15px "Trebuchet MS", Verdana, sans-serif';
      ctx.fillStyle = '#1b3a57';
      ctx.beginPath(); ctx.arc(X(centre.x), Y(centre.n), 7, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
      ctx.strokeText('Annaba', X(centre.x) + 10, Y(centre.n) + 5); ctx.fillText('Annaba', X(centre.x) + 10, Y(centre.n) + 5);
    } else this.data.places.forEach((place, i) => {
      const lx = X(place.x), ly = Y(place.n);
      if (lx < -50 || lx > w + 50 || ly < -20 || ly > h + 20) return;
      ctx.fillStyle = '#1b3a57';
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
      const label = i < 9 ? `${i + 1} · ${place.name}` : place.name;
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
      ctx.strokeText(label, lx + 9, ly + 4);
      ctx.fillText(label, lx + 9, ly + 4);
    });
    // Villes et villages de la wilaya (cliquables : on s'y rend).
    if (this.region) {
      for (const place of this.region.places) {
        if (!this.townShown(place.k)) continue;
        const lx = X(place.x), ly = Y(place.n);
        if (lx < -50 || lx > w + 50 || ly < -20 || ly > h + 20) continue;
        const big = place.k === 'city' || place.k === 'town' || place.k === 'aerodrome';
        ctx.font = `${big ? 'bold 13px' : '11px'} "Trebuchet MS", Verdana, sans-serif`;
        if (place.k === 'aerodrome') {   // pictogramme d'avion à la place du point
          ctx.fillStyle = '#1f3d6b'; ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
          ctx.strokeText('✈ ' + place.name, lx - 6, ly + 4); ctx.fillText('✈ ' + place.name, lx - 6, ly + 4);
          continue;
        }
        ctx.fillStyle = big ? '#5a2f1b' : '#6d5a48';
        ctx.beginPath(); ctx.arc(lx, ly, big ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
        ctx.strokeText(place.name, lx + 7, ly + 4); ctx.fillText(place.name, lx + 7, ly + 4);
      }
    }
    this.drawMarker(ctx, X(this.playerX), Y(this.playerN), this.playerHeading, 10);

    // Échelle et aide.
    const metres = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].find((m) => m * zoom >= 70) ?? 20000;
    ctx.fillStyle = 'rgba(20,30,40,0.75)';
    ctx.fillRect(12, h - 44, Math.max(metres * zoom + 16, 380), 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, h - 22, metres * zoom, 3);
    ctx.font = '12px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(`${metres >= 1000 ? metres / 1000 + ' km' : metres + ' m'}  ·  molette : zoom  ·  glisser : déplacer  ·  clic sur un lieu : s'y rendre`, 20, h - 28);
    ctx.fillText('© contributeurs OpenStreetMap', w - 190, h - 14);
  }

  private drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.4); ctx.lineTo(size, size); ctx.lineTo(0, size * 0.5); ctx.lineTo(-size, size);
    ctx.closePath();
    ctx.fillStyle = '#e02020'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** Image d'ensemble, dessinée une seule fois : sert à la mini-carte et à la vue éloignée. */
  private drawBase(): void {
    const ctx = this.base.getContext('2d')!;
    const X = (x: number) => (x - this.x0) * BASE_SCALE, Y = (n: number) => (this.n1 - n) * BASE_SCALE;
    const trace = (p: number[], close: boolean) => {
      ctx.beginPath();
      ctx.moveTo(X(p[0]), Y(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      if (close) ctx.closePath();
    };
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.fillStyle = LAND;
    for (const ring of this.data.land) { trace(ring, true); ctx.fill(); }
    for (const area of this.data.areas) { ctx.fillStyle = AREA_COLORS[area.k] ?? '#cccccc'; trace(area.p, true); ctx.fill(); }
    ctx.fillStyle = BUILDING;
    for (const building of this.data.buildings) { trace(building.p, true); ctx.fill(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const major of [false, true]) {
      for (const road of this.data.roads) {
        if ((road.w >= 9) !== major) continue;
        const walk = road.k === 'footway' || road.k === 'path' || road.k === 'steps';
        ctx.strokeStyle = major ? '#f2b84b' : walk ? '#d8cdb8' : '#ffffff';
        ctx.lineWidth = Math.max(walk ? 0.6 : 1.2, road.w * BASE_SCALE);
        trace(road.p, false); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#7a6a5c'; ctx.lineWidth = 1;
    for (const rail of this.data.rails) { trace(rail.p, false); ctx.stroke(); }
  }
}
