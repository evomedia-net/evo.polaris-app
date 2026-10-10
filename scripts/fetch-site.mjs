// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

// PUT A RELEASED POLARIS INSIDE THE APP.
//
// The store app is the web app, bundled: every file the site serves, taken
// from one published polaris release and nothing else. Not a checkout, not
// "whatever is on main": a release is what polaris.evomedia.net actually
// ran, it is a zip with a checksum beside it, and the zip carries a
// checksum for every file inside. Both are checked before anything is used.
//
// The version is pinned in package.json ("polaris": { "version": ... }),
// so a store build names exactly which polaris it ships.
//
//     npm run fetch-site
//
// No unzip tool and no dependency: release zips are plain deflate, so the
// reader below is Node's zlib and about forty lines.

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'www');
const CACHE = join(root, '.cache');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Every file in a zip, as { name: Buffer }. Stored and deflated entries only. */
export function unzip(buf) {
  // The end-of-central-directory record is in the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20);   // compressed size
    const size = buf.readUInt32LE(at + 24);     // uncompressed size
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: corrupt local header`);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + packed);
    if (method === 0) files[name] = Buffer.from(raw);
    else if (method === 8) files[name] = inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method} is not supported`);
    if (files[name].length !== size) throw new Error(`${name}: ${files[name].length} bytes, expected ${size}`);
  }
  return files;
}

/** "hash  path" lines into { path: hash }. */
export function parseChecksums(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (m) out[m[2].trim()] = m[1];
  }
  return out;
}

/**
 * KEEP THE PAGE CLEAR OF THE PHONE'S OWN BARS. polaris asks for
 * viewport-fit=cover, and on a recent Android WebView that lets the page run
 * under the status bar -- where its header, which only pads for the notch in
 * full screen, would sit under the clock. Without it, Capacitor pads the page
 * natively and the bars sit on black (the app theme). Full screen hides the
 * bars outright (native-shim.js), so nothing is lost there.
 */
export function appViewport(html) {
  return html.replace(/(<meta name="viewport" content="[^"]*?),\s*viewport-fit=cover/, '$1');
}

/** The first module script gets the native shim in front of it. */
export function injectShim(html) {
  const tag = '<script src="native-shim.js"></script>\n';
  if (html.includes('native-shim.js')) return html;
  const at = html.indexOf('<script type="module"');
  if (at < 0) throw new Error('index.html has no module script to put the shim in front of');
  return html.slice(0, at) + tag + html.slice(at);
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const v = pkg.polaris?.version;
  if (!/^\d+\.\d+\.\d+\.\d+\.\d+$/.test(v || '')) throw new Error('package.json needs "polaris": { "version": "x.x.x.x.x" }');
  const name = `evo.polaris-v${v}.zip`;
  const base = `https://raw.githubusercontent.com/evomedia-net/evo.polaris/v${v}/releases/`;

  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, name);
  const zip = existsSync(cached) ? readFileSync(cached) : await get(base + name);
  const want = (await get(base + name + '.sha256')).toString('utf8').split(/\s+/)[0];
  if (sha256(zip) !== want) throw new Error(`${name}: checksum does not match the release's .sha256`);
  writeFileSync(cached, zip);

  const files = unzip(zip);
  const top = `evo.polaris-v${v}/`;
  const sums = parseChecksums(files[top + 'CHECKSUMS.txt']?.toString('utf8') || '');
  let checked = 0;
  for (const [path, hash] of Object.entries(sums)) {
    const f = files[top + path];
    if (!f) throw new Error(`${path}: listed in CHECKSUMS.txt but not in the zip`);
    if (sha256(f) !== hash) throw new Error(`${path}: checksum does not match CHECKSUMS.txt`);
    checked++;
  }

  rmSync(OUT, { recursive: true, force: true });
  let written = 0;
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith(top + 'site/')) continue;
    if (!sums[path.slice(top.length)]) throw new Error(`${path}: in the zip but not in CHECKSUMS.txt`);
    const dest = join(OUT, path.slice((top + 'site/').length));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    written++;
  }
  const index = join(OUT, 'index.html');
  writeFileSync(index, injectShim(appViewport(readFileSync(index, 'utf8'))));
  copyFileSync(join(root, 'src', 'native-shim.js'), join(OUT, 'native-shim.js'));
  console.log(`polaris v${v}: ${checked} checksums verified, ${written} site files in www/, shim added`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
