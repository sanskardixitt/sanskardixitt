# Setup & design notes

## Publish it

GitHub shows a README on your profile only if it lives in a repo **named exactly like your
username**. So:

```bash
# 1. Create the repo on GitHub, public, named: sanskardixitt
#    (github.com/new — it will show a "you found a secret!" hint when the name matches)

# 2. Push this folder
cd C:/Users/sanskar/Desktop/github-profile
git init -b main
git add .
git commit -m "Animated tech-stack solar system profile"
git remote add origin https://github.com/sanskardixitt/sanskardixitt.git
git push -u origin main
```

Then open <https://github.com/sanskardixitt> — the README renders above your pinned repos.

The README deliberately has **no third-party badges or stats cards** — everything it renders is
served from this repo, so nothing breaks when an external service rate-limits or disappears.

## Editing the orbit

Everything lives in `orbit.config.json`. Add a tech, change a colour, reorder a ring, then:

```bash
node build.mjs
```

That regenerates both `assets/orbit.svg` (animated) and `assets/orbit-static.svg`.

```jsonc
{ "r": 176, "phase": 18, "items": [ ["React", "frontend"], ... ] }
//   ^ radius        ^ starting rotation, so rings don't line up
```

The second value in each pair is a domain key from `domains` — it picks the planet's colour and
shows up in the legend. Ring order matters: **ring 0 is innermost**, and everything else derives
from it (see "Kepler" below).

To swap the avatar, drop a square image at `assets/avatar.jpg` (or `.png`) and rebuild. If the file
is missing the build still succeeds — it falls back to an "SD" monogram.

---

## Why it's built this way

### Why an SVG image, not HTML/CSS/JS

GitHub sanitises README markup hard: no `<script>`, no `<style>`, no `class`, no inline CSS
animation. The **only** reliable way to get motion into a profile README is an SVG file referenced
by an `<img>`, because the SVG is a separate document that GitHub serves rather than sanitises.
That's the same mechanism the well-known "contribution snake" animation uses.

The corollary is that the SVG runs in an `<img>` sandbox: no JavaScript, and **no external
resources**. That's why the avatar is base64-embedded rather than linked — a
`<image href="https://github.com/sanskardixitt.png">` would silently render nothing.

### Why SMIL, not CSS animation

Both work inside an `<img>`. SMIL (`<animateTransform>`) won because:

- `rotate()` in SMIL is defined about the element's **own local origin**. CSS transforms need
  `transform-box` / `transform-origin` plumbing whose resolution inside an `<img>`-embedded SVG
  differs between engines — a class of bug that's invisible until someone opens it in the browser
  you didn't test.
- The orbit and its counter-rotation (below) must stay *exactly* in phase forever. Two SMIL
  animations on one timeline, both starting at 0, cannot drift. Two CSS animations with negative
  delays can.

Cost: CSS would have given `prefers-reduced-motion` for free, and CSS can't pause SMIL. So reduced
motion is handled one level up, in the README:

```html
<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="assets/orbit-static.svg">
  <img src="assets/orbit.svg" ...>
</picture>
```

`build.mjs` emits both files from one code path, so they can't drift apart.

### The transform trick (the actual hard part)

A naive "spin a circle of labels" has two giveaways: the orbits are flat circles, and the labels
turn upside-down on the way round.

Each ring sits inside `translate(CX,CY) rotate(TILT) scale(1, 0.56)`, which renders a plain circular
orbit as a **tilted ellipse** — real perspective, while the motion underneath stays a pure rotation
(the one thing SMIL does exactly).

But that squash-and-tilt would also squash and tilt every planet and label. So each planet applies
the exact inverse of the accumulated linear map:

```
A     = Rot(TILT) · Scale(1,S) · Rot(θ + a)
A⁻¹   = Rot(−θ) · Rot(−a) · Scale(1, 1/S) · Rot(−TILT)
```

`Rot(−θ)` is the counter-spin animation — same duration, opposite direction. The rest is static.
The linear parts cancel to the identity, so **labels stay perfectly upright and perfectly circular
while travelling a tilted ellipse**, and only the translation survives.

### Kepler

Ring period is `T ∝ r^1.5` — Kepler's third law, computed from ring 0. Inner rings genuinely move
faster. That difference alone separates the rings visually, so there's no need for contra-rotating
rings (which read as chaotic) or four different ring colours.

### Two encoded dimensions

This isn't just decoration — the layout carries information a flat badge wall can't:

- **Orbit radius** = how close a tool is to daily work. JavaScript/TypeScript/React/Node are the
  inner ring; Nginx and SonarQube are out at the edge.
- **Planet colour** = domain (languages / frontend / backend & data / cloud & devops / AI).

Colour is *redundant* with the always-visible text label, so colour-blind readers lose nothing —
which is also why five pastels at similar lightness are safe here.

### Palette

Pastels on a **dark** ground, not the usual pastel-on-white. Pastels are high-lightness and
low-saturation, so on white they wash out and fail contrast; on deep plum they stay unmistakably
pastel while every label clears 4.5:1. The card also paints its own opaque background, so it looks
identical in GitHub's light and dark themes with no `prefers-color-scheme` variants to maintain.

### Depth without z-sorting

Planets crossing the middle dissolve behind the "star". That's done by painting the backdrop
**twice**: once normally, then again over the centre through a soft radial mask. The second pass
restores the exact pixels already there, so there's no seam.

A flat dark overlay can't do this — the background is a gradient, so any single fill colour shows
as a visible patch. (It did, on the first attempt.) True per-planet z-ordering would need opacity
keyframes synced to each orbit; this gets ~80% of the effect for none of the sync risk.

### Performance

No SVG filters anywhere — only gradients and one mask. Filters on 25 animated elements cause real
jank on low-end machines. 25 planets × 2 rotations is trivial for the compositor.

Total payload ~73 KB, of which ~37 KB is the base64 avatar. Star positions come from a **seeded**
PRNG (mulberry32), so rebuilds are byte-identical and git diffs only show what actually changed.

---

## Optional: the contribution snake

The other animation worth having. Add `.github/workflows/snake.yml`:

```yaml
name: Generate snake
on:
  schedule: [{ cron: "0 */12 * * *" }]
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: Platane/snk@v3
        id: snake
        with:
          github_user_name: sanskardixitt
          outputs: |
            dist/snake.svg?palette=github-dark&color_snake=#F7B2D9&color_dots=#2A2647,#5B4B8A,#8E7BE8,#C3B5F5,#FFD9A0
      - uses: crazy-max/ghaction-github-pages@v4
        with: { target_branch: output, build_dir: dist }
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

Run it once from the Actions tab, **then** add the image to `README.md` — referencing it before the
first run leaves a broken image on your profile:

```markdown
![snake](https://raw.githubusercontent.com/sanskardixitt/sanskardixitt/output/snake.svg)
```
