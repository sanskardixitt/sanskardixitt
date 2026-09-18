/**
 * Builds the animated "tech stack solar system" hero SVG for the GitHub profile README.
 *
 * WHY A GENERATOR INSTEAD OF HAND-WRITTEN SVG
 *   25 planets x 4 nested transform groups is ~600 lines of markup nobody can edit
 *   safely. Skills change; editing orbit.config.json and re-running is a 5s change.
 *   Star positions come from a SEEDED PRNG, so rebuilds are byte-identical and git
 *   diffs only show what actually changed.
 *
 * WHY SMIL (<animateTransform>) INSTEAD OF CSS ANIMATIONS
 *   GitHub renders README SVGs through an <img> tag: scripts never run, and CSS
 *   transform-origin / transform-box resolution inside an <img>-embedded SVG is
 *   inconsistent across engines. SMIL rotate() is defined about the element's own
 *   local origin with no origin plumbing at all -- it is exact in every browser here.
 *   Reduced motion is handled at the README level via <picture media="...">.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'orbit.config.json'), 'utf8'));

const { w: W, h: H, cx: CX, cy: CY } = cfg.canvas;
const { tiltDeg: TILT, squash: S, basePeriod: T0 } = cfg.system;
const P = cfg.palette;
const COLOR = Object.fromEntries(cfg.domains.map((d) => [d.key, d.color]));

const AY = CY - 68;   // avatar centre, lifted so the nameplate sits under it
const AR = 46;        // avatar radius

const n = (v) => Number(v.toFixed(3));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Deterministic PRNG (mulberry32) -- stable starfield across rebuilds. */
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------------
 * The transform trick that makes this work.
 *
 * Each ring lives inside:   translate(CX,CY) rotate(TILT) scale(1, S)
 * so a plain circular orbit renders as a TILTED ELLIPSE -- real perspective,
 * while the motion itself stays a pure rotation (the one thing SMIL nails).
 *
 * But that squash+tilt would also squash and tilt every planet and label. So
 * inside each planet we apply the exact inverse of the accumulated linear map:
 *
 *   A     = Rot(TILT) . Scale(1,S) . Rot(theta + a)
 *   A^-1  = Rot(-theta) . Rot(-a) . Scale(1, 1/S) . Rot(-TILT)
 *
 * Rot(-theta) is a counter-spin animation: same duration, opposite direction.
 * SMIL keeps the two exactly in phase because they share one timeline and both
 * begin at 0 -- no negative delays, nothing to drift. The rest is static.
 *
 * Net linear transform on the label = IDENTITY. Labels stay perfectly upright
 * and perfectly circular while travelling a tilted ellipse.
 * ------------------------------------------------------------------------- */
function planet(label, domainKey, angleDeg, r, period, animate) {
  const color = COLOR[domainKey] ?? P.text;
  const counter = animate
    ? `<animateTransform attributeName="transform" attributeType="XML" type="rotate"` +
      ` from="0" to="-360" dur="${period}s" repeatCount="indefinite"/>`
    : '';
  const fix = `rotate(${n(-angleDeg)}) scale(1 ${n(1 / S)}) rotate(${n(-TILT)})`;

  return (
    `<g transform="rotate(${n(angleDeg)})"><g transform="translate(${n(r)} 0)"><g>${counter}` +
    `<g transform="${fix}">` +
    `<circle r="11" fill="${color}" opacity=".13"/>` +
    `<circle r="6.2" fill="${color}"/>` +
    `<circle r="6.2" fill="none" stroke="${P.bgBottom}" stroke-opacity=".5" stroke-width="1.2"/>` +
    `<circle cx="-2" cy="-2.2" r="1.9" fill="#ffffff" opacity=".5"/>` +
    `<text y="19" text-anchor="middle" class="lbl" paint-order="stroke"` +
    ` stroke="${P.bgBottom}" stroke-width="3.2" stroke-linejoin="round">${esc(label)}</text>` +
    `</g></g></g></g>`
  );
}

