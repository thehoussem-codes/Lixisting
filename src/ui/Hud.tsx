/** Texte affiché par-dessus le jeu. */
export function Hud() {
  return (
    <div className="hud">
      <div className="hud-title">LIXITING</div>
      <div className="hud-help">
        Carte de test (pas encore Annaba)
        <br />
        Clic : capturer la souris · Souris : caméra · W A S D : marcher · Maj : courir · Échap : libérer la souris
      </div>
    </div>
  );
}
