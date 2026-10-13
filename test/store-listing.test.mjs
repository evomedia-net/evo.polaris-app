// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEVICES, SCENES } from '../scripts/make-store-images.mjs';

// THE LISTING FITS THE STORES, AND THE IMAGES ARE THE SIZES THEY ASK FOR.
//
// A field over its limit is refused at the moment of pasting it, and a
// screenshot at the wrong size is refused at upload -- both found by Kelly, on
// a phone, mid-form. These find them here instead.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const listing = readFileSync(`${ROOT}/store/listing.md`, 'utf8').replace(/\r\n/g, '\n');

/** Every "### Field (limit)" heading with the fenced text under it. */
function fields() {
  const out = [];
  const re = /^### (.+?)(?: \((\d+)\))?\n\n```\n([\s\S]*?)\n```/gm;
  for (const m of listing.matchAll(re)) out.push({ name: m[1], limit: m[2] ? Number(m[2]) : null, text: m[3] });
  return out;
}

test('every field is within its store limit', () => {
  const f = fields();
  assert.ok(f.length >= 14, `found ${f.length} fields`);
  for (const { name, limit, text } of f) {
    if (limit) assert.ok([...text].length <= limit, `${name}: ${[...text].length} characters, limit ${limit}`);
    assert.ok(text.trim().length > 0, `${name} is empty`);
  }
});

test('the listing describes what exists, and links the policy the stores require', () => {
  // The fleet rule: public copy names what exists today, never what is coming.
  assert.doesNotMatch(listing, /coming soon|soon|roadmap|will be added|in a future/i);
  const f = Object.fromEntries(fields().map((x) => [x.name, x.text]));
  assert.equal(f['Privacy policy URL'], 'https://polaris.evomedia.net/privacy.html');
  // Apple's keywords are one comma-separated list, no spaces wasted after commas.
  assert.doesNotMatch(f['Keywords (100)'] ?? f.Keywords, /, /);
  // The same name in both stores.
  assert.equal(f['App name'], f.Name);
});

test('every screenshot and graphic is the size its store asks for', () => {
  const size = (rel) => { const b = readFileSync(`${ROOT}/${rel}`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const d of DEVICES) {
    for (const s of SCENES) {
      assert.deepEqual(size(`${d.dir}/${d.prefix}-${s.name}.png`), [d.w * d.dpr, d.h * d.dpr], `${d.prefix}-${s.name}`);
    }
  }
  assert.deepEqual(size('store/play/icon-512.png'), [512, 512]);
  assert.deepEqual(size('store/play/feature-graphic-1024x500.png'), [1024, 500]);
  // Play: no side over 3840, and the long side at most twice the short.
  for (const s of SCENES) {
    const [w, h] = size(`store/play/phone-${s.name}.png`);
    assert.ok(Math.max(w, h) <= 3840 && Math.max(w, h) <= 2 * Math.min(w, h), `phone-${s.name} is ${w}x${h}`);
  }
  assert.ok(statSync(`${ROOT}/store/screenshot-captions.json`).size > 0);
});

test('the App Store icon is 1024 square and has no alpha channel', () => {
  // App Store Connect rejects an icon with an alpha channel, even an opaque one.
  const png = readFileSync(`${ROOT}/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024]);
  assert.equal(png[25], 2, 'PNG colour type 2 (RGB); 6 would carry alpha');
});
