// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

// EVERY IMAGE THE STORES AND THE NATIVE PROJECTS NEED, FROM POLARIS ITSELF.
//
// The launcher icons, the App Store icon, the launch screens, the Play feature
// graphic and the store screenshots, all drawn by a headless Chrome from a
// running polaris: the icon from its own icon.svg, the screenshots from the
// app as it ships. Nothing is drawn by hand, so a new polaris release is one
// re-run away from new store images -- and nothing new is installed: Chrome
// renders, and Node writes the files.
//
// Usage:
//   BASE=http://localhost:8800 node scripts/make-store-images.mjs [icons|graphics|screens|all]
// BASE is a polaris site: a local `node scripts/serve.mjs` in evo.polaris, or
// the www/ that `npm run fetch-site` unpacks, served on any port. Never point
// it at polaris.evomedia.net: the screenshots would be logged as visits.
//
// Apple rejects an App Store icon with an alpha channel, even an opaque one.
// Chrome writes an opaque screenshot as RGB (PNG colour type 2), and the
// check at the end refuses to finish if any icon that must be opaque is not.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = (process.env.BASE || 'http://localhost:8800').replace(/\/$/, '');
const PORT = 9343;
const SKY = '#080b14';                       // polaris's own background and theme colour
const RES = join(ROOT, 'android/app/src/main/res');

// Android densities: the legacy 48dp icon and the adaptive icon's 108dp layer.
export const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// The store screenshot sizes, in CSS pixels times the device ratio:
//   Play phone   1080 x 2160 -- 2:1, the longest Play accepts
//   iPhone 6.9"  1320 x 2868 -- the size App Store Connect asks for first
//   iPad 13"     2064 x 2752 -- also used for Play's tablet slot
export const DEVICES = [
  { dir: 'store/play', prefix: 'phone', w: 360, h: 720, dpr: 3 },
  { dir: 'store/ios', prefix: 'iphone-6.9', w: 440, h: 956, dpr: 3 },
  { dir: 'store/ios', prefix: 'ipad-13', w: 1032, h: 1376, dpr: 2, tablet: true },
];

/** Dallas, 22:30 local on 10 October 2026 -- the same night polaris's own PWA screenshots use. */
const PLACE = { lat: 32.8, lon: -96.8, altitude: 150 };
const NIGHT = Date.UTC(2026, 9, 11, 3, 30);

// Each scene: what it shows, in the words a store listing can reuse, and how
// to reach it from a fresh load. Full screen is the app's own button.
export const SCENES = [
  { name: '1-align', night: false,
    caption: 'The numbers to set your tracker to, with Polaris on the polar-scope reticle',
    setup: `document.getElementById('modeAlignBtn').click(); await wait(600);
            const c = document.getElementById('settingsCard'); c.open = true; await wait(300);
            c.scrollIntoView(); scrollBy(0, -(document.querySelector('.bar').offsetHeight + 8));` },
  { name: '2-sky', night: false,
    caption: 'The sky as it is tonight, with the constellations drawn on it',
    setup: `document.getElementById('fullBtn').click(); await wait(700);
            for (let i = 0; i < 2; i++) { document.getElementById('fullOut').click(); await wait(250); }` },
  { name: '3-galaxy', night: false, figures: false,
    caption: 'One press finds a galaxy and frames it, as a photograph at its true size',
    setup: `document.getElementById('fullBtn').click(); await wait(700);
            const th = document.getElementById('trackHead');
            if (th.getAttribute('aria-expanded') !== 'true') { th.click(); await wait(300); }
            for (let i = 0; i < 4; i++) {
              document.getElementById('tgtGalaxies').click(); await wait(1600);
              if (/Andromeda/.test(document.getElementById('skyAnnounce')?.textContent || '')) break;
            }
            if (th.getAttribute('aria-expanded') === 'true') { th.click(); await wait(300); }` },
  { name: '4-night', night: true,
    caption: 'Night Mode: pure red on black, to keep your eyes dark-adapted',
    setup: `document.getElementById('fullBtn').click(); await wait(700);
            for (let i = 0; i < 2; i++) { document.getElementById('fullOut').click(); await wait(250); }` },
  { name: '5-large-text', night: false, scale: 1.45,
    caption: 'Large text, big buttons and single taps: made to be used by everyone',
    setup: `document.getElementById('fullBtn').click(); await wait(700);
            const th = document.getElementById('trackHead');
            if (th.getAttribute('aria-expanded') !== 'true') { th.click(); await wait(300); }` },
];

