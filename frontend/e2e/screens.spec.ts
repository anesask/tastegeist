import { expect, test, type Page } from '@playwright/test'

// Visit as a returning user who has already closed the storage notice (tested on its own below).
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes('storage notice')) await page.addInitScript(() => localStorage.setItem('tg-storage-notice', '1'))
})

const SHOTS = process.env.SHOTS_DIR ?? 'test-results/shots'

// Fail on any uncaught error or console error on a screen.
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_ABORTED/.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(800)
  await page.screenshot({
    path: `${SHOTS}/${project}-${name}.png`,
    fullPage: false,
  })
}

const screens: { name: string; path: string; expectText: RegExp }[] = [
  { name: '01-landing', path: '/', expectText: /Many tastes/i },
  {
    name: '02-pricing',
    path: '/pricing',
    expectText: /without the agency invoice/i,
  },
  {
    name: '03-campaigns',
    path: '/app',
    expectText: /Sample campaigns/i,
  },
  {
    name: '04-wizard',
    path: '/app/new',
    expectText: /What are you promoting/i,
  },
  {
    name: '05-brief',
    path: '/app/c/eu/brief',
    expectText: /Who the taste skews to/i,
  },
  {
    name: '06-zones',
    path: '/app/c/eu/zones',
    expectText: /synthetic locals react/i,
  },
  {
    name: '07-dossier',
    path: '/app/c/eu/zones?g=Noord&dossier=1',
    expectText: /Geist dossier/i,
  },
  {
    name: '07b-culture',
    path: '/app/c/eu/culture?g=Noord&vs=De%20Pijp',
    expectText: /What Noord listens to/i,
  },
  {
    name: '07c-culture-de',
    path: '/app/c/de/culture',
    expectText: /What it watches/i,
  },
  {
    name: '08-creatives',
    path: '/app/c/eu/creatives?g=Noord',
    expectText: /The séance/i,
  },
  {
    name: '09-plan',
    path: '/app/c/eu/plan',
    expectText: /Budget by taste zone/i,
  },
  {
    name: '10-results',
    path: '/app/c/eu/results',
    expectText: /What it could mean/i,
  },
  { name: '11-us-zones', path: '/app/c/us/zones', expectText: /Silver Lake/i },
  {
    name: '11b-de-zones',
    path: '/app/c/de/zones',
    expectText: /Germany isn't one market/i,
  },
  {
    name: '11c-de-results',
    path: '/app/c/de/results',
    expectText: /What it could mean/i,
  },
  { name: '12-lib-zones', path: '/app/zones', expectText: /Taste Zones/i },
  {
    name: '13-lib-creatives',
    path: '/app/creatives',
    expectText: /Creatives/i,
  },
  {
    name: '14-lib-zones',
    path: '/app/audiences',
    expectText: /Taste Zones/i,
  },
  { name: '15-lib-plans', path: '/app/plans', expectText: /Media Plans/i },
  { name: '16-lib-insights', path: '/app/insights', expectText: /Insights/i },
  { name: '16b-report', path: '/report/eu', expectText: /The finding/i },
  { name: '16c-report-de', path: '/report/de', expectText: /The plan/i },
  { name: '20-imprint', path: '/imprint', expectText: /Provider/i },
  { name: '21-privacy', path: '/privacy', expectText: /Who is responsible/i },
  { name: '22-terms', path: '/terms', expectText: /What the results are/i },
  {
    name: '23-cookies',
    path: '/cookies',
    expectText: /Why there is no consent banner/i,
  },
  { name: '17-404', path: '/this-does-not-exist', expectText: /no geist/i },
  {
    name: '18-404-campaign',
    path: '/app/c/nope/zones',
    expectText: /no geist/i,
  },
]

