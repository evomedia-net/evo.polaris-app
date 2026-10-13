# App Review notes

What to paste into App Store Connect's **Notes** field, and the case for the
app under Apple's guideline 4.2 (minimum functionality), which is the reason a
web app in a native shell is most often rejected.

## Notes for the reviewer

```
evo.polaris is a free sky guide and polar-alignment app for astronomers, made to be usable by people with physical disabilities, limited fine motor control or low vision. No account or sign-in is needed, and nothing is sold.

To try it indoors:
1. Allow location when asked, or press "Enter it by hand instead", type a latitude and longitude, and press "Use these numbers".
2. Press "Tonight's sky", then "Full screen". The sky shown is the real sky for that place and time.
3. Press "Track", then "Galaxies", and "Galaxies" again for the next: the view turns to each galaxy in turn and frames its photograph. Some never rise from where you are, and the app says so.
4. Use the Up, Down, Left and Right buttons to move around: no need to hold the phone to the sky.
5. Press "Use Night Mode" for the red-on-black display, and "A+" for larger text.

The app works with no network connection. Only the ISS position and an optional elevation lookup use the internet.
```

## The case under guideline 4.2

Guideline 4.2 asks that an app be more than a repackaged website. evo.polaris
is built that way because of who it is for:

- **It works fully offline.** The whole app, its 9,096-star catalogue, the
  planet and galaxy images and the magnetic model are inside the app. It is
  meant for a field at night, where there is often no signal.
- **It uses the phone's own hardware.** Location, the compass and the motion
  sensors turn the sky with the phone, and it speaks its numbers aloud through
  the system's text-to-speech.
- **It does a job a website on a phone does badly.** Large fixed buttons,
  single taps only, text up to 1.6 times larger, a WCAG Mode built to meet
  WCAG 2.2 AA, and a red Night Mode, for astronomers who cannot crouch behind
  an eyepiece or hold a phone steady.

If App Review still asks for more, the answer is in the notes above: every
feature listed runs on the phone, and none of it needs the website.
