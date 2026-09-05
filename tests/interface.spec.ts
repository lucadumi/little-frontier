import { expect, test } from '@playwright/test'
import { SAVE_KEY } from '../src/game/config.ts'
import { serializeSave } from '../src/game/simulation.ts'
import { begin, diagnostics, enterWorld, snapshot } from './helpers.ts'
import { villageFixture } from './fixtures.ts'

test('dismisses the current interface before pausing and keeps management input out of the world', async ({ page }) => {
  const { state } = villageFixture()
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeSave(state) })
  await begin(page)
  await page.keyboard.press('t')
  const panel = page.locator('[data-ui="settlement"]')
  await expect(panel).toBeVisible()
  await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
  const before = await snapshot(page)
  await page.keyboard.down('w')
  await expect.poll(async () => (await snapshot(page)).time - before.time).toBeGreaterThan(0.4)
  await page.keyboard.up('w')
  expect((await snapshot(page)).player.normal).toEqual(before.player.normal)
  expect((await diagnostics(page)).paused).toBe(false)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect((await diagnostics(page)).paused).toBe(false)
  await expect(page.locator('#world')).toBeFocused()
  await page.keyboard.press('1')
  await expect(page.locator('[data-ui="placement"]')).toBeVisible()
  await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ui="placement"]')).toBeHidden()
  expect((await diagnostics(page)).paused).toBe(false)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('#world')).toBeFocused()
})

test('keeps native Space activation and interface mode changes predictable', async ({ page }) => {
  await begin(page)
  const milestones = page.locator('.quest-details')
  await milestones.locator('summary').focus()
  await page.keyboard.press('Space')
  await expect(milestones).toHaveAttribute('open', '')
  expect((await diagnostics(page)).altitude).toBe(0)
  await page.keyboard.press('t')
  await page.keyboard.press('1')
  await expect(page.locator('[data-ui="settlement"]')).toBeHidden()
  await expect(page.locator('[data-ui="placement"]')).toBeVisible()
  await expect(page.locator('[data-ui="keyboard-action"]')).toHaveText('place building')
  await page.locator('[data-ui="cancel-build"]').click()
  await expect(page.locator('[data-ui="keyboard-action"]')).toHaveText('hold to gather')
  await expect(page.locator('[data-ui="build-cards"]')).toBeVisible()
  await page.keyboard.press('v')
  await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
  await page.locator('[data-ui="build-toggle"]').click()
  expect((await diagnostics(page)).overview).toBe(false)
  await expect(page.locator('[data-ui="build-cards"]')).toBeVisible()
})

test('does not claim saving is available when the browser blocks local storage', async ({ page }) => {
  await page.addInitScript((saveKey) => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key === saveKey) throw new DOMException('Storage is blocked', 'SecurityError')
      return getItem.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (key === saveKey) throw new DOMException('Storage is blocked', 'SecurityError')
      return setItem.call(this, key, value)
    }
  }, SAVE_KEY)
  await page.goto('/')
  await expect(page.locator('[data-ui="welcome-save-status"]')).toContainText('unavailable')
  await enterWorld(page)
  await expect(page.locator('[data-ui="saving-status"]')).toHaveText('Progress is not saved')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ui="pause-save-status"]')).toHaveText('Progress is not saved')
})

test('shows a pending sound state instead of accepting conflicting toggles', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext
    window.AudioContext = class extends NativeAudioContext {
      async resume() {
        await super.resume()
        await new Promise<void>((resolve) => {
          Object.defineProperty(window, '__finishSoundStartup', { value: resolve, configurable: true })
        })
      }
    }
  })
  await begin(page)
  const sound = page.locator('[data-ui="sound"]')
  await sound.click()
  await expect(sound).toBeDisabled()
  await expect(sound).toHaveAttribute('aria-busy', 'true')
  await page.waitForFunction(() => typeof Reflect.get(window, '__finishSoundStartup') === 'function')
  await page.evaluate(() => {
    const finish = Reflect.get(window, '__finishSoundStartup')
    if (typeof finish !== 'function') throw new Error('Sound startup was not requested.')
    finish()
  })
  await expect(sound).toBeEnabled()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
})

