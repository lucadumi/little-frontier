import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {} from '../src/main.ts'
import { createInitialState, serializeSave } from '../src/game/simulation.ts'
import { SAVE_KEY } from '../src/game/config.ts'

async function snapshot(page: Page) {
  return page.evaluate(() => {
    if (!window.__FRONTIER__) throw new Error('The game did not initialize.')
    return window.__FRONTIER__.snapshot()
  })
}

async function diagnostics(page: Page) {
  return page.evaluate(() => {
    if (!window.__FRONTIER__) throw new Error('The renderer did not initialize.')
    return window.__FRONTIER__.diagnostics()
  })
}

async function begin(page: Page) {
  await page.goto('/')
  await expect.poll(async () => (await diagnostics(page)).drawCalls).toBeGreaterThan(10)
  await page.getByRole('button', { name: /begin your frontier|continue your frontier/i }).click()
  await expect.poll(async () => (await diagnostics(page)).started).toBe(true)
}

test('renders an original planet and moves the explorer with radial gravity', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /a little world/i })).toBeVisible()
  await expect.poll(async () => (await diagnostics(page)).triangles).toBeGreaterThan(1000)
  await page.screenshot({ path: test.info().outputPath('welcome.png') })
  await page.getByRole('button', { name: /begin your frontier/i }).click()
  const before = await snapshot(page)
  await page.keyboard.down('w')
  await page.waitForTimeout(700)
  await page.keyboard.up('w')
  const after = await snapshot(page)
  expect(Math.hypot(...after.player.normal)).toBeCloseTo(1, 8)
  const displacement = Math.hypot(...after.player.normal.map((value, index) => value - before.player.normal[index]))
  expect(displacement).toBeGreaterThan(0.03)
  const tangentDot = after.player.normal.reduce((sum, value, index) => sum + value * after.player.forward[index], 0)
  expect(Math.abs(tangentDot)).toBeLessThan(0.000001)
  await page.waitForTimeout(900)
  await page.screenshot({ path: test.info().outputPath('third-person.png') })
  expect(errors).toEqual([])
})

test('gathers wood, builds a garden, and lets the player assign a grower', async ({ page }) => {
  await begin(page)
  await page.keyboard.down('w')
  await page.keyboard.down('a')
  await page.waitForTimeout(480)
  await page.keyboard.up('w')
  await page.keyboard.up('a')
  await expect.poll(async () => (await diagnostics(page)).nearestNode?.kind).toBe('tree')
  await page.keyboard.down('e')
  await expect.poll(async () => (await snapshot(page)).stats.gathered.wood).toBe(12)
  await page.keyboard.up('e')
  const gathered = await snapshot(page)
  expect(gathered.resources.wood).toBe(24)
  await page.keyboard.press('2')
  await expect.poll(async () => (await diagnostics(page)).placementValid).toBe(true)
  await page.keyboard.press('e')
  await expect.poll(async () => (await snapshot(page)).buildings.some((building) => building.type === 'garden')).toBe(true)
  await page.keyboard.press('t')
  await page.getByRole('button', { name: /assign.*garden|add.*garden|garden.*worker/i }).click()
  await expect.poll(async () => (await snapshot(page)).buildings.find((building) => building.type === 'garden')?.workers).toBe(1)
  await page.screenshot({ path: test.info().outputPath('growing-settlement.png') })
})

test('constructs a cottage, pauses simulation, and restores the saved world', async ({ page }) => {
  await begin(page)
  await page.keyboard.press('1')
  await expect.poll(async () => (await diagnostics(page)).placementValid).toBe(true)
  await page.keyboard.press('e')
  await expect.poll(async () => (await snapshot(page)).buildings.length).toBe(2)
  const built = await snapshot(page)
  expect(built.resources.wood).toBe(0)
  expect(built.resources.stone).toBe(2)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await diagnostics(page)).paused).toBe(true)
  const paused = await snapshot(page)
  await page.waitForTimeout(400)
  expect((await snapshot(page)).time).toBe(paused.time)
  await page.getByRole('button', { name: /save now/i }).click()
  await page.reload()
  await page.getByRole('button', { name: /continue your frontier/i }).click()
  const restored = await snapshot(page)
  expect(restored.buildings).toEqual(built.buildings)
  expect(restored.resources.wood).toBe(0)
})

test('keeps controls valid on the other side of the sphere', async ({ page }) => {
  const state = createInitialState()
  state.player.normal = [0, -1, 0]
  state.player.forward = [0, 0, 1]
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeSave(state) })
  await begin(page)
  await page.keyboard.down('w')
  await page.waitForTimeout(500)
  await page.keyboard.up('w')
  const current = await snapshot(page)
  expect(current.player.normal[1]).toBeLessThan(-0.9)
  expect(current.player.normal[2]).toBeGreaterThan(0.01)
  expect(Math.hypot(...current.player.normal)).toBeCloseTo(1, 8)
  await page.keyboard.press('v')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: test.info().outputPath('far-side.png') })
})

test('does not silently overwrite an unreadable save', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'unreadable save'), SAVE_KEY)
  await page.goto('/')
  await expect(page.getByText(/saved frontier could not be read/i)).toBeVisible()
  page.on('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: /begin your frontier/i }).click()
  expect((await diagnostics(page)).started).toBe(false)
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe('unreadable save')
})

test('reports unsupported graphics instead of showing a fake game', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args])
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText(/needs WebGL 2/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /begin your frontier/i })).toBeDisabled()
})

test.describe('small touch screens', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('keeps the world and primary actions accessible', async ({ page }) => {
    await begin(page)
    await expect(page.locator('#world')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({ path: test.info().outputPath('touch-layout.png') })
  })
})
