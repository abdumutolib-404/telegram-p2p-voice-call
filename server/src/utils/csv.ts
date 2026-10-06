/** Encode an untrusted cell as literal spreadsheet text, then apply CSV quoting. */
export function escapeCsvField(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
