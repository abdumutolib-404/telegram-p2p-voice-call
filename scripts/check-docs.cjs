// Check repository Markdown links without external requests or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter(file => file.endsWith('.md') && fs.existsSync(path.join(root, file)));
const errors = [];
let checked = 0;
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^file:/i.test(target) || /^[a-z]:[\\/]/i.test(target)) {
      errors.push(file + ': workstation-specific link ' + target);
      continue;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#')) continue;
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!local) continue;
    checked++;
    if (!fs.existsSync(path.resolve(root, path.dirname(file), local))) {
      errors.push(file + ': missing local target ' + target);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Documentation links passed: ' + checked + ' local links across ' + files.length + ' Markdown files.');
}
