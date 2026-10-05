# Login with Amazon and the Alexa demo hook

Both are **off until configured**. Without them the table works exactly the same: the sign-in screen
offers the test account, and scene changes stay on the table.

**TVs and Other Devices** on the security profile is for code-based linking on a TV that does not
run our app. This table does not use it. The website uses **Web Settings**. The Fire TV Stick app
uses **Android/Kindle Settings** (the API key), and only when you rebuild the APK.

## 1. Security profile (once)

1. Sign in to the [Amazon Developer Console](https://developer.amazon.com/) → **Login with Amazon** →
   **Create a New Security Profile**. Name it `D20 FireVerse`, add a privacy notice URL.
2. **Web Settings** of that profile:
   - *Allowed Origins*: `https://www.d20fireverse.it`
   - *Allowed Return URLs*: `https://www.d20fireverse.it/api/login/amazon/callback`
   - Copy the **Client ID** and **Client Secret**.
3. **Android/Kindle Settings** of that profile → *Add an API Key*:
   - *Package*: `com.d20fireverse.tv`
   - *MD5* and *SHA-256* signature of the **release keystore** (the one that signs the Stick APK):

     ```bash
     keytool -list -v -keystore ~/.local/share/d20-fireverse/release.keystore -alias fireverse
     ```

   - Copy the generated **API key** (a long JWT-like string).

Scope requested: `profile` (the stable `amzn1.account…` id, plus the customer's name). Amazon
refuses that scope until the Login with Amazon consent screen has a Consent Privacy Notice URL.
The table stores `amazon_user_id` and does not check Prime. A sign-in that arrived before the name
was available is called `adventurer` until the next Amazon sign-in, which replaces that placeholder.

## 2. Table server

Sign in as an admin → **Manage the table** → **Amazon** (the tab after Mail). Paste the Client ID
and Client Secret from Web Settings and press Save. They are stored in `backend/data/amazon.json`
(gitignored, same place as the Brevo key) and the next sign-in uses them. No restart.

`GET /api/auth/options` answers `{"amazon":true}` and the site shows **Continue with Amazon**.
Log out of the table to see the button; a reload is not required after that.

Environment variables still work when nothing is saved:

```bash
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxx
AMAZON_CLIENT_SECRET=xxxxxxxx
# Only when the public address differs:
# AMAZON_REDIRECT_URI=https://www.d20fireverse.it/api/login/amazon/callback
```

| Route | Use |
|-------|-----|
| `GET /api/login/amazon/start` | Web: redirect to Amazon (state cookie, 10 min) |
| `GET /api/login/amazon/callback` | Web: code → token → profile → session, back to `/` |
| `POST /api/login/amazon` `{accessToken}` | Fire TV app: token from the LWA SDK, checked with `tokeninfo` (`aud` = our client id) |

The first Amazon sign-in creates a player account named after the Amazon profile; later sign-ins find
it by `amazon_user_id`. Disabled accounts stay locked out.

## 3. Fire TV app

```bash
firetv/scripts/fetch-lwa-sdk.sh                                  # SDK → firetv/app/libs/ (not redistributable, gitignored)
printf '%s' 'PASTE-THE-API-KEY' > firetv/app/src/main/assets/api_key.txt   # gitignored
cd firetv && ./gradlew lintRelease assembleRelease                # sign with the release keystore (README)
```

Without the jar the app builds with a stub; without `api_key.txt` the SDK build reports itself
unavailable. In both cases the Stick shows the test account. With both, **Login with Amazon** is the
main button on the Stick, the test account sits below it, and a returning player is signed in
silently at start. Log out also forgets the Amazon approval on that TV.

## 4. Alexa demo hook (optional)

```bash
ALEXA_DEMO_WEBHOOK=https://example.invalid/your-routine-trigger
```

When the room's `alexaScene` changes (title, explore, combat, boss, victory…), the table POSTs
`{"roomCode","scene","at"}` as JSON to that URL, once per change, with a 4 s timeout. Point it at a
virtual-switch service whose switch starts an Alexa Routine on **our** account (lights, Echo
announcement). There is no skill. Without the variable no request is made and nothing is logged.
