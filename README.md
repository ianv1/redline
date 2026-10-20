# Redline

A speedometer and tachometer for a car that has neither: a web page meant for
the browser in an electric car. Speed comes from the browser's GPS. The engine
is invented. Road speed runs through a virtual gearbox to produce a
gear and an rpm, and that rpm drives both the tach needle and the engine note,
so the car sounds like it is shifting through the gears as you drive. Every
engine is a real recording of a real car: a Lamborghini V12, a Lexus V10 and a
Ferrari V8.
The picker describes the engines rather than naming the cars; each pack's
`CREDITS.md` says which car was recorded.

The look follows the Ferrari Luce cluster: round dials behind glass with thin
anodised-aluminium rings, cream numerals on near-black in the manner of 1960s
Veglia instruments, a red needle, and the digital speed nested inside the dial.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL and tap **Start**. On a desk there is no GPS, so open it
as `/?demo` instead: speed then comes from a small car model you drive with
the up arrow (or W) to accelerate and the down arrow (or S) to brake. Press
`U` to switch km/h and mph (or open the site once with `?units=mph`, which is
remembered), `M` to silence the engine and bring it back, `E` to cycle
engines. Hold `R`, or
the **Rev** button under the dials, to rev the engine with the clutch in: it
climbs to redline, bounces on the limiter, and drops back when you let go.
That works while driving too, since it never touches the speed.

`npm run build` writes a static site to `dist/`. Host it anywhere that serves
HTTPS; the Geolocation API refuses to work on plain HTTP.

## Engines

Every engine is a recording of a real car (see Sounds). Pick one on the start
screen or from the **Engine** chip in the status bar while driving; `E` cycles
through them and the choice is remembered.

| Picker label | Recorded car (see its CREDITS.md) | Idle / redline rpm | Recorded sweep |
| --- | --- | --- | --- |
| Electric motor | Tesla Model S Plaid | none | motor whine keyed to speed, about 28 to 160 km/h |
| 6.5 L V12, supercar | Lamborghini Murciélago LP670-4 SV | 915 / 8000 | 1400 to 8400 rpm over two revs |
| 4.8 L V10, nine-thousand scream | Lexus LFA | 1100 / 9000 | 1350 to 6800 rpm, one pull |
| 4.5 L V8, flat-plane | Ferrari 458 Italia | 930 / 9000 | 830 to 8450 rpm in one rev to the limiter |

