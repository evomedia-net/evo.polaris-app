// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const src = readFileSync(fileURLToPath(new URL('../src/native-shim.js', import.meta.url)), 'utf8');

/** Run the shim in a fake window; returns the window and what reached the plugins. */
function run({ platform = 'android', native = true, capacitor = true } = {}) {
  const calls = [];
  const listeners = {};
  const window = {};
  const document = { fullscreenElement: null, addEventListener: (t, f) => { listeners[t] = f; } };
  if (capacitor) {
    window.Capacitor = {
      isNativePlatform: () => native,
      getPlatform: () => platform,
      Plugins: {
        TextToSpeech: {
          speak: (o) => { calls.push(['speak', o]); return Promise.resolve(); },
          stop: () => { calls.push(['stop']); return Promise.resolve(); },
        },
        SystemBars: {
          hide: () => { calls.push(['hide']); return Promise.resolve(); },
          show: () => { calls.push(['show']); return Promise.resolve(); },
        },
      },
    };
  }
  vm.runInNewContext(src, { window, document, Object, String, Promise });
  return { window, document, calls, listeners };
}

test('in a browser it does nothing', () => {
  const { window, listeners } = run({ capacitor: false });
  assert.equal(window.speechSynthesis, undefined);
  assert.equal(listeners.fullscreenchange, undefined);
});

test('on Android, polaris\'s speech calls reach the phone\'s text-to-speech', async () => {
  const { window, calls } = run();
  // Exactly what polaris does when Speak is pressed (site/src/app.js).
  window.speechSynthesis.cancel();
  const u = new window.SpeechSynthesisUtterance('Set the altitude axis to thirty-two degrees');
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls[0], ['stop']);
  assert.equal(calls[1][0], 'speak');
  assert.equal(calls[1][1].text, 'Set the altitude axis to thirty-two degrees');
  assert.equal(calls[1][1].rate, 0.92);
});

test('on iOS the web view speaks for itself, so speech is left alone', () => {
  const { window } = run({ platform: 'ios' });
  assert.equal(window.speechSynthesis, undefined);
});

test('full screen hides the phone\'s bars, and leaving shows them', async () => {
  const { document, calls, listeners } = run({ platform: 'ios' });
  document.fullscreenElement = {};
  listeners.fullscreenchange();
  document.fullscreenElement = null;
  listeners.fullscreenchange();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [['hide'], ['show']]);
});
