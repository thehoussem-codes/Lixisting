import type { WorldPlace } from '../world/WorldData';

interface HudProps { status: string; places: WorldPlace[]; zone: string; speed: number | null; gear: string; fps: number; location: string; detail: string | null }

/** Texte affiché par-dessus le jeu. */
export function Hud({ status, places, zone, speed, gear, fps, location, detail }: HudProps) {
  return (
    <>
      <div className="hud">
        <div className="hud-title">LIXITING</div>
        <div className="hud-help">
          Clic : souris · W A S D : bouger · Maj : courir · Espace : sauter / frein à main · F : voiture / bateau / avion · M : carte
          <br />
          {status} · {fps} images/s · version de {new Date(Number(__BUILD_ID__)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{location && ` · ${location}`}
        </div>
      </div>
      {places.length > 0 && (
        <div className="hud hud-places">
          M : carte, puis clic sur un lieu · touches 1 à 9 · 0 : aéroport
          {gear.startsWith('alt.') && <><br />Avion : W / S poussée · A / D virer · ↓ cabrer · ↑ piquer · Espace : freins</>}
        </div>
      )}
      {detail && <pre className="hud-inspect">{detail}</pre>}
      <div className="hud hud-zone">
        {speed !== null && <div className="hud-speed">{speed} <span>km/h{gear ? (/^[0-9R]$/.test(gear) ? ` · rapport ${gear}` : ` · ${gear}`) : ''}</span></div>}
        <div className="hud-zone-name">{zone}</div>
      </div>
      <div className="hud hud-credit">© contributeurs OpenStreetMap · Overture Maps (Microsoft, Google) · ESA WorldCover · EMODnet</div>
    </>
  );
}
