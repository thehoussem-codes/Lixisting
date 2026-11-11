import type { WorldPlace } from '../world/WorldData';

/** Texte affiché par-dessus le jeu. */
export function Hud({ status, places }: { status: string; places: WorldPlace[] }) {
  return (
    <>
      <div className="hud">
        <div className="hud-title">LIXITING</div>
        <div className="hud-help">
          Clic : capturer la souris · Souris : caméra · W A S D : marcher · Maj : courir · Espace : sauter · F : monter en voiture / descendre · M : carte · Échap : libérer la souris
          <br />
          {status}
        </div>
      </div>
      {places.length > 0 && (
        <div className="hud hud-places">
          <div className="hud-places-title">Aller à</div>
          <div>M : ouvrir la carte, puis cliquer sur un lieu</div>
          <div>Touches 1 à 9 : les 9 premiers des {places.length} lieux</div>
        </div>
      )}
      <div className="hud hud-credit">Données cartographiques © contributeurs OpenStreetMap</div>
    </>
  );
}
