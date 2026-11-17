/**
 * Téléphone ou tablette : écran tactile sans souris (ou ?mobile=1 pour essayer sur ordinateur).
 * Le jeu passe alors en mode allégé (voir Game.ts, Trees.ts) et affiche les commandes tactiles.
 */
const params = new URLSearchParams(window.location.search);
export const MOBILE = params.get('mobile') === '1'
  || (params.get('mobile') !== '0' && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);
if (MOBILE) document.documentElement.classList.add('mobile');
