import crypto from 'node:crypto';

export function normalizeQuestionText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    // Replace smart quotes and special apostrophes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    // Remove extra punctuation
    .replace(/[.,/#!$%^&*;:{}=\-_~`()\?]/g, ' ')
    // Collapse all whitespace into single spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateQuestionFingerprint(part: string, text: string, bullets?: string | null): string {
  const normText = normalizeQuestionText(text);
  const normBullets = bullets ? normalizeQuestionText(bullets) : '';
  const payload = `${part.toUpperCase()}::${normText}::${normBullets}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}
