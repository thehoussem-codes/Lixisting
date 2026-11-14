/**
 * Sons du jeu, fabriqués en direct (aucun fichier audio à télécharger).
 * Routage : moteur et pneus -> bus « effets » -> bus général, avec de la marge pour ne jamais saturer.
 * Le navigateur n'autorise le son qu'après une première action du joueur : `unlock()` est appelé à la première touche.
 */
export class Sound {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private oscillators: OscillatorNode[] = [];
  private skidGain!: GainNode;
  muted = false;

  unlock(): void {
    if (this.context) { void this.context.resume(); return; }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const ctx = this.context = new Context();
    this.master = ctx.createGain();
    this.master.gain.value = 0.3; // marge : la somme des sons reste loin de la saturation
    const limiter = ctx.createDynamicsCompressor(); // filet de sécurité, pas un réglage de mixage
    this.master.connect(limiter).connect(ctx.destination);
    const effects = ctx.createGain();
    effects.connect(this.master);

    // Moteur : trois ondes accordées (fondamentale, octave grave, quinte) dans un filtre qui s'ouvre avec le régime.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 1.2;
    this.engineFilter.connect(this.engineGain).connect(effects);
    for (const [type, level] of [['sawtooth', 0.5], ['square', 0.3], ['sawtooth', 0.22]] as [OscillatorType, number][]) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = type;
      gain.gain.value = level;
      oscillator.connect(gain).connect(this.engineFilter);
      oscillator.start();
      this.oscillators.push(oscillator);
    }

    // Crissement de pneus : bruit filtré en bande étroite.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer; noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1700; band.Q.value = 5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    noise.connect(band).connect(this.skidGain).connect(effects);
    noise.start();
  }

  /** Klaxon d'une voiture de la circulation : deux notes, plus faible quand elle est loin. */
  honk(distance: number): void {
    const ctx = this.context;
    if (!ctx || this.muted || distance > 60) return;
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), now = ctx.currentTime;
    filter.type = 'lowpass'; filter.frequency.value = 2200;
    const level = 0.22 * Math.max(0.15, 1 - distance / 60);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.02);
    gain.gain.setValueAtTime(level, now + 0.42);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    filter.connect(gain).connect(this.master);
    for (const frequency of [415, 494]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'square'; oscillator.frequency.value = frequency;
      oscillator.connect(filter); oscillator.start(now); oscillator.stop(now + 0.52);
    }
  }

  /** Bruit de choc : un coup sourd filtré, plus fort et plus grave quand le choc est violent. */
  crash(strength: number): void {
    const ctx = this.context;
    if (!ctx || this.muted || strength < 1.5) return;
    const length = 0.35, buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 500 + Math.min(1, strength / 15) * 1500;
    gain.gain.value = Math.min(1, 0.25 + strength / 12) * 0.8;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  /**
   * rpm : régime de 0 (ralenti) à 1 (zone rouge). throttle : 0 à 1. skid : 0 à 1.
   * Passer null quand le joueur est à pied : le moteur se tait.
   */
  update(engine: { rpm: number; throttle: number; skid: number; small: boolean } | null): void {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime, smooth = 0.06;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.3, now, 0.05);
    if (!engine) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.15);
      this.skidGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }
    // Un petit moteur de deux-roues chante plus haut qu'un moteur de voiture.
    const base = (engine.small ? 62 : 38) + engine.rpm * (engine.small ? 190 : 125);
    this.oscillators[0].frequency.setTargetAtTime(base, now, smooth);
    this.oscillators[1].frequency.setTargetAtTime(base / 2, now, smooth);
    this.oscillators[2].frequency.setTargetAtTime(base * 1.5, now, smooth);
    this.engineFilter.frequency.setTargetAtTime(260 + engine.rpm * 1500 + engine.throttle * 700, now, smooth);
    // Volume du moteur réduit de moitié environ (retour de Houssem : trop fort).
    this.engineGain.gain.setTargetAtTime(0.09 + engine.throttle * 0.16 + engine.rpm * 0.07, now, smooth);
    this.skidGain.gain.setTargetAtTime(engine.skid * 0.5, now, 0.05);
  }
}
