/** Browser notifications for long runs: asked for only when the user starts one, used only if the tab is hidden. */
export function askToNotify() {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // not supported (e.g. some mobile browsers): the in-app progress view is enough
  }
}

export function notifyDone(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body, icon: '/favicon.png' })
  } catch {
    // ignore
  }
}
