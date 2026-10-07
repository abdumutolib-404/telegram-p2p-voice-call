const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../assets');
const target = path.resolve(__dirname, '../dist/assets');
fs.mkdirSync(target, { recursive: true });
for (const filename of ['pairtalk-terms-of-use.pdf', 'terms-manifest.json', 'plans_pricing.jpg']) {
  fs.copyFileSync(path.join(source, filename), path.join(target, filename));
}
