import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {} from '../src/main.ts'
import { createInitialState, serializeSave } from '../src/game/simulation.ts'
import { PLANET_RADIUS, SAVE_KEY } from '../src/game/config.ts'
import { sphereFramingDistance } from '../src/game/math.ts'

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
  await expect.poll(async () => (await diagnostics(page)).cameraDistance).toBeLessThan(9.5)
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
  await expect.poll(async () => (await diagnostics(page)).nearestNode?.kind).toBe('tree')
  await page.keyboard.up('w')
  await page.keyboard.up('a')
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
    await page.locator('[data-ui="settlement-toggle"]').click()
    await expect(page.getByRole('heading', { name: 'Your settlement' })).toBeVisible()
    await page.getByRole('button', { name: 'Close settlement', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your settlement' })).toBeHidden()
    await page.screenshot({ path: test.info().outputPath('touch-layout.png') })
  })

  test('lets the explorer walk slowly with a small joystick movement', async ({ page }) => {
    await begin(page)
    const joystick = page.locator('[data-ui="joystick"]')
    const bounds = await joystick.boundingBox()
    if (!bounds) throw new Error('The touch movement control is not visible.')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    const sampleSpeed = async (deflection: number) => {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + deflection, y)
      const before = await snapshot(page)
      await expect.poll(async () => (await snapshot(page)).time - before.time).toBeGreaterThan(0.9)
      await page.mouse.up()
      const after = await snapshot(page)
      const dot = before.player.normal.reduce((sum, value, index) => sum + value * after.player.normal[index], 0)
      return Math.acos(Math.max(-1, Math.min(1, dot))) * PLANET_RADIUS / (after.time - before.time)
    }
    const careful = await sampleSpeed(12)
    const full = await sampleSpeed(bounds.width / 2)
    expect(careful).toBeGreaterThan(0.1)
    expect(full).toBeGreaterThan(2.5)
    expect(careful).toBeLessThan(full * 0.7)
    const released = await snapshot(page)
    await page.waitForTimeout(300)
    expect((await snapshot(page)).player.normal).toEqual(released.player.normal)
  })

  test('frames the whole planet on a portrait screen and restores the build dock', async ({ page }) => {
    await begin(page)
    const dockToggle = page.locator('[data-ui="build-toggle"]')
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('v')
    const framingDistance = sphereFramingDistance(PLANET_RADIUS + 4, 48, 390 / 844)
    await expect.poll(async () => (await diagnostics(page)).planetDistance).toBeGreaterThan(framingDistance * 0.99)
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.quest-panel')).toBeHidden()
    await page.screenshot({ path: test.info().outputPath('portrait-planet.png') })
    await page.keyboard.press('v')
    await expect.poll(async () => (await diagnostics(page)).cameraDistance).toBeLessThan(9.5)
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.quest-panel')).toBeVisible()
    await page.keyboard.press('v')
    await page.keyboard.press('1')
    await expect.poll(async () => (await diagnostics(page)).overview).toBe(false)
    await expect.poll(async () => (await diagnostics(page)).selectedBuild).toBe('cottage')
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'true')
  })
})
