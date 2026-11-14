# Sécurité et protection des données de santé

## Mesures implémentées

| Domaine | Mesure |
|---|---|
| Authentification | Mots de passe hachés (scrypt, sel aléatoire), politique de 10 caractères minimum, verrouillage 5 min après 5 échecs, limitation par IP |
| Sessions | Jeton aléatoire 256 bits, stocké haché ; cookie `HttpOnly`, `SameSite=Strict`, `Secure` en production ; expiration après 30 min d'inactivité et 12 h maximum ; écran de reconnexion sans perte de saisie |
| Droits | Rôles administrateur, médecin, interne (sans validation finale), lecture seule ; contrôles côté serveur |
| CSRF | En-tête `X-Requested-With` obligatoire + vérification de l'origine sur toute requête modifiante |
| Chiffrement au repos | Identité et contenu des observations chiffrés en AES-256-GCM (clé `OBS_DATA_KEY`) |
| En-têtes HTTP | CSP stricte (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, HSTS, `Cache-Control: no-store` sur l'API |
| Traçabilité | Journal d'audit (connexions, consultations, modifications, validations, exports) consultable par l'administrateur |
| Intégrité | Verrou optimiste, versions conservées à chaque validation, archivage logique (pas de suppression physique) |
| Confidentialité | Aucun appel à un service externe : toute « intelligence » (rappels, scores, rédaction) est locale et déterministe |

## À mettre en œuvre lors d'un déploiement réel

- **Hébergement certifié** pour les données de santé selon la réglementation applicable
  (en France : hébergeur certifié HDS et RGPD ; en Algérie : loi n° 18-07 relative à la protection des
  personnes physiques dans le traitement des données à caractère personnel et autorisation de l'ANPDP).
- HTTPS obligatoire (reverse proxy TLS), `SECURE_COOKIES=1`, `TRUST_PROXY` configuré.
- Clé `OBS_DATA_KEY` dans un coffre de secrets, sauvegardée **séparément** des sauvegardes de la base.
- Sauvegardes chiffrées et testées, politique de conservation, procédure de réversibilité.
- Intégration à l'annuaire de l'établissement (SSO / carte CPS) et authentification forte si exigée.
- Analyse d'impact (AIPD), registre des traitements, information des patients.
- L'outil n'est pas un dispositif médical : il ne pose pas de diagnostic et ne prescrit pas ; toute
  évolution vers une aide à la décision doit faire l'objet d'une évaluation réglementaire.
