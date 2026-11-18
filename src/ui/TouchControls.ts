import type { Input } from '../engine/Input';

/**
 * Commandes tactiles (téléphone à l'horizontale), d'après les demandes de Houssem :
 * - joystick à gauche : les directions. À pied il fait tout (avancer, reculer, tourner ; au bord : courir).
 *   En voiture ou à moto : gauche / droite pour tourner, bas pour freiner puis reculer ; le haut n'accélère pas ;
 * - bouton ACCÉLÉRER à droite (à pied : AVANCER) ;
 * - bouton FREIN À MAIN en voiture, SAUTER à pied ; bouton MONTER / SORTIR pour la voiture ;
 * - la mini-carte en haut à gauche s'ouvre d'un toucher (pas de bouton de carte) ;
 * - glisser le doigt ailleurs sur l'écran : tourner la caméra.
 * Boutons texte simples, sans icône.
 * Les commandes alimentent la même classe Input que le clavier : le jeu ne fait aucune différence.
 */
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
  private jump: HTMLDivElement;
  private car: HTMLDivElement;
  private driving = false;
  private stickVector = { x: 0, y: 0 };

  /** À appeler à chaque image : adapte les libellés et le rôle du joystick (à pied ou au volant). */
  setDriving(driving: boolean): void {
    if (driving === this.driving) return;
    this.driving = driving;
    this.gas.textContent = driving ? 'ACCÉLÉRER' : 'AVANCER';
    this.jump.textContent = driving ? 'FREIN À MAIN' : 'SAUTER';
    this.car.textContent = driving ? 'SORTIR' : 'MONTER';
    this.applyStick();
  }

  constructor(private input: Input, private onFirstTouch: () => void) {
    this.root.className = 'touch';
    this.stick.className = 'touch-stick';
    this.knob.className = 'touch-knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);
    this.gas = this.button('AVANCER', 'touch-gas', 'KeyW', 'hold');
    this.jump = this.button('SAUTER', 'touch-jump', 'Space', 'hold');
    this.car = this.button('MONTER', 'touch-car', 'KeyF', 'tap');
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
    b.textContent = label;
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