function findChrome() {
  const found = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome found. Set CHROME to a Chrome binary.');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); }
  }
  if (!targets) throw new Error('Chrome never opened its debugging port.');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { ws, send };
}

/** The PNG colour type: 2 is RGB, 6 is RGBA. */
export const colourType = (png) => png[25];

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`wrote ${file.replace(ROOT, '').replace(/\\/g, '/')}`);
}

async function shoot(send, file, { transparent = false } = {}) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const png = Buffer.from(data, 'base64');
  if (!transparent && colourType(png) !== 2) throw new Error(`${file}: expected an opaque RGB PNG, got colour type ${colourType(png)}`);
  write(file, png);
}

/** Draw some HTML at an exact pixel size and keep it. */
async function render(send, frameId, html, w, h, file, opts = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride',
    { color: opts.transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 8, g: 11, b: 20, a: 1 } });
  await send('Page.setDocumentContent', { frameId, html });
  await sleep(250);
  await shoot(send, file, opts);
}

// The icon in its three shapes. polaris's own is a rounded square; the stores
// and Android's masks want it full-bleed, and the adaptive foreground wants
// only the mark, shrunk into the 66dp circle Android promises never to crop.
const svgOf = async () => {
  const res = await fetch(`${BASE}/src/data/icon.svg`);
  if (!res.ok) throw new Error(`${BASE}/src/data/icon.svg: HTTP ${res.status} -- is a polaris site running there?`);
  return (await res.text()).replace(/<!--[\s\S]*?-->\s*/, '');
};
const fullBleed = (svg) => svg.replace(/\s+rx="[^"]*"/, '');
const markOnly = (svg) => svg.replace(/<rect[^>]*\/>\s*/, '')
  // The mark spans 60..452 with the tick marks' round caps: 392 of 512. Drawn
  // into 62 of 108dp it sits inside the 66dp circle Android never crops, with
  // 2dp to spare -- at 64 the caps touched its edge.
  .replace(/viewBox="[^"]*"/, 'viewBox="-85.4 -85.4 682.8 682.8"');
const page = (body, bg = SKY) => `<!doctype html><html><body style="margin:0;background:${bg};overflow:hidden">${body}</body></html>`;
const sized = (svg, px) => svg.replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `);

async function icons(send, frameId) {
  const svg = await svgOf();
  // App Store: 1024, opaque, full-bleed -- iOS rounds it.
  await render(send, frameId, page(sized(fullBleed(svg), 1024)), 1024, 1024,
    join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  // Play: 512, full-bleed -- Play applies its own mask.
  await render(send, frameId, page(sized(fullBleed(svg), 512)), 512, 512, join(ROOT, 'store/play/icon-512.png'));
  for (const [d, k] of Object.entries(DENSITIES)) {
    const legacy = Math.round(48 * k), layer = Math.round(108 * k);
    // Legacy launchers (API 24 and 25): the rounded square as polaris draws it.
    await render(send, frameId, page(sized(svg, legacy), 'transparent'), legacy, legacy,
      join(RES, `mipmap-${d}/ic_launcher.png`), { transparent: true });
    await render(send, frameId, page(`<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;overflow:hidden">${sized(fullBleed(svg), legacy)}</div>`, 'transparent'),
      legacy, legacy, join(RES, `mipmap-${d}/ic_launcher_round.png`), { transparent: true });
    // Adaptive (API 26+): the mark alone over the colour resource below.
    await render(send, frameId, page(sized(markOnly(svg), layer), 'transparent'), layer, layer,
      join(RES, `mipmap-${d}/ic_launcher_foreground.png`), { transparent: true });
  }
  write(join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${SKY}</color>\n</resources>\n`);

  // Launch screens: the icon on the sky colour, a third of the short side,
  // at every size Capacitor's own placeholders had.
  const splashes = [
    ['drawable/splash.png', 480, 320],
    ...['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].flatMap((d) => {
      const [w, h] = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }[d];
      return [[`drawable-port-${d}/splash.png`, w, h], [`drawable-land-${d}/splash.png`, h, w]];
    }),
  ];
  const splash = (w, h) => page(`<div style="width:${w}px;height:${h}px;display:grid;place-items:center">${sized(svg, Math.round(Math.min(w, h) / 3))}</div>`);
  for (const [rel, w, h] of splashes) await render(send, frameId, splash(w, h), w, h, join(RES, rel));
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await render(send, frameId, splash(2732, 2732), 2732, 2732, join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset', n));
  }
}

async function graphics(send, frameId) {
  const svg = await svgOf();
  // Play's feature graphic: 1024 x 500, shown above the listing and behind
  // the video if there is one. The words are the listing's own.
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 197) % 1024, y = (i * 113 + (i % 7) * 31) % 500, r = (i % 9 === 0) ? 1.6 : 0.9;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#e8ecf4" opacity="${0.25 + (i % 5) * 0.12}"/>`;
  }).join('');
  const html = page(`
    <div style="position:relative;width:1024px;height:500px;font-family:'Segoe UI',system-ui,sans-serif;color:#e8ecf4">
      <svg width="1024" height="500" style="position:absolute;inset:0">${stars}</svg>
      <div style="position:absolute;left:64px;top:110px">${sized(svg, 280)}</div>
      <div style="position:absolute;left:400px;top:132px;width:560px">
        <div style="font-size:84px;font-weight:700;letter-spacing:-1px;line-height:1">evo.polaris</div>
        <div style="font-size:34px;margin-top:22px;line-height:1.25">Sky guide and polar alignment</div>
        <div style="font-size:26px;margin-top:16px;color:#7CFFB2;line-height:1.3">One tap finds Polaris, the planets, the ISS and galaxies. For every astronomer.</div>
      </div>
    </div>`);
  await render(send, frameId, html, 1024, 500, join(ROOT, 'store/play/feature-graphic-1024x500.png'));
}