function ring(def, animate) {
  const { r, phase, items } = def;
  /* Kepler's third law: T proportional to r^1.5. Inner rings genuinely move
     faster. That alone separates the rings visually -- no need for contra-
     rotation (which reads as chaotic) or four different ring colours. */
  const period = n(T0 * Math.pow(r / cfg.rings[0].r, 1.5));
  const spin = animate
    ? `<animateTransform attributeName="transform" attributeType="XML" type="rotate"` +
      ` from="0" to="360" dur="${period}s" repeatCount="indefinite"/>`
    : '';

  const planets = items
    .map(([label, dom], i) =>
      planet(label, dom, phase + (i * 360) / items.length, r, period, animate)
    )
    .join('');

  return (
    `<g transform="translate(${CX} ${CY}) rotate(${TILT}) scale(1 ${S})">` +
    `<circle r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    `<g>${spin}${planets}</g>` +
    `</g>`
  );
}

function starfield(animate) {
  const rand = rng(20240918);
  let out = '';
  for (let i = 0; i < 110; i++) {
    const x = n(rand() * W);
    const y = n(rand() * H);
    /* No exclusion zone around the centre: an empty patch of sky reads as a
       dark smudge, which is worse than the problem it solves. The corona mask
       erases whatever lands in the middle, and the type carries its own dark
       paint-order halo. */
    const rr = n(0.5 + rand() * 1.15);
    const base = n(0.1 + rand() * 0.34);
    const wantTwinkle = rand() < 0.35;
    const twinkle =
      animate && wantTwinkle
        ? `<animate attributeName="opacity" values="${base};${n(base + 0.45)};${base}"` +
          ` dur="${n(2.6 + rand() * 4.5)}s" repeatCount="indefinite"/>`
        : '';
    out += `<circle cx="${x}" cy="${y}" r="${rr}" fill="#FFF6E9" opacity="${base}">${twinkle}</circle>`;
  }
  return out;
}

function avatar() {
  const file = ['avatar.jpg', 'avatar.png']
    .map((f) => path.join(ROOT, 'assets', f))
    .find(fs.existsSync);

  // Graceful fallback: a monogram. A missing file must never break the build.
  if (!file) {
    const initials = cfg.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `<text x="${CX}" y="${AY + 16}" text-anchor="middle" class="ui" font-size="44" font-weight="800" fill="${P.text}">${esc(initials)}</text>`;
  }

  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const uri = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

  /* Focal-point crop. A plain centred square crop puts the circle over whatever
     happens to be at the image's centre -- for a portrait that is usually the
     torso, not the face. Instead: draw the image at D = diameter * scale, then
     translate it so the configured focal point lands on the circle's centre
     (nudged slightly up, where a face sits naturally in a portrait).
     The clip-path does the rest. */
  const f = cfg.avatar ?? { focusX: 0.5, focusY: 0.5, scale: 1, nudgeY: 0 };
  const D = AR * 2 * (f.scale ?? 1);
  const x0 = CX - (f.focusX ?? 0.5) * D;
  const y0 = AY + (f.nudgeY ?? 0) - (f.focusY ?? 0.5) * D;

  /* Guard: the scaled image must still cover the whole circle, or we would clip
     to transparency and punch a hole in the avatar. */
  if (x0 > CX - AR || y0 > AY - AR || x0 + D < CX + AR || y0 + D < AY + AR) {
    console.warn(`WARNING: avatar scale ${f.scale} too small for focus ` +
      `(${f.focusX}, ${f.focusY}) -- the circle is not fully covered. Raise "scale".`);
  }

  /* href only, no xlink:href duplicate -- the fallback would double the file
     size (base64 twice) to support browsers older than Chrome 49 / Safari 12. */
  return (
    `<image x="${n(x0)}" y="${n(y0)}" width="${n(D)}" height="${n(D)}"` +
    ` clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"` +
    ` href="${uri}"/>`
  );
}

