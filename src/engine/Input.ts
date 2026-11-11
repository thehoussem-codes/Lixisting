/**
 * Clavier + souris.
 * On lit la position physique des touches (event.code), donc W A S D
 * correspond à Z Q S D sur un clavier AZERTY sans rien changer.
 */
export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('click', this.onClick);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Mouvement de souris accumulé depuis le dernier appel. */
  consumeMouse(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('click', this.onClick);
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => { this.keys.add(e.code); };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); };
  private onClick = () => { void this.element.requestPointerLock(); };
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.element) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
}