async function screens(send) {
  for (const dev of DEVICES) {
    // ONLY=3-galaxy re-shoots one scene.
    for (const scene of SCENES.filter((s) => !process.env.ONLY || s.name === process.env.ONLY)) {
      await send('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.dpr, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 8, g: 11, b: 20, a: 1 } });
      const seed = { site: PLACE, scale: scene.scale || 1, night: scene.night, trackOpen: false, mode: 'sky', galaxies: true, figures: scene.figures !== false };
      const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        (() => {
          const offset = ${NIGHT} - Date.now();
          const Real = Date;
          class Pinned extends Real {
            constructor(...a) { super(...(a.length ? a : [Real.now() + offset])); }
            static now() { return Real.now() + offset; }
          }
          globalThis.Date = Pinned;
          if (location.origin === ${JSON.stringify(new URL(BASE).origin)}) {
            localStorage.clear();
            for (const [k, v] of Object.entries(${JSON.stringify(seed)})) localStorage.setItem('polaris.' + k, JSON.stringify(v));
          }
        })();` });
      await send('Page.navigate', { url: `${BASE}/` });
      await sleep(3500);
      await send('Runtime.evaluate', {
        expression: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); ${scene.setup} })()`,
        awaitPromise: true, userGesture: true,
      });
      await sleep(1800);
      await shoot(send, join(ROOT, dev.dir, `${dev.prefix}-${scene.name}.png`));
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  }
  // The captions, for the listing and for anyone reading the folder.
  write(join(ROOT, 'store/screenshot-captions.json'),
    `${JSON.stringify(Object.fromEntries(SCENES.map((s) => [s.name, s.caption])), null, 2)}\n`);
}

async function main() {
  const what = process.argv[2] || 'all';
  const profile = mkdtempSync(join(tmpdir(), 'polaris-store-'));
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  try {
    const { ws, send } = await connect();
    await send('Page.enable');
    await send('Runtime.enable');
    const { frameTree } = await send('Page.getFrameTree');
    if (what === 'icons' || what === 'all') await icons(send, frameTree.frame.id);
    if (what === 'graphics' || what === 'all') await graphics(send, frameTree.frame.id);
    if (what === 'screens' || what === 'all') await screens(send);
    ws.close();
  } finally {
    // On Windows a plain kill leaves Chrome's children holding the profile.
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(chrome.pid)], { stdio: 'ignore' });
    else chrome.kill();
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold it */ }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

