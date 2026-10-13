// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

// THE STORE VERSION NUMBERS, FROM THE POLARIS VERSION THE APP CARRIES.
//
// polaris has a five-part version, v{major}.{rc}.{beta}.{alpha}.{build},
// compared left to right. The stores want less:
//
//   Android  versionName  any text      -> the polaris version as written
//            versionCode  one integer   -> the five parts as digits
//   iOS      MARKETING_VERSION  at most three numbers
//                           -> {major}.{rc*10 + beta}.{alpha*100000 + build}
//            CURRENT_PROJECT_VERSION -> the same integer as versionCode
//
// Both stores refuse an upload whose number is not higher than the last one,
// so the one property that matters is that the mapping keeps the order of
// the five-part versions. It does while rc, beta and alpha stay under 10 and
// build under 100000, and the integer stays under Play's 2,100,000,000 while
// major is 20 or less. Past any of those this throws rather than hand a store
// a number that goes backwards; the scheme then needs widening on purpose.
//
// One store upload per polaris release: a change to the shell alone rides the
// next polaris release, because the numbers come from polaris.
//
// Usage: node scripts/store-version.mjs          prints the numbers
//        node scripts/store-version.mjs --apply  writes them into both projects

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GRADLE = 'android/app/build.gradle';
export const PBXPROJ = 'ios/App/App.xcodeproj/project.pbxproj';

/** The store numbers for one polaris version, or a throw if it will not fit. */
export function storeVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!m) throw new Error(`"${version}" is not a five-part polaris version`);
  const [major, rc, beta, alpha, build] = m.slice(1).map(Number);
  for (const [name, v, max] of [['rc', rc, 9], ['beta', beta, 9], ['alpha', alpha, 9], ['build', build, 99999], ['major', major, 20]]) {
    if (v > max) throw new Error(`${version}: ${name} ${v} is past ${max}, where the store numbers stop keeping their order`);
  }
  const versionCode = (((major * 10 + rc) * 10 + beta) * 10 + alpha) * 100000 + build;
  return {
    versionName: `${major}.${rc}.${beta}.${alpha}.${build}`,
    versionCode,
    marketingVersion: `${major}.${rc * 10 + beta}.${alpha * 100000 + build}`,
    buildNumber: String(versionCode),
  };
}

/** The polaris version this app is pinned to. */
export function pinnedVersion(root = ROOT) {
  return JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).polaris.version;
}

/** Rewrite both projects' numbers; returns the files it changed. */
export function apply(root = ROOT, version = pinnedVersion(root)) {
  const v = storeVersion(version);
  const changed = [];
  const edit = (rel, fn) => {
    const file = `${root}/${rel}`;
    const before = readFileSync(file, 'utf8');
    const after = fn(before);
    if (after !== before) { writeFileSync(file, after); changed.push(rel); }
  };
  edit(GRADLE, (s) => s
    .replace(/versionCode \d+/, `versionCode ${v.versionCode}`)
    .replace(/versionName "[^"]*"/, `versionName "${v.versionName}"`));
  edit(PBXPROJ, (s) => s
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${v.marketingVersion};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${v.buildNumber};`));
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = pinnedVersion();
  const v = storeVersion(version);
  console.log(`polaris ${version}\n  Android versionName ${v.versionName}, versionCode ${v.versionCode}\n  iOS ${v.marketingVersion} (${v.buildNumber})`);
  if (process.argv.includes('--apply')) {
    const changed = apply();
    console.log(changed.length ? `  wrote ${changed.join(', ')}` : '  both projects already carry these numbers');
  }
}
