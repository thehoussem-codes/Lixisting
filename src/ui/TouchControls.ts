import type { Input } from '../engine/Input';

/**
 * Commandes tactiles (téléphone à l'horizontale), d'après les demandes de Houssem :
 * - joystick à gauche : les directions. À pied il fait tout (avancer, reculer, tourner ; au bord : courir).
 *   En voiture ou à moto : gauche / droite pour tourner, bas pour freiner puis reculer ; le haut n'accélère pas ;
 * - à droite, trois boutons ronds : la pédale d'accélérateur (à pied : avancer), FREIN (au volant seulement)
 *   et la voiture 🚗 pour monter ou sortir. Pas de bouton pour sauter (inutile pour l'instant) ;
 * - la mini-carte en haut à gauche s'ouvre d'un toucher (pas de bouton de carte) ;
 * - glisser le doigt ailleurs sur l'écran : tourner la caméra.
 * Les commandes alimentent la même classe Input que le clavier : le jeu ne fait aucune différence.
 */
/** Pédale d'accélérateur, dessin simple (aucun emoji n'existe pour cela). */
const PEDAL = `<svg viewBox="0 0 44 48" width="38" height="42" aria-label="accélérer">
  <g transform="rotate(-14 22 26)">
    <path d="M10 6 Q10 3 13 3 H31 Q34 3 34 6 L31 34 Q30.6 36 28.5 36 H15.5 Q13.4 36 13 34 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M15 10h14M15.6 16h12.8M16.2 22h11.6M16.8 28h10.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="14" y="38" width="16" height="5" rx="2.5" fill="currentColor"/>
  </g>
  <path d="M5 46h34" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

export class TouchControls {
  private root = document.createElement('div');
  private stick = document.createElement('div');
  private knob = document.createElement('div');
  private stickId: number | null = null;
  private stickCenter = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private held = new Set<string>();
  private gas: HTMLDivElement;
  private brake: HTMLDivElement;
  private car: HTMLDivElement;
  private driving = false;
  private stickVector = { x: 0, y: 0 };

  /** À appeler à chaque image : adapte les libellés et le rôle du joystick (à pied ou au volant). */
  setDriving(driving: boolean): void {
    if (driving === this.driving) return;
    this.driving = driving;
    this.brake.classList.toggle('hidden', !driving);
    this.car.classList.toggle('driving', driving);
    this.applyStick();
  }

  constructor(private input: Input, private onFirstTouch: () => void) {
    this.root.className = 'touch';
    this.stick.className = 'touch-stick';
    this.knob.className = 'touch-knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);
    this.gas = this.button(PEDAL, 'touch-gas', 'KeyW', 'hold');
    this.brake = this.button('FREIN', 'touch-brake hidden', 'Space', 'hold');
    this.car = this.button('🚗', 'touch-car', 'KeyF', 'tap');
    const turn = document.createElement('div');
    turn.className = 'touch-rotate';
    turn.innerHTML = '<div>📱↻</div><p>Tourne ton téléphone<br>à l\'horizontale</p>';
    document.body.append(this.root, turn);

    this.stick.addEventListener('touchstart', this.stickStart, { passive: false });
    window.addEventListener('touchstart', this.lookStart, { passive: false });
    window.addEventListener('touchmove', this.move, { passive: false });
    window.addEventListener('touchend', this.end);
    window.addEventListener('touchcancel', this.end);
  }

  dispose(): void {
    window.removeEventListener('touchstart', this.lookStart);
    window.removeEventListener('touchmove', this.move);
    window.removeEventListener('touchend', this.end);
    window.removeEventListener('touchcancel', this.end);
    document.querySelector('.touch-rotate')?.remove();
    this.root.remove();
  }

  private first = true;
  private wake(): void {
    if (!this.first) return;
    this.first = false;
    this.onFirstTouch();
    // Plein écran et verrouillage à l'horizontale, là où le navigateur le permet (Android ; pas Safari sur iPhone).
    const element = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const fullscreen = element.requestFullscreen?.bind(element) ?? element.webkitRequestFullscreen?.bind(element);
    try {
      const result = fullscreen?.() as Promise<void> | undefined;
      result?.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape')).catch(() => undefined);
    } catch { /* plein écran refusé : le jeu marche quand même */ }
  }

  private button(label: string, className: string, code: string, mode: 'hold' | 'tap'): HTMLDivElement {
    const b = document.createElement('div');
    b.className = `touch-button ${className}`;
    b.innerHTML = label;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.wake();
      b.classList.add('on');
      if (mode === 'hold') this.input.setVirtual(code, true);
      else window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    }, { passive: false });
    const release = (e: TouchEvent) => {
      e.preventDefault();
      b.classList.remove('on');
      if (mode === 'hold') this.input.setVirtual(code, false);
    };
    b.addEventListener('touchend', release);
    b.addEventListener('touchcancel', release);
    this.root.appendChild(b);
    return b;
  }

  private stickStart = (e: TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    this.wake();
    const t = e.changedTouches[0];
    const r = this.stick.getBoundingClientRect();
    this.stickId = t.identifier;
    this.stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.updateStick(t.clientX, t.clientY);
  };

  private lookStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.touch-button, .touch-stick, .minimap, .fullmap, .map-buttons')) return;
    e.preventDefault();
    this.wake();
    if (this.lookId !== null) return;
    const t = e.changedTouches[0];
    this.lookId = t.identifier;
    this.lookLast = { x: t.clientX, y: t.clientY };
  };

  private move = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) { e.preventDefault(); this.updateStick(t.clientX, t.clientY); }
      if (t.identifier === this.lookId) {
        e.preventDefault();
        // Un doigt parcourt moins de distance qu'une souris : on amplifie.
        this.input.addLook((t.clientX - this.lookLast.x) * 2.2, (t.clientY - this.lookLast.y) * 1.6);
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) { this.stickId = null; this.updateStick(this.stickCenter.x, this.stickCenter.y); }
      if (t.identifier === this.lookId) this.lookId = null;
    }
  };

  private updateStick(x: number, y: number): void {
    const radius = this.stick.clientWidth / 2;
    let dx = (x - this.stickCenter.x) / radius, dy = (y - this.stickCenter.y) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    this.knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
    this.stickVector = { x: dx, y: dy };
    this.applyStick();
  }

  private applyStick(): void {
    const { x: dx, y: dy } = this.stickVector;
    const wanted = new Set<string>();
    // Au volant, pousser vers le haut n'accélère pas : c'est le rôle du bouton ACCÉLÉRER.
    if (dy < -0.35 && !this.driving) wanted.add('KeyW');
    if (dy > 0.35) wanted.add('KeyS');
    if (dx < -0.35) wanted.add('KeyA');
    if (dx > 0.35) wanted.add('KeyD');
    if (Math.hypot(dx, dy) > 0.92 && !this.driving) wanted.add('ShiftLeft'); // poussé jusqu'au bord, à pied : courir
    for (const code of this.held) if (!wanted.has(code) && !(code === 'KeyW' && this.gas.classList.contains('on'))) this.input.setVirtual(code, false);
    for (const code of wanted) this.input.setVirtual(code, true);
    this.held = wanted;
  }
}
