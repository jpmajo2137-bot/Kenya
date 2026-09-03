/**
 * Capture mobile app screens for Play / App Store marketing screenshots.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.APP_URL || 'http://127.0.0.1:5173'
const OUT = join(process.cwd(), 'play-store-aso/screenshots/raw')
mkdirSync(OUT, { recursive: true })

async function shot(page, name) {
  const path = join(OUT, `${name}.png`)
  await page.waitForTimeout(700)
  await page.screenshot({ path, fullPage: false })
  console.log('saved', path)
}

async function clickNav(page, label) {
  const tab = page.locator('div.bottom-nav-container button, div.fixed.bottom-0 button').filter({ hasText: label }).first()
  await tab.waitFor({ state: 'visible', timeout: 10000 })
  await tab.click({ force: true })
  await page.waitForTimeout(1000)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: 'ko-KR',
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  await page.addInitScript(() => {
    const until = String(Date.now() + 60 * 60 * 1000)
    localStorage.setItem('quiz_access_until', until)
    localStorage.setItem('dictionary_access_until', until)
    localStorage.setItem(
      'flashcard_wrong_answers_ko',
      JSON.stringify(['ox-0001', 'ox-0002', 'ox-0003', 'ox-0010', 'ox-0020', 'ox-0030', 'ox-0040', 'ox-0050']),
    )
  })

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2000)

  // Hide noisy chrome for marketing shots
  await page.addStyleTag({
    content: `
      /* hide update/offline toasts if any */
      [class*="UpdateModal"], .offline-banner { display: none !important; }
    `,
  })

  // dismiss modals
  for (const t of ['나중에', '닫기', '확인']) {
    const b = page.getByRole('button', { name: t }).first()
    if (await b.isVisible({ timeout: 500 }).catch(() => false)) await b.click().catch(() => {})
  }

  await clickNav(page, '단어장')
  await shot(page, '01-home')

  // Click 입문 card (not just dropdown)
  await page.locator('button, div[role="button"], .rounded-3xl, .rounded-2xl').filter({ hasText: '입문' }).first().click()
  await page.waitForTimeout(1500)
  // If still on home, try text click on 입문 row
  if (!(await page.getByText('Day 선택').isVisible().catch(() => false))) {
    await page.getByText('입문', { exact: true }).first().click()
    await page.waitForTimeout(1500)
  }
  await shot(page, '02-day-list')

  // Open Day 1 word list via 목록
  const listBtn = page.locator('button').filter({ hasText: '목록' }).first()
  await listBtn.click()
  await page.waitForTimeout(2200)
  await shot(page, '03-word-list')

  // Back then open flashcard
  await page.goBack()
  await page.waitForTimeout(1000)
  const cardBtn = page.locator('button').filter({ hasText: '카드' }).first()
  await cardBtn.click()
  await page.waitForTimeout(2500)
  await shot(page, '03b-flashcard')

  // Quiz lobby + play
  await clickNav(page, '퀴즈')
  await page.waitForTimeout(800)
  // hide ad-free countdown bars visually
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div,span,p')) {
      const t = (el.textContent || '').trim()
      if (t.includes('광고 없이') || t.includes('Ad-free')) {
        el.style.display = 'none'
      }
    }
  })
  await shot(page, '04-quiz')
  const start = page.getByRole('button', { name: /퀴즈 시작/ }).first()
  await start.click()
  await page.waitForTimeout(1800)
  await shot(page, '04b-quiz-play')

  // Wrong note home + word view
  await clickNav(page, '오답')
  await page.waitForTimeout(1200)
  await shot(page, '05-wrong')
  const viewWords = page.getByRole('button', { name: /단어 보기/ }).first()
  if (await viewWords.isVisible().catch(() => false)) {
    await viewWords.click()
    await page.waitForTimeout(1800)
    await shot(page, '05b-wrong-list')
  }

  // Dictionary
  await clickNav(page, '사전')
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div,span,p')) {
      const t = (el.textContent || '').trim()
      if (t.includes('광고 없이') || t.includes('Ad-free')) el.style.display = 'none'
    }
  })
  const input = page.locator('input').first()
  await input.fill('travel')
  await page.locator('button').filter({ hasText: /검색|^$/ }).last().click().catch(async () => {
    await input.press('Enter')
  })
  // click search icon button near input
  const searchIcon = page.locator('button').nth(0)
  // more reliable: click the magnifying glass sibling
  await page.locator('input').first().press('Enter')
  // try clicking button next to input
  const near = page.locator('input').first().locator('xpath=ancestor::div[1]/following-sibling::button | xpath=../button')
  if (await near.count()) await near.first().click().catch(() => {})
  await page.waitForTimeout(2000)
  // if still empty, click any button with search aria
  await page.locator('button').filter({ has: page.locator('svg') }).nth(0).click().catch(() => {})
  // direct evaluate search if exposed - fallback click text 검색
  const searchTextBtn = page.getByRole('button', { name: '검색' })
  if (await searchTextBtn.count()) await searchTextBtn.click().catch(() => {})
  // Click the dark search circle - last button in the search row
  await page.evaluate(() => {
    const input = document.querySelector('input')
    if (!input) return
    const row = input.closest('div')
    const btn = row?.parentElement?.querySelector('button')
    btn?.click()
  })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div,span,p')) {
      const t = (el.textContent || '').trim()
      if (t.includes('광고 없이') || t.includes('Ad-free')) el.style.display = 'none'
    }
  })
  await shot(page, '06-dictionary')

  // Categories from home
  await clickNav(page, '단어장')
  await page.waitForTimeout(600)
  for (let i = 0; i < 5; i++) {
    if (await page.getByText('단어장').nth(1).isVisible().catch(() => false) && await page.getByText('입문').isVisible().catch(() => false)) break
    await page.goBack().catch(() => {})
    await page.waitForTimeout(400)
  }
  await clickNav(page, '단어장')
  const catBtn = page.getByRole('button', { name: /카테고리/ }).first()
  if (await catBtn.isVisible().catch(() => false)) {
    await catBtn.click()
  } else {
    await page.getByText('카테고리별 단어장').first().click().catch(() => {})
  }
  await page.waitForTimeout(1200)
  await shot(page, '07-categories')

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, at: new Date().toISOString() }, null, 2))
  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
