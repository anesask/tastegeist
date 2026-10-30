import { useEffect } from 'react'

/**
 * Every page names itself in the browser tab ("Page · Tastegeist") and keeps its canonical URL on
 * tastegeist.app, so search engines index one address per page.
 */
export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Tastegeist` : 'Tastegeist: campaign planning by neighborhood, built on Qloo'
    const link = document.querySelector<HTMLLinkElement>('link[rel=canonical]')
    if (link) link.href = `https://tastegeist.app${location.pathname === '/' ? '/' : location.pathname}`
  }, [title])
}