for (const s of screens) {
  test(`screen ${s.name}`, async ({ page }, info) => {
    const errors = watchErrors(page)
    await page.goto(s.path)
    // Match inside the page content, not the (possibly hidden) sidebar navigation.
    await expect(page.locator('main, body > div').getByText(s.expectText).filter({ visible: true }).first()).toBeVisible()
    // No horizontal page scroll at any width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1)
    await shot(page, s.name, info.project.name)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('wizard validates step 1', async ({ page }) => {
  await page.goto('/app/new')
  await page.evaluate(() => localStorage.removeItem('tg-draft'))
  await page.reload()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Give the product a name')).toBeVisible()
})

test('tabs navigate inside a campaign', async ({ page }) => {
  await page.goto('/app/c/eu/brief')
  for (const tab of ['Taste Zones', 'Creatives', 'Media Plan', 'Results', 'Brief']) {
    await page
      .getByRole('navigation', { name: 'Campaign sections' })
      .getByRole('link', { name: new RegExp(tab) })
      .click()
    await expect(page).toHaveURL(/\/app\/c\/eu\//)
  }
})

test('exports download', async ({ request }) => {
  for (const fmt of ['xlsx', 'pdf', 'json']) {
    const r = await request.get(`/api/campaigns/eu/export.${fmt}`)
    expect(r.status(), fmt).toBe(200)
    expect((await r.body()).length, fmt).toBeGreaterThan(1000)
  }
})

test('wizard example fills a complete brief', async ({ page }) => {
  await page.goto('/app/new')
  await page.getByRole('button', { name: /Fill in a sample/i }).click()
  await expect(page.getByPlaceholder('e.g. Lumen')).toHaveValue('Saudade')
})

test('culture drill-down opens a title', async ({ page }) => {
  await page.goto('/app/c/eu/culture?g=De%20Pijp')
  // The cover grid; the image pie's SVG slices are reachable by keyboard and tested by hand.
  await page
    .locator('section', { hasText: 'What it watches' })
    .getByRole('button', { name: /^Suits/ })
    .first()
    .click()
  await expect(page.getByRole('complementary', { name: 'Suits' })).toBeVisible()
  await expect(page.getByText('Where it over-indexes')).toBeVisible()
  await expect(page.getByText('How the lift is worked out')).toBeVisible()
  const drawer = page.getByRole('complementary', { name: 'Suits' })
  await expect(drawer.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('De Pijp')
  await expect(drawer.getByText('Goes with')).toBeVisible({ timeout: 15000 })
  // Cross-links: the zone map narrows to this title, the concepts highlight the lines that cite it.
  await drawer
    .getByRole('link', { name: /see the lines that cite it/ })
    .first()
    .click()
  await expect(page.getByText(/Highlighted: the \d+ lines? that cite/)).toBeVisible()
})

test('the zone map narrows to one title', async ({ page }) => {
  await page.goto('/app/c/eu/zones?g=De%20Pijp&e=E73FD3EB-E55D-4DFA-988C-19410202F985&n=Suits')
  await expect(page.locator('text=/for Suits only/ >> visible=true').first()).toBeVisible({ timeout: 15000 })
})

test('creatives brief the makers on sound, look and tone', async ({ page }) => {
  await page.goto('/app/c/eu/creatives?g=Noord')
  const s = page.locator('section[aria-labelledby=makers-brief]')
  await expect(s.getByText('Tone of voice')).toBeVisible({ timeout: 15000 })
  await s.getByRole('radio', { name: 'This palette' }).click()
  await expect(s.getByRole('radio', { name: 'This palette' })).toHaveAttribute('aria-checked', 'true')
})

test('creatives show each line beside the titles it cites', async ({ page }) => {
  await page.goto('/app/c/eu/creatives')
  const s = page.locator('section[aria-labelledby=data-to-line]')
  await expect(s.getByText(/lines carry a citation/)).toBeVisible()
  await expect(s.getByText(/in the ledger/).first()).toBeVisible()
})

test('footer links to every legal page', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer')
  for (const name of ['Imprint', 'Privacy', 'Terms', 'Cookies and storage']) await expect(footer.getByRole('link', { name })).toBeVisible()
})

test('delete my data erases this workspace only', async ({ page }) => {
  await page.goto('/privacy')
  await page.getByRole('button', { name: /Delete my data/i }).click()
  await page.getByRole('button', { name: /Yes, delete everything/i }).click()
  await expect(page.getByText(/were deleted/i)).toBeVisible()
  await page.goto('/app')
  await expect(page.getByText(/One Amsterdam/i).first()).toBeVisible()
})

test('storage notice shows once and closes', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByRole('region', { name: 'Storage notice' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice).toBeHidden()
  await page.reload()
  await expect(notice).toBeHidden()
})

test('wizard says when Qloo knows no such place', async ({ page }) => {
  await page.goto('/app/new')
  await page.getByRole('button', { name: /Fill in a sample/i }).click()
  // The example looks its city up on Qloo before it fills the form.
  await expect(page.getByRole('textbox', { name: /Product name/ })).toHaveValue('Saudade', { timeout: 30000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  // Step 2 appears once the product read from step 1 settles, which can take a while under parallel load.
  const search = page.getByPlaceholder(/Search a (city|country)/)
  await expect(search).toBeVisible({ timeout: 30000 })
  await search.fill('Qzxqzxville')
  await expect(page.getByText(/No place found on Qloo/)).toBeVisible({
    timeout: 15000,
  })
})

test('trust pages and the agent trace render', async ({ page }) => {
  for (const [path, text] of [
    ['/methodology', /How Tastegeist works/],
    ['/faq', /Questions, answered/],
    ['/about', /Why Tastegeist exists/],
    ['/security', /Reporting a vulnerability/],
    ['/changelog', /What's new/],
    ['/accessibility', /Known gaps/],
    ['/app/c/eu/trace', /What the agent decided/],
  ] as const) {
    await page.goto(path)
    await expect(page.getByText(text).first()).toBeVisible()
  }
})

test('the tour walks through the Amsterdam demo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Take the 1-minute tour/i }).click()
  const tour = page.getByRole('dialog', { name: 'Product tour' })
  await expect(tour.getByText('One city, two audiences')).toBeVisible()
  await tour.getByRole('button', { name: /Next/ }).click()
  await expect(tour.getByText('What a place is made of')).toBeVisible()
  await expect(page).toHaveURL(/\/culture/)
  await tour.getByRole('button', { name: 'End the tour' }).click()
  await expect(tour).toBeHidden()
})

test('a running campaign shows results as they land', async ({ page }) => {
  // A recorded run: the campaign reports "running" and the stream replays partial results.
  await page.route('**/api/campaigns/eu', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), status: 'running', running: true, result: null } })
  })
  const ev = (data: object) => `event: partial
data: ${JSON.stringify({ type: 'partial', ...data })}

`
  await page.route('**/api/campaigns/eu/events', (route) =>
    route.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body:
        ev({
          stage: 'zones',
          groups: [{ key: 'z1', kind: 'zone', label: 'Amsterdam + Berlin', points: [{ name: 'Amsterdam', center: [4.9, 52.37] }], top: [] }],
        }) +
        ev({ stage: 'geists', groups: [{ key: 'z1', name: 'The Late Night Wanderers' }] }) +
        ev({ stage: 'concepts', key: 'z1', headlines: ['Every commute is a loop. Break it.'] }) +
        ev({ stage: 'seance', key: 'z1', headline: 'Every commute is a loop. Break it.', stops: 7, size: 8, base_stops: 0 }),
    }),
  )
  await page.goto('/app/c/eu/zones')
  const live = page.getByRole('region', { name: 'Results so far' })
  await expect(live.getByText('The Late Night Wanderers').last()).toBeVisible()
  await expect(live.getByText(/Every commute is a loop/)).toBeVisible()
  await expect(live.getByText('7 of 8')).toBeVisible()
})

