# evo.polaris-app

The Google Play and Apple App Store builds of
[evo.polaris](https://github.com/evomedia-net/evo.polaris): a free night-sky
guide and polar-alignment app, made for every astronomer, including
astronomers with physical disabilities, limited fine motor control or low
vision.

This repo holds no app code of its own. It takes one **released** version of
polaris, the same files [polaris.evomedia.net](https://polaris.evomedia.net)
serves, and bundles it inside a [Capacitor](https://capacitorjs.com) shell,
so the store app works fully offline from the first launch.

## How a build is made

```
npm ci
npm run sync    # fetch the pinned polaris, set the store numbers, cap sync
```

`npm run sync` is three steps, which can also be run one at a time:
`npm run fetch-site` downloads the pinned polaris release into `www/`,
`npm run store-version` writes the store version numbers into both projects,
and `npx cap sync` copies `www/` into the Android and iOS projects.

`fetch-site` downloads the release zip named by `"polaris": { "version" }` in
`package.json`, checks it against the release's own `.sha256`, then checks
every file inside against the zip's `CHECKSUMS.txt`. Nothing unchecked
reaches the app. It changes two things in the page, both described in
`scripts/fetch-site.mjs`:

- it adds `native-shim.js` in front of polaris's own script;
- it drops `viewport-fit=cover`, so the page stays clear of the phone's
  status and navigation bars, which sit on black.

To ship a newer polaris, change that version, run `npm run sync`, and build.

## Store version numbers

Neither store takes polaris's five-part version, so
`scripts/store-version.mjs` maps it, and both stores refuse an upload whose
number is not higher than the last:

| Store | Field | From polaris 0.0.1.0.69 |
| --- | --- | --- |
| Google Play | versionName | 0.0.1.0.69 |
| Google Play | versionCode | 1000069 |
| App Store | version (MARKETING_VERSION) | 0.1.69 |
| App Store | build (CURRENT_PROJECT_VERSION) | 1000069 |

The order of polaris versions is kept while rc, beta and alpha stay under 10
and build under 100000; past that the script stops rather than hand a store
a number that goes backwards. The numbers come from polaris, so each store
upload carries a new polaris release.

## What the shell adds

`src/native-shim.js`, and only where a phone's web view falls short:

- **Speech on Android.** Android's web view has no working speech engine, so
  "reads its numbers out loud" goes through the phone's own text-to-speech,
  via the community TextToSpeech plugin. On iOS the web view speaks by
  itself.
- **Full screen hides the phone's bars.** Entering full screen hides the
  status and navigation bars; leaving shows them again.

Permissions are only the ones polaris uses:

- **Location**, asked for when "Use my location" is pressed.
- **Vibration**, for the buzz when the phone points at Polaris.
- **The internet**, for the ISS position and the optional elevation lookup.

On iOS, the motion sensors that turn the sky view also ask first.

## Android

Needs JDK 21 and the Android SDK (platform 36).

```
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab
```

The app id is `net.evomedia.polaris`.

**Release signing.** Google Play takes a bundle signed with the app's
**upload key**, and with Play App Signing turned on (it is, for any new app)
Google holds the key that signs what phones get, so a lost upload key can be
reset. The upload key never enters this repo. `POLARIS_SIGNING` names a
properties file beside it on the machine that builds releases:

```
storeFile=<path to the upload keystore>
storePassword=...
keyAlias=polaris-upload
keyPassword=...
```

With `POLARIS_SIGNING` unset, `bundleRelease` still builds, unsigned, and
Play will refuse it -- on purpose, rather than a build signed with whatever
key was lying around. The keystore and its properties file are backed up
together.

## iOS

An iOS app can only be built on a Mac, so this repo builds it on GitHub's
macOS runners. The project uses Swift Package Manager, not CocoaPods.

- `.github/workflows/ios.yml` builds for the simulator, unsigned, on every
  push: proof the project compiles.
- `.github/workflows/ios-release.yml`, run by hand, archives a signed build
  and uploads it to TestFlight. Signing is Xcode's cloud-managed signing,
  driven by an App Store Connect API key, so no certificate or provisioning
  profile is exported or stored. It needs four repo secrets, named at the
  top of the workflow, and stops naming any that is missing.

## Store listing

`store/` holds everything a store listing asks for:

- `listing.md`: the name, descriptions, keywords, categories and URLs for
  both stores, each under its character limit;
- `privacy-answers.md`: Google Play's Data safety form and Apple's App
  Privacy labels, answered from the privacy policy at
  https://polaris.evomedia.net/privacy.html;
- `app-review-notes.md`: the notes for App Review, and the case under
  Apple's minimum-functionality guideline;
- `play/` and `ios/`: the screenshots, the Play icon and feature graphic.

`scripts/make-store-images.mjs` draws the images and the native icons and
launch screens from a running polaris with headless Chrome, so a new polaris
release is one re-run from new store images.

## Tests

```
npm test
```

The tests cover:

- the release reader: unzip, checksums, and the two page edits;
- the shim: speech reaching the plugin, and the bars hiding in full screen;
- the store numbers: every step polaris's versioning can take moves both
  stores' numbers up, and both projects carry the numbers of the polaris they
  bundle;
- the listing: every field within its store's limit, and every screenshot,
  graphic and icon the size its store asks for, the App Store icon with no
  alpha channel;
- that every prose document has a plain-text twin in sync.

## Licence

MIT. See [LICENSE](LICENSE). polaris's bundled data and pictures keep their
own terms, listed in the polaris README.