function legend() {
  const y = H - 30;
  let x = 40;
  let out = '';
  for (const d of cfg.domains) {
    out +=
      `<circle cx="${x}" cy="${y - 4}" r="4.6" fill="${d.color}"/>` +
      `<text x="${n(x + 11)}" y="${y}" class="lg">${esc(d.label)}</text>`;
    x += 26 + d.label.length * 6.4;
  }
  return out;
}

function comet(animate) {
  if (!animate) return '';
  /* keyPoints/keyTimes: travel the whole path in the first 11% of the cycle,
     then park offscreen. Gives a rare streak instead of a metronome. */
  return (
    `<g opacity="0">` +
    `<path d="M0 0 L -46 -15" stroke="url(#cometGrad)" stroke-width="2.1" stroke-linecap="round"/>` +
    `<circle r="2.1" fill="#FFF6E9"/>` +
    `<animateMotion dur="19s" repeatCount="indefinite" calcMode="linear"` +
    ` keyPoints="0;1;1" keyTimes="0;0.11;1"` +
    ` path="M -140 -40 C 220 90, 520 150, 1060 300"/>` +
    `<animate attributeName="opacity" values="0;0;.85;.85;0;0"` +
    ` keyTimes="0;0.012;0.03;0.085;0.11;1" dur="19s" repeatCount="indefinite"/>` +
    `</g>`
  );
}