test('settings save the brand kit, agency and defaults', async ({ page }) => {
  await page.goto('/app/settings')
  await page.getByPlaceholder('e.g. Lumen', { exact: true }).fill('Lumen')
  await page.getByPlaceholder('e.g. North Studio').fill('North Studio')
  await page.getByRole('button', { name: 'USD', exact: true }).click()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  await page.reload()
  await expect(page.getByPlaceholder('e.g. North Studio')).toHaveValue('North Studio')
  // A fresh brief starts from the defaults.
  await page.goto('/app/new')
  await page.evaluate(() => localStorage.removeItem('tg-draft'))
  await page.reload()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tg-draft') ?? '{}').currency)).toBe('USD')
})

test('the media plan has reach, a cultural calendar and a measurement plan', async ({ page }) => {
  await page.goto('/app/c/eu/plan')
  await expect(page.getByRole('heading', { name: 'Impressions and reach' })).toBeVisible()
  await expect(page.getByText(/Blended CPM/)).toBeVisible()
  await expect(page.getByText('Christmas Day')).toBeVisible({ timeout: 20000 })
  await page.getByLabel('Impressions, arm A').fill('50000')
  await page.getByLabel('Clicks, arm A').fill('700')
  await page.getByLabel('Impressions, arm B').fill('50000')
  await page.getByLabel('Clicks, arm B').fill('500')
  await expect(page.getByText(/A wins: move the budget to A/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy as Markdown' })).toBeVisible()
})

test('a concept downloads as a story-format PNG', async ({ page }) => {
  await page.goto('/app/c/eu/creatives?g=Noord')
  const s = page.locator('section[aria-labelledby=ad-formats]')
  await s.scrollIntoViewIfNeeded()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), s.getByRole('button', { name: 'Download 9:16 PNG' }).click()])
  expect(dl.suggestedFilename()).toMatch(/9x16\.png$/)
})

