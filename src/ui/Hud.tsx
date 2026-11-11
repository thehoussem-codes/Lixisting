import type { WorldPlace } from '../world/WorldData';

interface HudProps { status: string; places: WorldPlace[]; zone: string; speed: number | null; fps: number }

/** Texte affiché par-dessus le jeu. */
export function Hud({ status, places, zone, speed, fps }: HudProps) {
  return (
    <>
      <div className="hud">
        <div className="hud-title">LIXITING</div>
        <div className="hud-help">
          Clic : souris · W A S D : bouger · Maj : courir · Espace : sauter / frein à main · F : voiture · M : carte
          <br />
          {status} · {fps} images/s
        </div>
      </div>
      {places.length > 0 && (
        <div className="hud hud-places">
          M : carte, puis clic sur un lieu · touches 1 à 9
        </div>
      )}
      <div className="hud hud-zone">
        {speed !== null && <div className="hud-speed">{speed} <span>km/h</span></div>}
        <div className="hud-zone-name">{zone}</div>
      </div>
      <div className="hud hud-credit">Données cartographiques © contributeurs OpenStreetMap</div>
    </>
  );
}
