/** Mémorise le dernier champ de saisie actif pour permettre l'insertion de termes médicaux. */
let dernier: HTMLInputElement | HTMLTextAreaElement | null = null;

export function suivreFocus() {
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && ['text', 'search', ''].includes(t.type) && !t.closest('[data-no-insert]'))) {
      if (t.type !== 'search') dernier = t;
    }
  });
}

/** Insère un texte à la position du curseur dans le dernier champ actif (compatible React). */
export function insererTexte(texte: string): boolean {
  const el = dernier;
  if (!el || !document.contains(el) || el.disabled) return false;
  const debut = el.selectionStart ?? el.value.length;
  const fin = el.selectionEnd ?? el.value.length;
  const avant = el.value.slice(0, debut);
  const sep = avant && !/\s$/.test(avant) ? ' ' : '';
  const valeur = `${avant}${sep}${texte}${el.value.slice(fin)}`;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  const pos = debut + sep.length + texte.length;
  el.setSelectionRange(pos, pos);
  return true;
}
