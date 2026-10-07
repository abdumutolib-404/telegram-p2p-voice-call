import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface TermsManifest { version: string; filename: string; sha256: string; termsUrl: string; privacyUrl: string }
const assetsDirectory = [path.resolve(__dirname, '../assets'), path.resolve(__dirname, '../../assets')]
  .find(directory => fs.existsSync(path.join(directory, 'terms-manifest.json')));
if (!assetsDirectory) throw new Error('Terms document is missing. Build and deploy the server assets.');
export const currentTerms: Readonly<TermsManifest> = Object.freeze(JSON.parse(fs.readFileSync(path.join(assetsDirectory, 'terms-manifest.json'), 'utf8')));
if (!/^\d{4}-\d{2}-\d{2}$/.test(currentTerms.version) || !/^[a-f0-9]{64}$/.test(currentTerms.sha256) || path.basename(currentTerms.filename) !== currentTerms.filename) throw new Error('Invalid terms manifest.');
export const termsPdfPath = path.join(assetsDirectory, currentTerms.filename);
if (crypto.createHash('sha256').update(fs.readFileSync(termsPdfPath)).digest('hex') !== currentTerms.sha256) throw new Error('Terms document and manifest do not match.');

export function hasAcceptedCurrentTerms(user: { termsAcceptedVersion?: string | null; termsAcceptedAt?: Date | null; termsDocumentSha256?: string | null } | null | undefined): boolean {
  return Boolean(user?.termsAcceptedAt && user.termsAcceptedVersion === currentTerms.version && user.termsDocumentSha256 === currentTerms.sha256);
}
