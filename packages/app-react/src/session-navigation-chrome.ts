const owners = new WeakMap<Element, HTMLElement>()

/** Only mounted host controls can exclude their feedback from transcript text mapping. */
export function registerSessionNavigationChrome(root: HTMLElement, chrome: HTMLElement): () => void {
  if (root !== chrome && root.contains(chrome)) owners.set(chrome, root)
  return () => {
    if (owners.get(chrome) === root) owners.delete(chrome)
  }
}
export function isSessionNavigationChrome(element: Element): boolean {
  const root = owners.get(element)
  return root !== undefined && root.contains(element)
}
