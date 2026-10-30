import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource/permanent-marker/latin-400.css'
import './index.css'
import { ToastProvider } from './components/ui'
import { AppShell } from './layout/AppShell'
import { Root } from './layout/Root'
import { Report } from './pages/Report'
import { Cookies, Imprint, Privacy, Terms } from './pages/Legal'
import { About, Accessibility, Changelog, Faq, Methodology, Security } from './pages/Trust'
import { Campaigns } from './pages/Campaigns'
import { Landing } from './pages/Landing'
import { Library } from './pages/Library'
import { NewCampaign } from './pages/NewCampaign'
import { Settings } from './pages/Settings'
import { Ops } from './pages/Ops'
import { NotFound, RouteError } from './pages/NotFound'
import { Pricing } from './pages/Pricing'
import { Workspace } from './pages/workspace/Workspace'
import { BriefTab } from './pages/workspace/BriefTab'
import { ZonesTab } from './pages/workspace/ZonesTab'
import { CultureTab } from './pages/workspace/CultureTab'
import { TraceTab } from './pages/workspace/TraceTab'
import { CreativesTab } from './pages/workspace/CreativesTab'
import { PlanTab } from './pages/workspace/PlanTab'
import { ResultsTab } from './pages/workspace/ResultsTab'
import { ThemeProvider } from './theme'
import { installErrorReporting } from './lib/telemetry'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/report/:id', element: <Report /> },
      { path: '/imprint', element: <Imprint /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/cookies', element: <Cookies /> },
      { path: '/methodology', element: <Methodology /> },
      { path: '/faq', element: <Faq /> },
      { path: '/about', element: <About /> },
      { path: '/security', element: <Security /> },
      { path: '/changelog', element: <Changelog /> },
      { path: '/accessibility', element: <Accessibility /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/ops', element: <Ops /> },
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: <Campaigns /> },
          { path: 'new', element: <NewCampaign /> },
          { path: 'audiences', element: <Navigate to="/app/zones" replace /> },
          { path: 'zones', element: <Library kind="zones" /> },
          { path: 'creatives', element: <Library kind="creatives" /> },
          { path: 'plans', element: <Library kind="plans" /> },
          { path: 'insights', element: <Library kind="insights" /> },
          { path: 'settings', element: <Settings /> },
          {
            path: 'c/:id',
            element: <Workspace />,
            children: [
              { index: true, element: <Navigate to="zones" replace /> },
              { path: 'brief', element: <BriefTab /> },
              { path: 'zones', element: <ZonesTab /> },
              { path: 'culture', element: <CultureTab /> },
              { path: 'creatives', element: <CreativesTab /> },
              { path: 'plan', element: <PlanTab /> },
              { path: 'results', element: <ResultsTab /> },
              { path: 'trace', element: <TraceTab /> },
              { path: '*', element: <NotFound inline /> },
            ],
          },
          { path: '*', element: <NotFound inline /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
