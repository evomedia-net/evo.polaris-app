// evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

// WHAT THE APP NEEDS THAT A PHONE'S WEB VIEW DOES NOT GIVE IT.
//
// Polaris is used unchanged inside the store app. This plain script runs
// before it and fills the one gap that matters:
//
//   * SPEECH ON ANDROID. "Reads its numbers out loud" is the app's promise
//     to anyone who cannot look at the screen while at the mount, and
//     Android's WebView has no working speechSynthesis -- in Chrome the
//     button speaks, in the app it would say "This browser has no speech
//     engine". So on Android, speechSynthesis and SpeechSynthesisUtterance
//     are provided here and handed to the phone's own text-to-speech engine
//     through the TextToSpeech plugin. Polaris's code does not change.
//
//   * FULL SCREEN THAT IS FULL. The web Fullscreen API fills the app's
//     window but leaves the phone's status and navigation bars showing. So
//     entering full screen hides them, and leaving shows them again.
//
// In a browser (no Capacitor) this does nothing.
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;

  document.addEventListener('fullscreenchange', function () {
    var bars = C.Plugins && C.Plugins.SystemBars;
    if (!bars) return;
    (document.fullscreenElement ? bars.hide() : bars.show()).catch(function () {});
  });

  if (C.getPlatform() !== 'android') return;

  function call(method, options) {
    var p = C.Plugins && C.Plugins.TextToSpeech;
    if (p && typeof p[method] === 'function') return p[method](options || {});
    return C.nativePromise('TextToSpeech', method, options || {});
  }

  function Utterance(text) {
    this.text = String(text == null ? '' : text);
    this.lang = 'en-US';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onend = null;
    this.onerror = null;
  }

  var synth = {
    speaking: false,
    pending: false,
    paused: false,
    speak: function (u) {
      synth.speaking = true;
      call('speak', { text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch, volume: u.volume })
        .then(function () { synth.speaking = false; if (u.onend) u.onend({ utterance: u }); })
        .catch(function (e) { synth.speaking = false; if (u.onerror) u.onerror({ utterance: u, error: String(e) }); });
    },
    cancel: function () { synth.speaking = false; call('stop').catch(function () {}); },
    pause: function () {},
    resume: function () {},
    getVoices: function () { return []; },
  };

  // speechSynthesis is an accessor on Window.prototype in some engines, so
  // plain assignment can be silently ignored. Define it on window itself.
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
})();
