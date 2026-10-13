# Privacy answers for the store forms

Google Play's **Data safety** form and Apple's **App Privacy** labels, answered
from what the app does. The source of truth is the privacy policy at
https://polaris.evomedia.net/privacy.html, which evo.polaris's own tests keep
in step with its code. Kelly confirms these when filling in each form.

## What the app sends, in one table

| Request | When | What leaves the phone |
| --- | --- | --- |
| Open-Meteo, elevation | Only when the person presses the elevation button | The latitude and longitude in the location boxes |
| wheretheiss.at | When the sky view or Find the ISS needs the station | Nothing about the person: a list of times |
| Our server | Never, from the store apps | Nothing |

There is no account, no analytics library, no crash reporter and no
advertising SDK in the app. Settings stay in the app's own storage on the
phone.

## Google Play: Data safety

Google counts data as **collected** when the app sends it off the phone, even
to someone else's service and even for a moment. So:

- **Does your app collect or share any of the required user data types?** Yes.
- **Location, precise location:** collected, not shared.
  - Processed ephemerally: **yes**. Open-Meteo answers with an elevation; the
    app keeps nothing.
  - Required or optional: **optional**. Only the elevation button sends it,
    and the app works fully without it.
  - Purpose: **App functionality**.
- **Every other data type:** not collected, not shared.
- **Is all of the user data collected by your app encrypted in transit?** Yes
  (HTTPS).
- **Do you provide a way for users to request that their data be deleted?**
  No data is kept, so there is nothing to delete; say so in the form's
  explanation field.

## App Store: App Privacy

Apple counts data as **collected** only when it leaves the phone in a way that
lets the developer or its partners keep it longer than it takes to answer the
request. The elevation lookup is answered on the spot and the app keeps
nothing, and the ISS request carries nothing about the person. So:

- **Data Not Collected.**

This is a judgement on Apple's definition, and the one place to look twice:
if in doubt, declare **Location, precise location**, not linked to identity,
not used for tracking, for **App Functionality**, which is accurate either way.

## Permissions the apps ask for

| Permission | Why, in the words the app shows |
| --- | --- |
| Location (when in use) | To work out where the stars and the pole are from where you stand |
| Motion and orientation (iOS) | To turn the sky with your phone |

Both are optional: the location can be typed in, and Manual Mode steers the
sky with buttons.
