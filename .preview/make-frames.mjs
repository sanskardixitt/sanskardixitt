/* Dev-only: inline the built SVG and pin its SMIL clock to an exact time so we
   can verify orbit positions and label uprightness deterministically. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const svg = fs.readFileSync(path.join(HERE, '..', 'assets', 'orbit.svg'), 'utf8')
  .replace(/^<\?xml[^>]*\?>\s*/, '');

for (const t of process.argv.slice(2).map(Number)) {
  const html = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#0d1117;display:grid;place-items:center;height:100vh">
${svg}
<script>
  const s = document.querySelector('svg');
  s.setCurrentTime(${t});
  s.pauseAnimations();
<\/script>
</body>`;
  fs.writeFileSync(path.join(HERE, `t${t}.html`), html);
  console.log(`t${t}.html`);
}
