evo.polaris-app
===============

The Google Play and Apple App Store builds of
evo.polaris (https://github.com/evomedia-net/evo.polaris): a free night-sky
guide and polar-alignment app, made for every astronomer, including
astronomers with physical disabilities, limited fine motor control or low
vision.

This repo holds no app code of its own. It takes one released version of
polaris, the same files polaris.evomedia.net (https://polaris.evomedia.net)
serves, and bundles it inside a Capacitor (https://capacitorjs.com) shell,
so the store app works fully offline from the first launch.

How a build is made
-------------------

    npm ci
    npm run fetch-site      # download the pinned polaris release into www/
    npx cap sync            # copy www/ into the Android and iOS projects

fetch-site downloads the release zip named by "polaris": { "version" } in
package.json, checks it against the release's own .sha256, then checks
every file inside against the zip's CHECKSUMS.txt. Nothing unchecked
reaches the app. It changes two things in the page, both described in
scripts/fetch-site.mjs:

- it adds native-shim.js in front of polaris's own script;
- it drops viewport-fit=cover, so the page stays clear of the phone's
  status and navigation bars, which sit on black.

To ship a newer polaris, change that version, run npm run fetch-site, and
build.

What the shell adds
-------------------

src/native-shim.js, and only where a phone's web view falls short:

- Speech on Android. Android's web view has no working speech engine, so
  "reads its numbers out loud" goes through the phone's own text-to-speech,
  via the community TextToSpeech plugin. On iOS the web view speaks by
  itself.
- Full screen hides the phone's bars. Entering full screen hides the
  status and navigation bars; leaving shows them again.

Permissions are only the ones polaris uses:

- Location, asked for when "Use my location" is pressed.
- Vibration, for the buzz when the phone points at Polaris.
- The internet, for the ISS position and the optional elevation lookup.

On iOS, the motion sensors that turn the sky view also ask first.

Android
-------

Needs JDK 21 and the Android SDK (platform 36).

    cd android
    ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
    ./gradlew bundleRelease     # the .aab Google Play takes, once signing is set up

The app id is net.evomedia.polaris.

iOS
---

An iOS app can only be built on a Mac, so this repo builds it on GitHub's
macOS runners (.github/workflows/ios.yml). The project uses Swift Package
Manager, not CocoaPods.

Tests
-----

    npm test

The tests cover:

- the release reader: unzip, checksums, and the two page edits;
- the shim: speech reaching the plugin, and the bars hiding in full screen;
- that every README has a plain-text twin in sync.

Licence
-------

MIT. See LICENSE. polaris's bundled data and pictures keep their
own terms, listed in the polaris README.
