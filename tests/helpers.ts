import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {} from '../src/main.ts'

export async function snapshot(page: Page) {
  return page.evaluate(() => {
    if (!window.__FRONTIER__) throw new Error('The game did not initialize.')
    return window.__FRONTIER__.snapshot()
  })
}

export async function diagnostics(page: Page) {
  return page.evaluate(() => {
    if (!window.__FRONTIER__) throw new Error('The renderer did not initialize.')
    return window.__FRONTIER__.diagnostics()
  })
}

export async function begin(page: Page) {
  await page.goto('/')
  await enterWorld(page)
}

export async function enterWorld(page: Page) {
  await page.waitForFunction(() => {
    const game = window.__FRONTIER__
    return game !== undefined && game.diagnostics().drawCalls > 10
  })
  await page.getByRole('button', { name: /begin your frontier|continue your frontier/i }).click()
  await expect.poll(async () => (await diagnostics(page)).started).toBe(true)
  await expect.poll(async () => (await diagnostics(page)).cameraDistance).toBeLessThan(9.5)
}
