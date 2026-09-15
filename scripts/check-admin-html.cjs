#!/usr/bin/env node
/* ============================================================
 * Syntax-check the inline JavaScript in a static HTML page.
 *
 *   node scripts/check-admin-html.cjs [path/to/page.html]
 *
 * Why this exists: public/admin.html is a single static page whose
 * whole dashboard lives in ONE inline <script>. A single broken
 * string literal makes the entire admin panel silently stop working
 * (no tickets load, no replies send), and nothing in `npm run build`
 * covers that file. Run this after editing admin.html.
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'public', 'admin.html');
const html = fs.readFileSync(file, 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

let m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  n++;
  const code = m[1];
  const firstLine = html.slice(0, m.index).split('\n').length;
  try {
    // Wrapped like a module so any top-level await still parses.
    new vm.Script('(async () => {\n' + code + '\n})', { filename: file });
    console.log('  OK      inline script #' + n + ' (starts line ' + firstLine + ')');
  } catch (e) {
    bad++;
    console.log('  FAILED  inline script #' + n + ' (starts line ' + firstLine + ')');
    console.log('          ' + String(e.message));
    // vm reports positions relative to the extracted block; map back to the page.
    const at = /:(\d+)\s*$/m.exec(e.stack || '');
    if (at) {
      const pageLine = firstLine + Number(at[1]) - 1;
      const text = html.split('\n')[pageLine - 1] || '';
      console.log('          ' + file + ':' + pageLine + ' -> ' + text.trim().slice(0, 160));
    }
  }
}

if (!n) {
  console.error('No inline <script> blocks found in ' + file);
  process.exit(1);
}
console.log(bad === 0
  ? '\nPASS: all ' + n + ' inline script block(s) parse cleanly.'
  : '\nFAIL: ' + bad + ' of ' + n + ' block(s) have syntax errors.');
process.exit(bad === 0 ? 0 : 1);
