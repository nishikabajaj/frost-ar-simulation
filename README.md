# FROST Reactor Simulation

Static site, no build step. Two modes:

- **Simulation** (default, laptop and iPhone): the 8-step reactor flow loops with a caption and a step progress bar.
- **AR** (iPhone only): camera overlay anchored to AR.js markers. **Under construction**: the prototype and its markers don't exist yet, so it runs on the standard Hiro/Kanji markers with placeholder offsets.

## Deploy to GitHub Pages

1. Create a GitHub repo and push the contents of this folder to the repo root (`index.html` must be at the top level).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After about a minute the site is live at `https://<user>.github.io/<repo>/`. Pages serves HTTPS, which iPhone camera access requires.

## Test locally

`python3 -m http.server 8000`, then open `http://localhost:8000`. Simulation works fully. The AR button is disabled on desktop; add `?ar=1` to the URL to test AR with a laptop webcam (localhost counts as secure). Camera on an iPhone needs the deployed HTTPS site.

## Test AR before the prototype exists

Print `markers/hiro.png` and the Kanji marker (generate it at https://ar-js-org.github.io/AR.js/ or use the standard AR.js Kanji image). Open the deployed site on the iPhone, tap **AR → Start camera**, and point at the marker.

## Finish AR when the prototype is ready

Edit `js/ar-config.js` only:

- `markerSizeCm`: printed marker width.
- `markers.top` / `markers.bottom`: `pattern` file (make custom ones with the AR.js marker generator) and `offsetCm`, the distance from the marker centre to the overlay centre (x right, y down, in the marker's plane). The overlay is drawn at 30 px per cm, so a 5 cm x 10 cm chamber maps 1:1 to the real one.
- `preferMarker`: which marker drives the overlay when both are visible.

## Files

- `js/sim.js`: the animation. Every frame is a pure function of loop time, shared by both modes.
- `js/app.js`: UI, mode switch, caption.
- `js/ar.js`, `js/ar-config.js`: AR.
- `vendor/`: A-Frame 1.3.0 and AR.js 3.4.5, hosted locally so the demo doesn't depend on a CDN.

## Adjust timing

`STEPS` at the top of `js/sim.js` holds each step's duration and caption. The valve and flow timings are derived from the step start times (`START`), so edit durations there first.
