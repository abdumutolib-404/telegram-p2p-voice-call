const MAX_BYTES = 5 * 1024 * 1024;
export function decodePaymentProof(value: string): { buffer: Buffer; mime: string } {
  if (typeof value !== 'string' || value.length > MAX_BYTES * 4 / 3 + 128) throw new Error('Proof must be a PNG, JPEG, WebP or PDF under 5 MB.');
  const match = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new Error('Invalid proof encoding or file format.');
  const buffer = Buffer.from(match[2], 'base64'), mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const signature = mime === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    : mime === 'image/webp' ? buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    : buffer.subarray(0, 5).toString() === '%PDF-';
  if (!signature || buffer.length > MAX_BYTES || buffer.length === 0 || buffer.toString('base64') !== match[2]) throw new Error('Proof content does not match its declared format or size.');
  return { buffer, mime };
}
