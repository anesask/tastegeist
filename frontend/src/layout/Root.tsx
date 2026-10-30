import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { StorageNotice } from '../components/Site'
import { trackView } from '../lib/telemetry'

/** Every new page opens at the top; a link with a #hash scrolls to its target instead. */
export function Root() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) return void requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    window.scrollTo(0, 0)
    document.getElementById('main')?.scrollTo(0, 0)
  }, [pathname, hash])
  useEffect(() => trackView(pathname), [pathname])
  return (
    <>
      <Outlet />
      <StorageNotice />
    </>
  )
}
