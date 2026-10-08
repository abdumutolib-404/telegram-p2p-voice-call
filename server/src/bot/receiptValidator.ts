import { MAX_PAYMENT_PROOF_BYTES } from "../utils/paymentProof";
export interface ReceiptValidationSuccess {
  valid: true;
  category: 'PHOTO' | 'PDF' | 'IMAGE_DOC';
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface ReceiptValidationFailure {
  valid: false;
  category: 'INVALID' | 'OVERSIZED';
  reason: string;
  userMessage: string;
}

export type ReceiptValidationResult = ReceiptValidationSuccess | ReceiptValidationFailure;

export const MAX_RECEIPT_BYTES = MAX_PAYMENT_PROOF_BYTES; // shared 5 MB limit

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Authoritative Server-Side Receipt Validator:
 * Accepts ONLY Telegram photos and PDF documents (plus common document image formats).
 * Rejects arbitrary files (.ts, .md, Dockerfile, .txt, .json, .zip, etc.) and size violations.
 */
export function validateReceipt(input: {
  isPhoto: boolean;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  orderNumber?: string;
}): ReceiptValidationResult {
  const size = input.fileSize || 0;

  if (size <= 0 || size > MAX_RECEIPT_BYTES) {
    return {
      valid: false,
      category: 'OVERSIZED',
      reason: `File size (${size} bytes) exceeds 5MB limit or is empty.`,
      userMessage: '❌ Receipt is too large.\nPlease send a PDF or image within the allowed size.',
    };
  }

  // 1. Direct Telegram Photo Update
  if (input.isPhoto) {
    return {
      valid: true,
      category: 'PHOTO',
      mimeType: 'image/jpeg',
      fileName: `receipt_${input.orderNumber || 'order'}.jpg`,
      fileSize: size,
    };
  }

  // 2. Telegram Document Update
  const rawMime = (input.mimeType || '').toLowerCase().trim();
  const rawFileName = (input.fileName || '').toLowerCase().trim();

  // Validate PDF Document
  if (rawMime === 'application/pdf') {
    if (rawFileName && !rawFileName.endsWith('.pdf')) {
      return {
        valid: false,
        category: 'INVALID',
        reason: `MIME application/pdf conflicts with non-pdf extension: ${input.fileName}`,
        userMessage: '❌ Invalid receipt.\nPlease send a PDF or image receipt only.',
      };
    }
    return {
      valid: true,
      category: 'PDF',
      mimeType: 'application/pdf',
      fileName: input.fileName || `receipt_${input.orderNumber || 'order'}.pdf`,
      fileSize: size,
    };
  }

  // Validate Image Document (e.g. uncompressed PNG/JPEG/WEBP sent as document)
  if (ALLOWED_IMAGE_MIMES.has(rawMime)) {
    if (rawFileName && !ALLOWED_IMAGE_EXTENSIONS.some((ext) => rawFileName.endsWith(ext))) {
      return {
        valid: false,
        category: 'INVALID',
        reason: `MIME ${rawMime} conflicts with non-image extension: ${input.fileName}`,
        userMessage: '❌ Invalid receipt.\nPlease send a PDF or image receipt only.',
      };
    }
    return {
      valid: true,
      category: 'IMAGE_DOC',
      mimeType: rawMime,
      fileName: input.fileName || `receipt_${input.orderNumber || 'order'}.jpg`,
      fileSize: size,
    };
  }

  // All other formats (.ts, .md, Dockerfile, .txt, .zip, etc.) are strictly rejected
  return {
    valid: false,
    category: 'INVALID',
    reason: `Unsupported document format (MIME: ${rawMime || 'missing'}, fileName: ${input.fileName || 'missing'})`,
    userMessage: '❌ Invalid receipt.\nPlease send a PDF or image receipt only.',
  };
}
