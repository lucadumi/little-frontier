import { expect, test } from '@playwright/test'
import { SAVE_KEY } from '../src/game/config.ts'
import { serializeSave } from '../src/game/simulation.ts'
import { begin, diagnostics, snapshot } from './helpers.ts'
import { villageFixture } from './fixtures.ts'

test('migrates an existing frontier and upgrades its hearth, homes, workers, and visible models', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { state, gardenId, cottageId } = villageFixture()
  const legacy = JSON.stringify({
    ...state,
    version: 1,
    buildings: state.buildings.map((building) => ({
      id: building.id, type: building.type, normal: building.normal,
      rotation: building.rotation, workers: building.workers,
    })),
  })
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  }, { key: SAVE_KEY, value: legacy })
  await begin(page)
  expect((await snapshot(page)).version).toBe(2)
  expect((await snapshot(page)).buildings.length).toBe(state.buildings.length)
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toContain('"version":2')
  await page.keyboard.press('t')
  const hearth = page.locator('[data-building-id="hearth"]')
  const cottage = page.locator(`[data-building-id="${cottageId}"]`)
  const garden = page.locator(`[data-building-id="${gardenId}"]`)
  await expect(garden.locator('.upgrade-building')).toBeDisabled()
  await expect(garden.locator('.upgrade-reason')).toContainText('hearth to level 2')
  await hearth.locator('.upgrade-building').click()
  await expect(hearth).toHaveAttribute('data-level', '2')
  await expect.poll(async () => (await diagnostics(page)).buildingLevels.find((building) => building.id === 'hearth')?.level).toBe(2)
  await cottage.locator('.upgrade-building').click()
  await expect(cottage.locator('.building-production')).toContainText('3 beds')
  await garden.locator('.upgrade-building').click()
  await expect(garden.locator('.building-production')).toContainText('+9 food / min')
  await expect(garden.locator('.worker-count')).toHaveText('1 / 2')
  await expect(garden.locator('.upgrade-building')).toBeDisabled()
  await expect(garden.locator('.upgrade-reason')).toContainText('hearth to level 3')
  await hearth.locator('.upgrade-building').click()
  await cottage.locator('.upgrade-building').click()
  await garden.locator('.upgrade-building').click()
  await expect(cottage.locator('.building-production')).toContainText('4 beds')
  await expect(garden.locator('.building-production')).toContainText('+12 food / min')
  await expect(garden.locator('.upgrade-building')).toBeHidden()
  await expect(garden.locator('h4')).toBeFocused()
  await expect(garden.locator('.upgrade-benefit')).toHaveText('Maximum level reached')
  await expect.poll(async () => (await diagnostics(page)).buildingLevels.find((building) => building.id === gardenId)?.level).toBe(3)
  await page.keyboard.press('t')
  await page.screenshot({ path: test.info().outputPath('upgraded-settlement.png') })
  const beforeReload = await snapshot(page)
  await page.reload()
  await page.getByRole('button', { name: /continue your frontier/i }).click()
  expect((await snapshot(page)).buildings).toEqual(beforeReload.buildings)
  expect((await snapshot(page)).stats).toEqual(beforeReload.stats)
  expect(errors).toEqual([])
})

test.describe('touch upgrade controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('explains locked tiers and makes upgrades reachable without losing worker controls', async ({ page }) => {
    const { state, gardenId } = villageFixture(3)
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeSave(state) })
    await begin(page)
    await page.locator('[data-ui="settlement-toggle"]').click()
    const hearth = page.locator('[data-building-id="hearth"]')
    await expect(hearth.locator('.upgrade-building')).toBeDisabled()
    await expect(hearth.locator('.upgrade-reason')).toContainText('5 settlers')
    await hearth.locator('.upgrade-building').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath('touch-upgrades.png') })
    const garden = page.locator(`[data-building-id="${gardenId}"]`)
    await garden.locator('.worker-plus').click()
    await expect(garden.locator('.worker-count')).toHaveText('2 / 2')
    await expect(page.locator('[data-ui="settlement-feedback"]')).toContainText('worker joined')
    await expect(page.locator('.toast')).toHaveCount(0)
    await expect(garden.locator('.upgrade-building')).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const close = page.getByRole('button', { name: 'Close settlement', exact: true })
    await expect(close).toBeInViewport()
    await close.click()
    await expect(page.getByRole('heading', { name: 'Your settlement' })).toBeHidden()
  })
})
