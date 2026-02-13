# Pokémon Catcher (APK starter)

This is a **Capacitor + Vite + React** project that builds into an **installable Android APK**.

It implements:
- Tap a big Poké Ball to spawn a **random Pokémon (1–1025)**.
- Show 4 ball types (Poké/Great/Ultra/Master) with inventories.
- Uses **official base catch rates** via PokéAPI `pokemon-species.capture_rate` (0–255).
- Ball throw animation: ball overlays Pokémon → shake → success sparkles or break + Pokémon returns.
- **PC Box** screen shows caught Pokémon in a grid.
- Inventory + caught list persist via **localStorage** (works inside Android WebView).

## What you need on your PC
- Node.js 18+ (you have this already)
- Android Studio (includes SDK + build tools)
- Java 17 (Android Studio can install; project expects JDK 17)

## Run as a web app (fast dev)
```bash
npm install
npm run dev
```

## Build and generate an Android APK (debug)
1) Install dependencies and build web assets:
```bash
npm install
npm run build
```

2) Initialize Capacitor and add Android (first time only):
```bash
npx cap init PokemonCatcher com.yourname.pokemoncatcher --web-dir=dist
npx cap add android
```

3) Copy web build into Android:
```bash
npx cap copy android
```

4) Open Android Studio:
```bash
npx cap open android
```

5) In Android Studio:
- Build > **Build Bundle(s) / APK(s)** > **Build APK(s)**
- When it finishes, Android Studio will show a link to the APK location.

### Install the APK on your phone
- Enable Developer Options + USB debugging, then:
```bash
adb install -r path/to/app-debug.apk
```

## Notes
- Sprites: tries **Pokémon Showdown dex sprites** first:
  `https://play.pokemonshowdown.com/sprites/dex/{toID(name)}.png`
  If a filename mismatch happens for certain special names/forms, it falls back to PokéAPI official artwork.
- Catch chance (simple, Pokémon-like without HP/status):
  `chance = min(1, (captureRate * ballModifier)/255)`
  Master Ball is always catch.

If you want the full “HP + status + multiple shakes” Gen 3+ formula, tell me and I’ll upgrade the logic.
