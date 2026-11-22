// Screenshot the running game headlessly: node tools/shoot.mjs [url-query] [out.png] [waitMs]
// Like sim-taxi's tools/shoot.mjs — for *looking at* the game, not for asserting things.
import { loadPlaywright } from './pw.mjs';
const { chromium } = await loadPlaywright();
const [, , query = '?play&seed=11', out = 'shots/shot.png', wait = '4000', w = '1440', h = '900'] = process.argv;
const base = process.env.GROG_URL || 'http://localhost:5199/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + query + (query.includes('?') ? '&' : '?') + 'shot');
await page.waitForTimeout(Number(wait));
if (process.env.GROG_EVAL) await page.evaluate(process.env.GROG_EVAL);
if (process.env.GROG_EVAL) await page.waitForTimeout(Number(process.env.GROG_AFTER || 800));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
await page.screenshot({ path: out, timeout: 120000 });
await browser.close();
