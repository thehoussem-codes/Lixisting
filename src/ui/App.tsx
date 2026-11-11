import { useEffect, useRef } from 'react';
import { Game } from '../engine/Game';
import { Hud } from './Hud';

/** Racine de l'interface : un conteneur pour la 3D, et le HUD par-dessus. */
export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Game(containerRef.current!);
    game.start();
    return () => game.dispose();
  }, []);

  return (
    <>
      <div ref={containerRef} className="game-view" />
      <Hud />
    </>
  );
}
