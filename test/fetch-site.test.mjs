// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzip, parseChecksums, injectShim, appViewport, sha256 } from '../scripts/fetch-site.mjs';

// A minimal zip, built here so the reader is tested against the format and
// not against itself: one stored entry, one deflated, and a directory.
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of entries) {
    const nameBuf = Buffer.from(name);
    const body = deflate ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('unzip reads stored and deflated entries, and skips directories', () => {
  const text = Buffer.from('the same words, over and over, so deflate has something to do. '.repeat(20));
  const zip = makeZip([
    { name: 'r/', data: Buffer.alloc(0) },
    { name: 'r/a.txt', data: Buffer.from('stored') },
    { name: 'r/b.txt', data: text, deflate: true },
  ]);
  const files = unzip(zip);
  assert.deepEqual(Object.keys(files).sort(), ['r/a.txt', 'r/b.txt']);
  assert.equal(files['r/a.txt'].toString(), 'stored');
  assert.ok(files['r/b.txt'].equals(text));
});

test('unzip refuses something that is not a zip', () => {
  assert.throws(() => unzip(Buffer.from('not a zip at all, just text that is long enough')), /not a zip/);
});

test('checksum lines become a path -> hash map', () => {
  const h = sha256(Buffer.from('x'));
  const sums = parseChecksums(`${h}  site/index.html\r\n${h}  LICENSE\n\nnot a line\n`);
  assert.deepEqual(sums, { 'site/index.html': h, LICENSE: h });
});

test('the shim goes in front of the first module script, once', () => {
  const html = '<head></head><body><script type="module" src="src/app.js"></script></body>';
  const once = injectShim(html);
  assert.ok(once.indexOf('native-shim.js') < once.indexOf('type="module"'));
  assert.equal(injectShim(once), once, 'running twice must not add it twice');
  assert.throws(() => injectShim('<p>no scripts</p>'), /no module script/);
});

test('the app viewport drops viewport-fit=cover and keeps the rest', () => {
  const html = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
  assert.equal(appViewport(html), '<meta name="viewport" content="width=device-width, initial-scale=1">');
  assert.equal(appViewport('<meta name="viewport" content="width=device-width">'), '<meta name="viewport" content="width=device-width">');
});

test('the polaris version is pinned to a released five-part version', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.match(pkg.polaris.version, /^\d+\.\d+\.\d+\.\d+\.\d+$/);
});
