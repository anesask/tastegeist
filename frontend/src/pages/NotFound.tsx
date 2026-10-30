import { useTitle } from '../lib/title'
import { ArrowLeft, FolderOpen, Play, RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { LinkButton, buttonClass } from '../components/ui'
import { reportError } from '../lib/telemetry'
import { SiteFooter, SiteHeader } from '../components/Site'

/** 404, editorial: never a dead end (story H5). `inline` renders inside the app shell. */
export function NotFound({ inline = false }: { inline?: boolean }) {
  useTitle('Page not found')
  const body = (
    <div className="mx-auto flex max-w-3xl flex-col items-start px-6 py-20 md:py-28">
      <div className="kicker">Error 404</div>
      <h1 className="mt-4 font-display text-hero leading-[0.95] tracking-tight">
        This place has
        <br />
        no geist <span className="italic text-mute">(yet).</span>
      </h1>
      <p className="mt-6 max-w-md text-lg text-mute">The page or campaign you were looking for doesn't exist, or it lives in another browser's workspace.</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <LinkButton to="/app" variant="primary">
          <FolderOpen size={16} /> Go to campaigns
        </LinkButton>
        <LinkButton to="/app/c/eu/zones">
          <Play size={16} /> Open a demo
        </LinkButton>
        <LinkButton to="/" variant="ghost">
          <ArrowLeft size={16} /> Home
        </LinkButton>
      </div>
    </div>
  )
  if (inline) return body
  return (
    <div className="min-h-full bg-bg">
      <SiteHeader />
      {body}
      <SiteFooter />
    </div>
  )
}

/** Shown when a page crashes: reported to the ops log, with a way out instead of a blank screen. */
export function RouteError() {
  const err = useRouteError() as { message?: string; stack?: string } | undefined
  useEffect(() => {
    if (!isRouteErrorResponse(err)) reportError(err?.message ?? String(err), err?.stack)
  }, [err])
  if (isRouteErrorResponse(err) && err.status === 404) return <NotFound />
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center px-6 py-20">
      <div className="kicker">Something broke</div>
      <h1 className="mt-4 font-display text-statement leading-[1]">This page lost its geist.</h1>
      <p className="mt-4 max-w-md text-ink-2">The error has been reported. Your campaigns are safe; reload the page or go back to your campaigns.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => location.reload()} className={buttonClass('primary', 'md')}>
          <RotateCw size={16} /> Reload
        </button>
        <a href="/app" className={buttonClass('secondary', 'md')}>
          <FolderOpen size={16} /> Campaigns
        </a>
      </div>
    </div>
  )
}
