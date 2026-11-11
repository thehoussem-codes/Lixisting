import type { WorldPlace } from '../world/WorldData';

/** Texte affiché par-dessus le jeu. */
export function Hud({ status, places }: { status: string; places: WorldPlace[] }) {
  return (
    <>
      <div className="hud">
        <div className="hud-title">LIXITING</div>
        <div className="hud-help">
          Clic : capturer la souris · Souris : caméra · W A S D : marcher · Maj : courir · Espace : sauter · F : monter en voiture / descendre · Échap : libérer la souris
          <br />
          {status}
        </div>
      </div>
      {places.length > 0 && (
        <div className="hud hud-places">
          <div className="hud-places-title">Aller à (touches 1 à {places.length})</div>
          {places.map((place, i) => (
            <div key={place.name}>{i + 1} · {place.name}</div>
          ))}
        </div>
      )}
      <div className="hud hud-credit">Données cartographiques © contributeurs OpenStreetMap</div>
    </>
  );
}
