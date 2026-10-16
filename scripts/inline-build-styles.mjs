import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only build-generated, fingerprinted local CSS can enter an HTML style block.
export async function inlineBuildStyles(html, directory) {
  for (const match of html.matchAll(/<link\s+rel="stylesheet"\s+crossorigin\s+href="(\/assets\/[A-Za-z0-9_-]+\.css)"\s*\/?>/g)) {
    const css = await readFile(path.join(directory, match[1].slice(1)), 'utf8');
    if (/<\/style/i.test(css)) throw new Error('Unexpected closing style tag in compiled CSS');
    html = html.replace(match[0], `<style data-build-styles>${css}</style>`);
  }
  return html;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(process.argv[2] ?? 'dist/index.html');
  await writeFile(file, await inlineBuildStyles(await readFile(file, 'utf8'), path.dirname(file)));
}
