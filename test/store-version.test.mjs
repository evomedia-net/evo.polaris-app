// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { storeVersion, pinnedVersion, GRADLE, PBXPROJ } from '../scripts/store-version.mjs';

// Both stores refuse an upload whose number is not higher than the last, so
// what is tested is ORDER: every step polaris's versioning can take must give
// a higher versionCode and a higher iOS version, never a lower or equal one.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

test('a polaris version maps to the numbers each store wants', () => {
  assert.deepEqual(storeVersion('0.0.1.0.69'),
    { versionName: '0.0.1.0.69', versionCode: 1000069, marketingVersion: '0.1.69', buildNumber: '1000069' });
  assert.deepEqual(storeVersion('v1.0.0.0.0'),
    { versionName: '1.0.0.0.0', versionCode: 100000000, marketingVersion: '1.0.0', buildNumber: '100000000' });
  assert.match(storeVersion('0.0.0.1.345').marketingVersion, /^\d+\.\d+\.\d+$/, 'iOS allows three numbers at most');
});

test('every step polaris can take moves both numbers up', () => {
  // The five bumps of the fleet's versioning rule: build, alpha, beta, rc and
  // release, each zeroing everything to its right.
  const steps = ['0.0.0.1.345', '0.0.0.1.346', '0.0.0.2.0', '0.0.1.0.0', '0.0.1.0.69', '0.0.1.0.70',
    '0.0.2.0.0', '0.1.0.0.0', '0.1.0.0.99999', '0.2.0.0.0', '1.0.0.0.0', '1.0.0.0.1', '2.0.0.0.0'];
  for (let i = 1; i < steps.length; i++) {
    const a = storeVersion(steps[i - 1]), b = storeVersion(steps[i]);
    assert.ok(b.versionCode > a.versionCode, `${steps[i - 1]} -> ${steps[i]}: versionCode ${a.versionCode} -> ${b.versionCode}`);
    assert.ok(cmp(b.marketingVersion, a.marketingVersion) > 0, `${steps[i - 1]} -> ${steps[i]}: iOS ${a.marketingVersion} -> ${b.marketingVersion}`);
  }
});

test('past the range that keeps the order, it throws instead of going backwards', () => {
  assert.throws(() => storeVersion('0.0.10.0.0'), /beta 10/);
  assert.throws(() => storeVersion('0.0.1.0.100000'), /build 100000/);
  assert.throws(() => storeVersion('21.0.0.0.0'), /major 21/);
  assert.throws(() => storeVersion('1.0.0.0'), /five-part/);
  assert.ok(storeVersion('20.9.9.9.99999').versionCode < 2100000000, "under Play's ceiling at the top of the range");
});

test('both projects carry the numbers of the polaris they bundle', () => {
  // A pin moved without `npm run store-version` would upload the old numbers.
  const v = storeVersion(pinnedVersion(ROOT));
  const gradle = readFileSync(`${ROOT}/${GRADLE}`, 'utf8');
  assert.match(gradle, new RegExp(`versionCode ${v.versionCode}\\b`), 'run: npm run store-version');
  assert.match(gradle, new RegExp(`versionName "${v.versionName.replace(/\./g, '\\.')}"`));
  const pbx = readFileSync(`${ROOT}/${PBXPROJ}`, 'utf8');
  const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
  const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(marketing.length >= 2 && marketing.every((x) => x === v.marketingVersion), `iOS: ${marketing.join(', ')}`);
  assert.ok(builds.length >= 2 && builds.every((x) => x === v.buildNumber), `iOS builds: ${builds.join(', ')}`);
});