All three have a real idle loop and come from Creative Commons YouTube clips
of the cars revving while stationary (the LFA's pull is the car moving off).

**The electric motor** is the odd one out: no engine, so no tach, and in place of an
engine note the rising motor whine of a Model S Plaid, keyed to road speed and
silent at rest. Picking it swaps the dials for the electric face, a large
digital speed inside an arc
that fills with speed, with two figures beneath: top speed this drive, and a
standing-start sprint timer (0 to 100 km/h, or 0 to 60 mph in mph) whose best
time is remembered. The compass stays. Start skips the crank and does a
power-on sweep of the arc instead.

Above the top of its recorded sweep an engine is pitch-shifted, up to double
speed, so the two dyno pulls sound most natural across the whole dial. Each
engine brings its own idle, redline, dial range and gearing; the list lives in
`src/engine/options.ts`, one entry per pack folder. Switching mid-drive is
fine: the new engine takes over the speakers at once. The synthesiser in
`src/engine/sound.ts` is only a fallback for a recording that fails to load;
nothing in the picker uses it.

## Deploy

The site is hosted on Cloudflare as a static-assets Worker, configured in
`wrangler.jsonc`, and served at <https://redline.horizoncode.io>. One-time
setup on a new machine:

```bash
npx wrangler login
```

Then, whenever you want to ship the current source:

```bash
npm run deploy
```

That runs the build and uploads `dist/`. The first deploy also creates the
`redline` DNS record on the `horizoncode.io` zone; later deploys only
upload files that changed.

Visits are counted by Cloudflare Web Analytics through a beacon script that
`main.ts` adds in production builds only: page views, visitors by country,
devices and load times, with
no cookies and no per-visitor data kept. The GPS position the page uses is
never sent anywhere.

## In the car

- Open the site in the car's browser and tap **Start**. The tap is what lets
  the page play sound, ask for your location, and go full screen on a touch
  screen if the browser allows it.
- The browser must allow location access. Tesla's browser has exposed the
  Geolocation API for years, but owners report the fix can go stale while
  navigation is running. If the fix is lost or refused, the status line at
  the bottom left says so; tap it to ask again.
- The **Vol** slider sets the engine's own level, so it can sit under the
  car's music without touching the car's volume. At zero the engine is silent
  and the Rev button hides with it. Chips and the Rev button are sized for a
  finger at arm's length.
- **Start** waits for the engine recording to load (at most four seconds),
  then the engine fires: needle and note rise together into a short flare
  above idle and settle. The needle never moves without the sound.
- The **compass** tape above the dials slides to the direction of travel,
  from the receiver's heading or the bearing between fixes. GPS has no
  heading at a standstill, so the tape holds the last one and is dim until
  it has had one.
- At redline the gear readout **flashes** as a shift light.
- Each engine **dresses the dials** its own way: white numerals with orange
  needles for the V12, the LFA's white ring and red needle for the V10,
  the 458's yellow rev counter with black numerals for the V8, and cool white
  and cyan for the electric motor. The themes are
  CSS variables in `style.css`, keyed by each engine's `theme` in
  `src/engine/options.ts`.
- Whether the browser stays usable while the car is in Drive depends on your
  region and software version. Check that before planning a road trip around
  this.

## Sounds

The engine note comes from an engine pack in `public/sounds/<name>/`: a
recording of an engine revving up, plus a `pack.json` that says which rpm the
engine was at as the recording plays (a handful of time/rpm keyframes), where
a steady idle loop is, and the idle and redline the tach should show. At run
time the page plays short overlapping grains from the moment in the recording
where the engine was really at the wanted rpm, correcting the small remaining
difference with the playback rate, so the timbre at 2000 rpm is the real
engine at 2000 rpm. A sweep is always on-throttle, so coasting is mimicked by
closing a low-pass filter and dropping the level. Freesound previews carry
little below 100 Hz, so the player adds bass: a shelf under 200 Hz, a bump at
70 Hz, and two sine layers at crank speed and twice crank speed that swell
with the throttle. `bass` in `pack.json` scales all of that (1 by default,
0 for none).

Four packs ship, cut from Freesound and YouTube recordings; each folder's
`CREDITS.md` has the attribution and the terms:

| Pack | Recording | Licence |
| --- | --- | --- |
| `lamborghini-murcielago-sv-v12` | "Lamborghini Murcielago SV / Pure Sound / Loudest Sound" by Best Supercars Sound (YouTube) | CC BY |
| `lexus-lfa-v10` | "BLUE Lexus LFA Start Up, Loud Revs, Acceleration" by Best Sport CARS Video (YouTube) | CC BY |
| `ferrari-458-v8` | "Ferrari 458 Italia exhaust sound by Akrapovic" by Motor1 (YouTube) | CC BY |
| `tesla-model-s-plaid` | "Acceleration of an electric car" by justVova | CC0 1.0 |

Every pack's keyframes were placed by tracking the firing-frequency harmonics
through the recording, not read from a tachometer. The Tesla pack is the
exception: its keyframes are km/h times 50, placed by tracking the motor
whine, so the player follows road speed instead of rpm. To try another recording,
add a folder with its own `pack.json` and open the site with `?pack=<name>`;
it appears in the engine picker alongside the built-in ones. If a pack fails
to load, the page falls back to the synthesised engine of the same layout.

## How it works

| Piece | File | What it does |
| --- | --- | --- |
| Dial | `src/gauges/dial.ts` | SVG gauge with a spring-driven needle, a readout in the face and a shift light |
| Compass | `src/gauges/compass.ts` | Sliding heading tape fed by the GPS heading or the bearing between fixes |
| Electric face | `src/gauges/ev.ts` | Digital speed in a filling arc with top speed and the sprint time, for the Tesla |
| Trip | `src/trip.ts` | Distance, moving time, average and top speed, and the sprint timer |
| Engine art | `src/gauges/engines.ts` | Wireframe engines, seen from above, for the picker, drawn in SVG |
| GPS source | `src/speed/gps.ts` | `watchPosition`, using reported speed or distance over time |
| Demo source | `src/speed/demo.ts` | A small car model driven from the keyboard, for desk testing via `?demo` |
| Estimator | `src/speed/estimator.ts` | Smooths 1 Hz fixes into continuous speed and acceleration |
| Gearbox | `src/engine/gearbox.ts` | Speed → gear → rpm, with throttle-dependent shift points: near a third of redline at a steady speed, redline when a Tesla is floored (about 4.5 m/s²). Each engine's gear speeds come from the car's published gearing (`gearScale` can shorten them, but ships at 1) |
| Engine options | `src/engine/options.ts` | The pickable engines: rpm range, gearing, recording or synth recipe |
| Sampled engine | `src/engine/sampled.ts` | Grains from a real rev recording, indexed by rpm |
| Synth engine | `src/engine/sound.ts` | Procedural engine from oscillators, noise, a clipper and a filter |

Tuning lives in `ENGINE_OPTIONS` (per-engine rpm range, gearing and synth
recipe), `DEFAULT_GEARBOX` (shift points), each pack's `pack.json` (idle,
redline, keyframes, level trims) and `SampledEngine.set` (how throttle shapes
the level and the filter).
