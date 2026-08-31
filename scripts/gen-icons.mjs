// Regenerates public/icon-*.png from public/favicon.svg. Run this after
// changing the source SVG — the PWA manifest (vite.config.js) references
// these PNGs directly, and most platforms won't accept a bare SVG for an
// install/home-screen icon the way they will for a browser-tab favicon.
//
// One-off tooling, not part of the normal install/build/test flow, so
// Playwright is deliberately NOT a project devDependency just for this —
// that would add a large download (a full Chromium build) to every
// contributor's `npm install` for a script that runs maybe once a year.
// Install it locally only when you actually need to run this:
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/gen-icons.mjs
// Any other SVG-to-PNG tool (Inkscape, rsvg-convert, an online
// converter) works just as well — this script is a convenience, not the
// only way to produce these three files at 192x192/512x512.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')

const browser = await chromium.launch()

async function render(size, outPath, { maskable = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  // Maskable icons need "safe zone" padding (content within the inner
  // ~80%) since platforms crop them to circles/rounded-squares — pad the
  // background color out to the full canvas and shrink the artwork.
  const scale = maskable ? 0.72 : 1
  await page.setContent(`
    <html><body style="margin:0;width:${size}px;height:${size}px;background:#052013;
      display:flex;align-items:center;justify-content:center;overflow:hidden;">
      <div style="width:${size * scale}px;height:${size * scale}px;">${svg}</div>
    </body></html>
  `)
  await page.locator('svg').evaluate((el) => {
    el.style.width = '100%'
    el.style.height = '100%'
  })
  await page.screenshot({ path: outPath })
  await page.close()
}

await render(192, resolve(root, 'public/icon-192.png'))
await render(512, resolve(root, 'public/icon-512.png'))
await render(512, resolve(root, 'public/icon-512-maskable.png'), { maskable: true })

await browser.close()
console.log('Wrote public/icon-192.png, icon-512.png, icon-512-maskable.png')
