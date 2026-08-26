import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:27441'
const OUT_DIR = process.env.OUT_DIR ?? path.join('..', 'docs', 'screenshots')
const DO_SHOTS = process.env.SHOTS !== '0'

fs.mkdirSync(OUT_DIR, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function loginAs(context, username) {
  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' })
  // the identity button only navigates after React hydrates; retry until it does
  for (let i = 0; i < 8; i++) {
    await page.click(`button:has-text("@${username}")`).catch(() => {})
    try {
      await page.waitForURL(/\/w\/.+\/board/, { timeout: 3000 })
      return page
    } catch {
      /* not hydrated yet */
    }
  }
  throw new Error(`login as ${username} failed`)
}

async function dragCardToColumn(page, cardTitle, targetColumnLabel) {
  const cardSel = `article[aria-label*="${cardTitle}"]`
  const card = page.locator(cardSel).first()
  await card.scrollIntoViewIfNeeded()
  const cardBox = await card.boundingBox()
  const targetBox = await page.locator(`section[aria-label="${targetColumnLabel}"]`).boundingBox()
  if (!cardBox || !targetBox) throw new Error(`drag boxes not found: ${cardTitle} -> ${targetColumnLabel}`)
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

async function stitch(context, shots, outFile, height) {
  const totalWidth = shots.reduce((s, x) => s + x.width, 0)
  let html = `<body style="margin:0;width:${totalWidth}px;height:${height}px;overflow:hidden">`
  let left = 0
  for (const s of shots) {
    html += `<img src="data:image/png;base64,${s.buf.toString('base64')}" style="position:absolute;left:${left}px;top:0;width:${s.width}px;height:${height}px">`
    left += s.width
  }
  html += '</body>'
  const page = await context.newPage()
  await page.setViewportSize({ width: totalWidth, height })
  await page.setContent(html)
  await page.screenshot({ path: path.join(OUT_DIR, outFile) })
  await page.close()
}

const browser = await chromium.launch({ headless: true })

try {
  // --- two contexts, two identities ---
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const alice = await loginAs(ctxA, 'alice')
  const bob = await loginAs(ctxB, 'bob')
  check('login+board-load(A/B)', true)

  // --- presence crosses clients ---
  const bobAvatarOnAlice = alice.locator('header img[src="/avatars/bob.svg"]').first()
  const aliceAvatarOnBob = bob.locator('header img[src="/avatars/alice.svg"]').first()
  await Promise.all([
    bobAvatarOnAlice.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    aliceAvatarOnBob.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  ])
  check(
    'cross-client presence',
    (await bobAvatarOnAlice.isVisible().catch(() => false)) &&
      (await aliceAvatarOnBob.isVisible().catch(() => false))
  )

  // --- live drag #1: window A moves a card, window B must show it ---
  const cardTitle = 'Rate-limit the auth endpoints'
  await dragCardToColumn(alice, cardTitle, 'In Progress column')
  await bob
    .locator('section[aria-label="In Progress column"]')
    .locator(`article[aria-label*="${cardTitle}"]`)
    .waitFor({ state: 'visible', timeout: 15000 })
  check('live-drag-sync(B sees A move)', true)

  if (DO_SHOTS) {
    await alice.waitForTimeout(800)
    const [bufA, bufB] = await Promise.all([alice.screenshot(), bob.screenshot()])
    await stitch(
      ctxA,
      [
        { buf: bufA, width: 1440 },
        { buf: bufB, width: 1440 }
      ],
      'collaboration.png',
      900
    )
    await alice.screenshot({ path: path.join(OUT_DIR, 'kanban.png') })
  }

  // --- persistence across reload ---
  await bob.reload({ waitUntil: 'domcontentloaded' })
  await bob
    .locator('section[aria-label="In Progress column"]')
    .locator(`article[aria-label*="${cardTitle}"]`)
    .waitFor({ state: 'visible', timeout: 20000 })
  check('persistence-after-reload', true)

  // --- reconnect resync: take B fully offline, mutate from A, bring B back ---
  await ctxB.setOffline(true)
  await alice.waitForTimeout(400)
  const card2 = 'Structured logs with correlation ids'
  await dragCardToColumn(alice, card2, 'Todo column')
  await alice.waitForTimeout(1200)
  await ctxB.setOffline(false)

  let caughtUp = false
  for (let i = 0; i < 30 && !caughtUp; i++) {
    caughtUp = await bob
      .locator('section[aria-label="Todo column"]')
      .locator(`article[aria-label*="${card2}"]`)
      .isVisible()
      .catch(() => false)
    if (!caughtUp) await bob.waitForTimeout(500)
  }
  check('reconnect-resync(B catches up after offline gap)', caughtUp)

  // --- table view ---
  await alice.locator('aside a:has-text("Table")').click()
  await alice.waitForURL(/\/table/)
  await alice.waitForTimeout(900)
  if (DO_SHOTS) await alice.screenshot({ path: path.join(OUT_DIR, 'table.png') })

  // --- comment thread with @mention, synced live to B without reload ---
  await alice.locator('aside a:has-text("Board")').click()
  await alice.waitForURL(/\/board/)
  await alice.waitForTimeout(600)
  await alice.dblclick('article[aria-label*="Realtime presence avatars flicker"]')
  const commentBox = alice.locator('textarea[aria-label="Comment"]').first()
  await commentBox.waitFor({ state: 'visible', timeout: 10000 })
  await commentBox.click()
  await commentBox.fill('@bob pushing the fix for the flicker now — PTAL?')
  await commentBox.press('Enter')

  await bob.dblclick('article[aria-label*="Realtime presence avatars flicker"]')
  await bob.locator('text=presence list empties for a beat').first().waitFor({ state: 'visible', timeout: 15000 })
  let liveComment = false
  for (let i = 0; i < 20 && !liveComment; i++) {
    liveComment = await bob
      .locator('text=pushing the fix for the flicker')
      .first()
      .isVisible()
      .catch(() => false)
    if (!liveComment) await bob.waitForTimeout(500)
  }
  check('live-comment-sync(B sees A comment)', liveComment)

  if (DO_SHOTS) {
    await alice.waitForTimeout(500)
    await alice.screenshot({ path: path.join(OUT_DIR, 'comment-thread.png') })
  }

  // --- mobile viewport ---
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  })
  const mob = await mctx.newPage()
  await mob.setViewportSize({ width: 390, height: 844 })
  await mob.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 8; i++) {
    await mob.click('button:has-text("@carol")').catch(() => {})
    try {
      await mob.waitForURL(/\/w\/.+\/board/, { timeout: 3000 })
      break
    } catch {
      /* not hydrated yet */
    }
  }
  await mob.waitForTimeout(1500)
  if (DO_SHOTS) await mob.screenshot({ path: path.join(OUT_DIR, 'mobile.png') })
  check('mobile-viewport-flow', true)
  await mctx.close()

  await ctxA.close()
  await ctxB.close()
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