test('the ops view asks for the admin token', async ({ page }) => {
  await page.goto('/ops')
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible()
  await page.getByLabel('Admin token').fill('not-the-token')
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText(/Wrong token/)).toBeVisible()
})

test('charts and the map have text versions for screen readers', async ({ page }) => {
  await page.goto('/app/c/eu/brief')
  // A category chart carries its numbers as a table, captioned with the chart's label.
  await expect(page.locator('table caption', { hasText: 'Audience affinity by age band and gender' })).toHaveCount(1)
  await page.goto('/app/c/eu/zones')
  await expect(page.getByRole('img', { name: /Map of \d+ audiences/ }).first()).toBeAttached()
})

test('settings choose the AI style; bring-your-own is announced', async ({ page }) => {
  await page.goto('/app/settings')
  const ai = page.getByRole('radiogroup', { name: 'AI provider' })
  await expect(ai.getByRole('radio', { checked: true })).toContainText('Tastegeist AI')
  await expect(ai.getByText('Coming soon')).toHaveCount(6)
  await page.getByRole('button', { name: 'Understated' }).click()
  await page.getByPlaceholder(/Red Bull/).fill('Red Bull, Monster')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Understated' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder(/Red Bull/)).toHaveValue('Red Bull, Monster')
})

test('responsible use: composite personas and a written policy', async ({ page }) => {
  await page.goto('/app/c/eu/creatives')
  await expect(page.getByText(/^Composite · /).first()).toBeVisible()
  await page.goto('/methodology#responsible-use')
  await expect(page.getByRole('heading', { name: 'Responsible use' })).toBeVisible()
  await expect(page.getByText(/No zone is named, described or targeted by ethnicity/)).toBeVisible()
})

test('the status line says when Qloo is down', async ({ page }) => {
  await page.route('**/api/status', (route) => route.fulfill({ json: { app: 'ok', qloo: 'down', model: 'ok' } }))
  await page.goto('/app')
  await expect(page.getByRole('status').filter({ hasText: 'Qloo, our taste data provider, is not answering' })).toBeVisible()
})

test('the brief studio warns before a run when Qloo has no data for a place', async ({ page }) => {
  await page.route('**/api/preview', (route) =>
    route.fulfill({
      json: {
        places: [
          { name: 'Giethoorn', center: [6.08, 52.74], top: [], distinct: 0, read: 0, coverage: 'none' },
          { name: 'Berlin', center: [13.4, 52.52], top: [], distinct: 60, read: 60, coverage: 'ok' },
        ],
        overlap: [],
        heat: [],
      },
    }),
  )
  await page.goto('/app/new')
  await page.getByRole('button', { name: /Fill in a sample/i }).click()
  await expect(page.getByRole('textbox', { name: /Product name/ })).toHaveValue('Saudade', { timeout: 30000 })
  // The preview reads places once step 1 has resolved the product's references.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Qloo has no taste data for Giethoorn' })).toBeVisible({ timeout: 30000 })
})

test('a running campaign shows how long is left', async ({ page }) => {
  await page.route('**/api/run-stats', (route) => route.fulfill({ json: { runs: 4, p50: 150, p95: 210, steps: { concepts: 0.11, seance: 0.66 } } }))
  await page.route('**/api/campaigns/eu', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), status: 'running', running: true, result: null } })
  })
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  await page.route('**/api/campaigns/eu/events', (route) =>
    route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: ev('step', { step: 'concepts', t: 16, text: 'Writing three concepts' }) }),
  )
  await page.goto('/app/c/eu/zones')
  await expect(page.getByText(/minutes left|seconds left/)).toBeVisible()
  await expect(page.getByText(/measured on 4 runs, 95% finish within 4 minutes/)).toBeVisible()
})
