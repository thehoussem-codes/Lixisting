import { useEffect, useRef, useState } from 'react';
import { Game } from '../engine/Game';
import type { WorldPlace } from '../world/WorldData';
import { Hud } from './Hud';

/** Racine de l'interface : un conteneur pour la 3D, et le HUD par-dessus. */
export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [places, setPlaces] = useState<WorldPlace[]>([]);

  useEffect(() => {
    const game = new Game(containerRef.current!, { onStatus: setStatus, onPlaces: setPlaces });
    game.start();
    return () => game.dispose();
  }, []);

  return (
    <>
      <div ref={containerRef} className="game-view" />
      <Hud status={status} places={places} />
    </>
  );
}