function build(animate) {
  const FONTS = `ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.name)} - tech stack orbiting as a solar system">
<title>${esc(cfg.name)} - tech stack orbiting as a solar system</title>
<defs>
  <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(W * 0.35)}" y2="${H}">
    <stop offset="0" stop-color="${P.bgTop}"/><stop offset="1" stop-color="${P.bgBottom}"/>
  </linearGradient>
  <!-- The backdrop is defined once and painted TWICE: normally at the bottom of
       the stack, then again over the centre through a soft radial mask. The second
       pass restores the exact pixels that were already there, so planets crossing
       the middle dissolve into the background with no seam and no dark smudge.
       A flat dark overlay cannot do this: the background is a gradient, so any
       single fill colour shows up as a visible patch. -->
  <g id="backdrop">
    <rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>
    <!-- Central lift. The two corner nebulae leave an unlit hole dead centre,
         which the eye reads as a dark smudge behind the avatar. This fills it. -->
    <ellipse cx="${CX}" cy="${CY - 20}" rx="430" ry="300" fill="url(#nebulaC)"/>
    <ellipse cx="140" cy="90"  rx="300" ry="200" fill="url(#nebulaA)"/>
    <ellipse cx="790" cy="430" rx="320" ry="210" fill="url(#nebulaB)"/>
  </g>
  <radialGradient id="coronaFall">
    <stop offset="0"   stop-color="#fff" stop-opacity="1"/>
    <stop offset=".42" stop-color="#fff" stop-opacity="1"/>
    <stop offset="1"   stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <mask id="coronaMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
    <ellipse cx="${CX}" cy="${CY - 40}" rx="176" ry="140" fill="url(#coronaFall)"/>
  </mask>
  <radialGradient id="nebulaA">
    <stop offset="0" stop-color="#8E7BE8" stop-opacity=".30"/><stop offset="1" stop-color="#8E7BE8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="nebulaB">
    <stop offset="0" stop-color="#F2A7C3" stop-opacity=".22"/><stop offset="1" stop-color="#F2A7C3" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="nebulaC">
    <stop offset="0" stop-color="#6E5FB6" stop-opacity=".26"/><stop offset="1" stop-color="#6E5FB6" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ringGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"  stop-color="${P.ring}" stop-opacity=".07"/>
    <stop offset=".5" stop-color="${P.ring}" stop-opacity=".20"/>
    <stop offset="1"  stop-color="${P.ring}" stop-opacity=".34"/>
  </linearGradient>
  <linearGradient id="cometGrad" x1="1" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#FFF6E9" stop-opacity=".9"/><stop offset="1" stop-color="#FFF6E9" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="sunGlow">
    <stop offset="0"  stop-color="#FFE3B8" stop-opacity=".50"/>
    <stop offset=".6" stop-color="#F7B2D9" stop-opacity=".16"/>
    <stop offset="1"  stop-color="#F7B2D9" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="nameGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFD9A0"/><stop offset=".5" stop-color="#F7B2D9"/><stop offset="1" stop-color="#A8D8FF"/>
  </linearGradient>
  <clipPath id="avatarClip"><circle cx="${CX}" cy="${AY}" r="${AR}"/></clipPath>
  <style>
    .ui  { font-family: ${FONTS}; }
    .lbl { font-family: ${FONTS}; font-size: 11.5px; font-weight: 600; fill: ${P.text}; letter-spacing: .2px; }
    .lg  { font-family: ${FONTS}; font-size: 10.5px; font-weight: 500; fill: ${P.textDim}; }
  </style>
</defs>

<use href="#backdrop"/>
${starfield(animate)}
${comet(animate)}

<!-- Orbits: outermost first, so inner (faster, more important) rings paint on top. -->
${cfg.rings.slice().reverse().map((r) => ring(r, animate)).join('\n')}

<!-- Corona: second pass of the backdrop through the radial mask. Planets crossing
     the centre dissolve, which reads as passing behind the star. A depth cue with
     zero animation-sync cost. Sized to the nameplate so it never dims the inner
     ring at its widest points. -->
<use href="#backdrop" mask="url(#coronaMask)"/>
<circle cx="${CX}" cy="${AY}" r="126" fill="url(#sunGlow)"/>

<circle cx="${CX}" cy="${AY}" r="52"   fill="none" stroke="${P.ring}" stroke-opacity=".18" stroke-width="1"/>
<circle cx="${CX}" cy="${AY}" r="47.5" fill="${P.bgBottom}"/>
${avatar()}
<circle cx="${CX}" cy="${AY}" r="${AR}" fill="none" stroke="url(#nameGrad)" stroke-width="2.2" stroke-opacity=".9"/>
<g transform="translate(${CX} ${AY})">${
    animate
      ? `<animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0" to="360" dur="24s" repeatCount="indefinite" additive="sum"/>`
      : ''
  }<circle r="57" fill="none" stroke="${P.ring}" stroke-opacity=".30" stroke-width="1.1" stroke-dasharray="2 9" stroke-linecap="round"/></g>

<text x="${CX}" y="${CY + 26}" text-anchor="middle" class="ui" font-size="29" font-weight="800"
      fill="url(#nameGrad)" paint-order="stroke" stroke="${P.bgBottom}" stroke-width="5" stroke-linejoin="round">${esc(cfg.name)}</text>
<text x="${CX}" y="${CY + 46}" text-anchor="middle" class="ui" font-size="11" font-weight="600" letter-spacing="1.6"
      fill="${P.textDim}" paint-order="stroke" stroke="${P.bgBottom}" stroke-width="4" stroke-linejoin="round">${esc(cfg.role.toUpperCase())}</text>

${legend()}
<text x="${W - 40}" y="${H - 34}" text-anchor="end" class="lg">${esc(cfg.handle)}</text>
<text x="${W - 40}" y="${H - 20}" text-anchor="end" class="lg" opacity=".72">orbit radius = how close it sits to my daily work</text>
</svg>
`;
}

for (const [file, animate] of [['assets/orbit.svg', true], ['assets/orbit-static.svg', false]]) {
  const out = build(animate);
  fs.writeFileSync(path.join(ROOT, file), out);
  console.log(`${file.padEnd(26)} ${(out.length / 1024).toFixed(1)} KB`);
}
