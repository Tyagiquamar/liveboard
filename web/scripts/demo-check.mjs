import { chromium } from 'playwright'

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:27441'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true })
const consoleErrors = []
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' })
check('login-picker-visible', await page.locator('button:has-text("@alice")').isVisible())
check('demo-note-visible', await page.locator('text=demo mode').first().isVisible().catch(() => false))

for (let i = 0; i < 8; i++) {
  await page.click('button:has-text("@alice")').catch(() => {})
  try {
    await page.waitForURL(/\/w\/.+\/board/, { timeout: 3000 })
    break
  } catch {
    /* hydrating */
  }
}
check('board-loads', /\/w\/.+\/board/.test(page.url()))
await page.locator('article').first().waitFor({ state: 'visible', timeout: 15000 })
const cardCount = await page.locator('article').count()
check('seeded-cards-render', cardCount >= 25, `${cardCount} cards`)
check('demo-banner-on-board', await page.locator('text=Demo mode —').isVisible())

// drag: move 'Rate-limit the auth endpoints' into In Progress
async function cardIn(colLabel, title) {
  return page
    .locator(`section[aria-label="${colLabel}"]`)
    .locator(`article[aria-label*="${title}"]`)
    .isVisible()
    .catch(() => false)
}
async function drag(title, colLabel) {
  const card = page.locator(`article[aria-label*="${title}"]`).first()
  await card.scrollIntoViewIfNeeded()
  const cardBox = await card.boundingBox()
  const targetBox = await page.locator(`section[aria-label="${colLabel}"]`).boundingBox()
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  const tx = targetBox.x + targetBox.width / 2
  const ty = targetBox.y + Math.min(targetBox.height - 40, 120)
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(cardBox.x + ((tx - cardBox.x) * i) / 12, cardBox.y + ((ty - cardBox.y) * i) / 12)
    await page.waitForTimeout(40)
  }
  await page.mouse.up()
}

const title = 'Rate-limit the auth endpoints'
check('pre-drag-in-todo', await cardIn('Todo column', title))
await drag(title, 'In Progress column')
await page.waitForTimeout(800)
check('post-drag-in-progress', await cardIn('In Progress column', title))

// second tab in the SAME context shares localStorage → storage-event sync
const page2 = await ctx.newPage()
await page2.setViewportSize({ width: 1440, height: 900 })
await page2.goto(page.url(), { waitUntil: 'networkidle' })
await page2.locator('article').first().waitFor({ state: 'visible', timeout: 15000 })
check('tab2-sees-drag-after-join', await cardIn.call(null, 'In Progress column', title) && (await (async () => {
  const p2 = page2
  return p2
    .locator('section[aria-label="In Progress column"]')
    .locator(`article[aria-label*="${title}"]`)
    .isVisible()
    .catch(() => false)
})()))

// live cross-tab: drag in tab1, tab2 must update without reload
const title2 = 'Structured logs with correlation ids'
const dragIn1 = async () => {
  const card = page.locator(`article[aria-label*="${title2}"]`).first()
  await card.scrollIntoViewIfNeeded()
  const cardBox = await card.boundingBox()
  const targetBox = await page.locator('section[aria-label="Todo column"]').boundingBox()
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  const tx = targetBox.x + targetBox.width / 2
  const ty = targetBox.y + Math.min(targetBox.height - 40, 120)
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(cardBox.x + ((tx - cardBox.x) * i) / 12, cardBox.y + ((ty - cardBox.y) * i) / 12)
    await page.waitForTimeout(40)
  }
  await page.mouse.up()
}
await dragIn1()
let liveSync = false
for (let i = 0; i < 20 && !liveSync; i++) {
  liveSync = await page2
    .locator('section[aria-label="Todo column"]')
    .locator(`article[aria-label*="${title2}"]`)
    .isVisible()
    .catch(() => false)
  if (!liveSync) await page2.waitForTimeout(500)
}
check('cross-tab-live-sync', liveSync)

// persistence across reload
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('article').first().waitFor({ state: 'visible', timeout: 15000 })
check(
  'persists-after-reload',
  await page
    .locator('section[aria-label="In Progress column"]')
    .locator(`article[aria-label*="${title}"]`)
    .isVisible()
    .catch(() => false)
)

check('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