test('keeps focused notifications readable and dismisses them without pausing', async ({ page }) => {
  await page.addInitScript(() => {
    const native = window.setTimeout
    Object.defineProperty(window, 'setTimeout', {
      value: (callback: TimerHandler, delay?: number, ...args: unknown[]) => Reflect.apply(
        native, window, [callback, delay === 5000 ? 1500 : delay, ...args],
      ),
    })
  })
  await begin(page)
  await page.keyboard.down('e')
  const notification = page.locator('.toast').first()
  await notification.locator('button').focus()
  await page.keyboard.up('e')
  const hud = await page.locator('[data-ui="topbar"]').boundingBox()
  const toast = await notification.boundingBox()
  if (!hud || !toast) throw new Error('The HUD or notification is not visible.')
  expect(toast.y).toBeGreaterThanOrEqual(hud.y + hud.height)
  await page.waitForTimeout(1700)
  await expect(notification).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.toast')).toHaveCount(0)
  expect((await diagnostics(page)).paused).toBe(false)
  await expect(page.locator('#world')).toBeFocused()
})

test('does not resume play behind a fatal graphics message', async ({ page }) => {
  await begin(page)
  await page.locator('#world').dispatchEvent('webglcontextlost', { cancelable: true })
  await expect(page.locator('[data-ui="fatal-error"]')).toBeVisible()
  const stopped = await snapshot(page)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('t')
  await page.keyboard.press('1')
  await page.keyboard.down('w')
  await page.waitForTimeout(400)
  await page.keyboard.up('w')
  expect((await snapshot(page)).time).toBe(stopped.time)
  expect((await snapshot(page)).player.normal).toEqual(stopped.player.normal)
  expect((await diagnostics(page)).paused).toBe(true)
  await expect(page.locator('[data-ui="start"]')).toBeDisabled()
})

for (const screen of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'compact desktop', width: 1024, height: 600, touch: false },
  { name: 'small phone', width: 320, height: 568, touch: true },
  { name: 'small landscape phone', width: 568, height: 320, touch: true },
  { name: 'landscape phone', width: 844, height: 390, touch: true },
]) {
  test.describe(screen.name, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.touch, hasTouch: screen.touch })

    test('keeps primary controls visible in exploration, management, and placement', async ({ page }) => {
      await page.goto('/')
      const start = page.getByRole('button', { name: /begin your frontier/i })
      await start.scrollIntoViewIfNeeded()
      await expect(start).toBeInViewport()
      await enterWorld(page)
      if (screen.touch) await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screen.width)
      const settlement = page.locator('[data-ui="settlement-toggle"]')
      await expect(settlement).toBeInViewport()
      await settlement.click()
      await expect(page.locator('[data-ui="settlement"]')).toBeInViewport()
      const close = page.getByRole('button', { name: 'Close settlement', exact: true })
      await expect(close).toBeInViewport()
      const panelBounds = await page.locator('[data-ui="settlement"]').boundingBox()
      const hudBounds = await page.locator('[data-ui="topbar"]').boundingBox()
      if (!panelBounds || !hudBounds) throw new Error('The management layout is not visible.')
      expect(panelBounds.y).toBeGreaterThanOrEqual(hudBounds.y + hudBounds.height)
      expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(screen.height)
      await page.screenshot({ path: test.info().outputPath('management.png') })
      await close.click()
      if (screen.touch) {
        await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
        await page.locator('[data-ui="touch-build"]').click()
      }
      await page.locator('[data-build="cottage"]').click()
      await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
      await expect(page.locator('[data-ui="place"]')).toBeInViewport()
      await expect(page.locator('[data-ui="cancel-build"]')).toBeInViewport()
      const placement = await page.locator('[data-ui="placement"]').boundingBox()
      if (!placement) throw new Error('Placement controls are missing.')
      expect(placement.y).toBeGreaterThanOrEqual(hudBounds.y + hudBounds.height)
      await page.screenshot({ path: test.info().outputPath('placement.png') })
      await page.locator('[data-ui="cancel-build"]').click()
      await page.locator('[data-ui="pause"]').click()
      await expect(page.getByRole('button', { name: /resume/i })).toBeInViewport()
      await page.getByRole('button', { name: /resume/i }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    })
  })
}
