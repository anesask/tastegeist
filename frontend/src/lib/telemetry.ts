/**
 * Privacy-friendly telemetry (backend/app/ops.py): a page count per path and day, and error reports.
 * No cookies, no ids, nothing stored in the browser. Skipped under Do Not Track and in automated browsers.
 */
const off = () => typeof navigator === 'undefined' || navigator.doNotTrack === '1' || navigator.webdriver

function send(path: string, body: object) {
  if (off()) return
  const data = JSON.stringify(body)
  try {
    if (!navigator.sendBeacon?.(path, new Blob([data], { type: 'application/json' })))
      fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, keepalive: true }).catch(() => {})
  } catch {
    // telemetry never breaks the page
  }
}

export function trackView(path: string) {
  send('/api/telemetry/view', { path })
}

let reported = 0
export function reportError(message: string, stack?: string) {
  if (reported++ > 10) return // one broken page shouldn't flood the log
  send('/api/telemetry/error', { message: message.slice(0, 500), stack: (stack ?? '').slice(0, 3000), path: location.pathname })
}

/** Catch what nothing else catches. Call once at startup. */
export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.message || 'Error', e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined
    reportError(r?.message ?? String(e.reason), r?.stack)
  })
}
