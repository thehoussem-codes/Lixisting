import { useEffect, useRef, useState } from 'react';
import { Game } from '../engine/Game';
import type { WorldPlace } from '../world/WorldData';
import { Hud } from './Hud';

/** Racine de l'interface : un conteneur pour la 3D, et le HUD par-dessus. */
export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [places, setPlaces] = useState<WorldPlace[]>([]);
  const [zone, setZone] = useState('');
  const [speed, setSpeed] = useState<number | null>(null);
  const [gear, setGear] = useState('');
  const [fps, setFps] = useState(0);
  const [location, setLocation] = useState('');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const game = new Game(containerRef.current!, {
      onStatus: setStatus,
      onPlaces: setPlaces,
      onLocation: (line, more) => { setLocation(line); setDetail(more); },
      onHud: (z, s, f, g) => { setZone(z); setSpeed(s === null ? null : Math.round(s)); setFps(f); setGear(g ?? ''); },
    });
    game.start();
    return () => game.dispose();
  }, []);

  return (
    <>
      <div ref={containerRef} className="game-view" />
      <Hud status={status} places={places} zone={zone} speed={speed} gear={gear} fps={fps} location={location} detail={detail} />
    </>
  );
}
