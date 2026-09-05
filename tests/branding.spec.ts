import { expect, test } from '@playwright/test'
import { enterWorld } from './helpers.ts'

for (const screen of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
]) {
  test.describe(screen.name, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.touch, hasTouch: screen.touch })

    test('uses the same loaded 3D mark on the welcome screen and HUD', async ({ page }) => {
      await page.goto('/')
      await page.waitForFunction(() => {
        const images = Array.from(document.querySelectorAll<HTMLImageElement>('img.brand-mark'))
        return images.length === 2 && images.every((image) => image.complete && image.naturalWidth === 512 && image.naturalHeight === 512)
      })
      const welcome = page.locator('.welcome-brand .brand-mark')
      const hud = page.locator('.hud-brand .brand-mark')
      await expect(welcome).toBeInViewport()
      await expect(welcome).toHaveAttribute('alt', '')
      await expect(welcome).toHaveAttribute('src', '/brand/little-frontier-logo.png')
      await page.screenshot({ path: test.info().outputPath('welcome-logo.png') })
      await enterWorld(page)
      if (screen.touch) await expect(page.locator('[data-ui="build-cards"]')).toBeHidden()
      await expect(hud).toBeInViewport()
      await expect(hud).toHaveAttribute('src', await welcome.getAttribute('src') ?? '')
      await page.screenshot({ path: test.info().outputPath('hud-logo.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screen.width)
    })
  })
}

test('serves the matching transparent favicon and references it from the page', async ({ request }) => {
  const html = await request.get('/')
  expect(await html.text()).toContain('type="image/png" sizes="64x64" href="/favicon.png"')
  const icon = await request.get('/favicon.png')
  expect(icon.ok()).toBe(true)
  expect(icon.headers()['content-type']).toContain('image/png')
  const image = await icon.body()
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(image.readUInt32BE(16)).toBe(64)
  expect(image.readUInt32BE(20)).toBe(64)
  expect(image[25]).toBe(6)
})
