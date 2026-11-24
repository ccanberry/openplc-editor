// RoboPLC: what the window SHOWS says RoboPLC, wherever the text came from -- component labels,
// board names ('OpenPLC Runtime v4' is an identifier in every saved project and in hals.json, so it
// stays OpenPLC there), toasts, the console, dialogs. One observer instead of a brand() call at each
// of ~125 places, so text added upstream later is covered too (user, 2026-11-24).
//
// Left alone: the code editors (Monaco owns its DOM; changing it would desync the model), input and
// textarea values (data the user types), and anything inside [data-keep-brand] -- the About panel's
// notice that RoboPLC is derived from OpenPLC v4, which the GPL-3.0 asks to be shown.
//
// Text nodes and the title / placeholder / aria-label / alt attributes are rewritten in place. React
// writes a text node again only when its own value changes, and the observer rewrites it again then.

const WORD = /\bOpenPLC\b/g
const HAS = /\bOpenPLC\b/
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'] as const
const SKIP = '.monaco-editor, [data-keep-brand], [contenteditable="true"], script, style, textarea'

const skipped = (el: Element | null): boolean => !!el && !!el.closest(SKIP)

export const brandText = (s: string): string => s.replace(WORD, 'RoboPLC')

function fixText(node: Text): void {
  const v = node.nodeValue
  if (v && HAS.test(v) && !skipped(node.parentElement)) node.nodeValue = brandText(v)
}

function fixAttrs(el: Element): void {
  if (skipped(el)) return
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v && HAS.test(v)) el.setAttribute(a, brandText(v))
  }
}

function fixTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    fixText(root as Text)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (skipped(el)) return
  fixAttrs(el)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) fixText(n as Text)
    else fixAttrs(n as Element)
  }
}

let observer: MutationObserver | null = null

/** Start the sweep on the whole document (idempotent). */
export function startBrandSweep(): void {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return
  fixTree(document.body)
  if (HAS.test(document.title)) document.title = brandText(document.title)
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') fixText(r.target as Text)
      else if (r.type === 'attributes') fixAttrs(r.target as Element)
      else r.addedNodes.forEach(fixTree)
    }
    if (HAS.test(document.title)) document.title = brandText(document.title)
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  })
}

/** Stop the sweep (tests; the window never stops it). */
export function stopBrandSweep(): void {
  observer?.disconnect()
  observer = null
}
