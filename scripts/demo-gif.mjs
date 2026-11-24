/**
 * 生成 README 首屏的演示动图：docs/demo.gif
 * 依赖：puppeteer-core + pngjs + gifenc（devDependencies）
 * 用法：先启动服务，再 node scripts/demo-gif.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'demo.gif')
const TARGET = process.env.DEMO_URL || 'http://127.0.0.1:8777/'

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const edge = process.env.EDGE_PATH || EDGE_CANDIDATES.find((p) => existsSync(p))
if (!edge) throw new Error('找不到 Edge，请设置 EDGE_PATH')

const frames = []
let page = null
let clip = null

async function shot(delay) {
  const buf = await page.screenshot({ clip, type: 'png' })
  frames.push({ buf, delay })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
})

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1150, deviceScaleFactor: 1 })
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('#status')?.textContent !== '检测中…')
  await page.evaluate(() => document.fonts?.ready)
  await wait(600)

  const box = await (await page.$('.wrap')).boundingBox()
  clip = {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y) - 6),
    width: Math.round(box.width),
    height: 820,
  }

  // 1) 空状态
  await shot(700)

  // 2) 输入一半
  await page.click('#input')
  await page.type('#input', '求和 1/n立方', { delay: 0 })
  await wait(250)
  await shot(450)

  // 3) 输入完整
  await page.type('#input', '+nx', { delay: 0 })
  await wait(250)
  await shot(700)

  // 4) 点击生成（趁结果没回来）
  await page.click('#go')
  await wait(120)
  await shot(300)

  // 5) 等待结果
  await page.waitForFunction(() => !document.querySelector('#resultCard')?.hidden, { timeout: 20000 })
  await wait(700)
  await shot(1400)

  // 6) 切到第二个候选
  const alts = await page.$$('#alts button')
  if (alts.length > 1) {
    await alts[1].click()
    await wait(400)
    await shot(1600)
  }

  // 7) 切回推荐
  if (alts.length > 1) {
    await alts[0].click()
    await wait(400)
    await shot(1600)
  }

  console.log(`frames: ${frames.length}  clip: ${clip.width}x${clip.height}`)
} finally {
  await browser.close()
}

// ---- 编码 ----
const gif = GIFEncoder()
let w = 0
let h = 0
for (const { buf, delay } of frames) {
  const png = PNG.sync.read(Buffer.from(buf))
  w = png.width
  h = png.height
  const palette = quantize(png.data, 256, { format: 'rgba4444' })
  const index = applyPalette(png.data, palette, 'rgba4444')
  gif.writeFrame(index, w, h, { palette, delay })
}
gif.finish()

if (process.env.DUMP && frames.length) writeFileSync(join(ROOT, 'docs', '.demo-last.png'), frames[frames.length - 1].buf)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, gif.bytes())
console.log(`写入 ${OUT}  ${w}x${h}  ${frames.length} 帧  ${Math.round(gif.bytes().length / 1024)} KB`)
