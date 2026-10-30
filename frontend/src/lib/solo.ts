/** Only one player sounds at a time: starting one (a mixtape, the film) pauses every other. */
const EVT = 'tg-solo'

export function claimSolo(id: string) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: id }))
}

/** Calls `onOther` whenever another player starts. Returns the unsubscribe. */
export function onSolo(id: string, onOther: () => void) {
  const h = (e: Event) => (e as CustomEvent<string>).detail !== id && onOther()
  window.addEventListener(EVT, h)
  return () => window.removeEventListener(EVT, h)
}
