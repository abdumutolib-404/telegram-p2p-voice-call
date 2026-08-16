import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReceipt, MAX_RECEIPT_BYTES } from '../bot/receiptValidator';
import { sendAdminPaymentNotification, downloadTelegramReceiptFile } from '../bot/paymentsBot';
import { env } from '../config/env';

describe('P0-A & P0-B: Receipt File Validation & Cross-Bot Delivery Test Suite', () => {
  describe('1. P0-A: Strict Server-Side Receipt File Type Validation', () => {
    it('1.1 Accepts legitimate Telegram photo messages', () => {
      const res = validateReceipt({
        isPhoto: true,
        fileSize: 1024 * 500, // 500KB
        orderNumber: 'A21',
      });
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.category).toBe('PHOTO');
        expect(res.mimeType).toBe('image/jpeg');
        expect(res.fileName).toBe('receipt_A21.jpg');
        expect(res.fileSize).toBe(1024 * 500);
      }
    });

    it('1.2 Accepts valid PDF documents (application/pdf with .pdf extension)', () => {
      const res = validateReceipt({
        isPhoto: false,
        mimeType: 'application/pdf',
        fileName: 'ReqGrid.pdf',
        fileSize: 1024 * 1024 * 2, // 2MB
        orderNumber: 'A22',
      });
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.category).toBe('PDF');
        expect(res.mimeType).toBe('application/pdf');
        expect(res.fileName).toBe('ReqGrid.pdf');
      }
    });

    it('1.3 Accepts valid uppercase .PDF documents', () => {
      const res = validateReceipt({
        isPhoto: false,
        mimeType: 'application/pdf',
        fileName: 'BANK_RECEIPT.PDF',
        fileSize: 1024 * 800,
      });
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.category).toBe('PDF');
      }
    });

    it('1.4 Accepts uncompressed image documents (PNG, JPEG, WEBP)', () => {
      const pngRes = validateReceipt({
        isPhoto: false,
        mimeType: 'image/png',
        fileName: 'screenshot.png',
        fileSize: 1024 * 750,
      });
      expect(pngRes.valid).toBe(true);
      if (pngRes.valid) expect(pngRes.category).toBe('IMAGE_DOC');

      const jpegRes = validateReceipt({
        isPhoto: false,
        mimeType: 'image/jpeg',
        fileName: 'payme_receipt.jpg',
        fileSize: 1024 * 400,
      });
      expect(jpegRes.valid).toBe(true);
      if (jpegRes.valid) expect(jpegRes.category).toBe('IMAGE_DOC');

      const webpRes = validateReceipt({
        isPhoto: false,
        mimeType: 'image/webp',
        fileName: 'click_receipt.webp',
        fileSize: 1024 * 300,
      });
      expect(webpRes.valid).toBe(true);
      if (webpRes.valid) expect(webpRes.category).toBe('IMAGE_DOC');
    });

    it('1.5 Strictly rejects Markdown files (.md / text/x-web-markdown)', () => {
      const res = validateReceipt({
        isPhoto: false,
        mimeType: 'text/x-web-markdown',
        fileName: 'Pasted markdown.md',
        fileSize: 1024,
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.category).toBe('INVALID');
        expect(res.userMessage).toContain('Please send a PDF or image receipt only.');
      }
    });

    it('1.6 Strictly rejects Source Code files (TypeScript, JavaScript, Python, etc.)', () => {
      const tsRes = validateReceipt({
        isPhoto: false,
        mimeType: 'text/plain',
        fileName: 'bot.ts',
        fileSize: 2048,
      });
      expect(tsRes.valid).toBe(false);

      const jsRes = validateReceipt({
        isPhoto: false,
        mimeType: 'application/javascript',
        fileName: 'index.js',
        fileSize: 2048,
      });
      expect(jsRes.valid).toBe(false);
    });

    it('1.7 Strictly rejects Dockerfile and plain text configuration files', () => {
      const dockerRes = validateReceipt({
        isPhoto: false,
        mimeType: 'text/plain',
        fileName: 'Dockerfile',
        fileSize: 512,
      });
      expect(dockerRes.valid).toBe(false);
      if (!dockerRes.valid) {
        expect(dockerRes.category).toBe('INVALID');
      }

      const envRes = validateReceipt({
        isPhoto: false,
        mimeType: 'text/plain',
        fileName: '.env',
        fileSize: 256,
      });
      expect(envRes.valid).toBe(false);
    });

    it('1.8 Strictly rejects JSON, Archives (ZIP, RAR), Shell scripts, and Binaries', () => {
      const jsonRes = validateReceipt({
        isPhoto: false,
        mimeType: 'application/json',
        fileName: 'data.json',
        fileSize: 1024,
      });
      expect(jsonRes.valid).toBe(false);

      const zipRes = validateReceipt({
        isPhoto: false,
        mimeType: 'application/zip',
        fileName: 'receipts.zip',
        fileSize: 1024 * 500,
      });
      expect(zipRes.valid).toBe(false);
    });

    it('1.9 Strictly rejects oversized files (> 20MB)', () => {
      const oversizedRes = validateReceipt({
        isPhoto: false,
        mimeType: 'application/pdf',
        fileName: 'heavy_receipt.pdf',
        fileSize: MAX_RECEIPT_BYTES + 1024, // 20MB + 1KB
      });
      expect(oversizedRes.valid).toBe(false);
      if (!oversizedRes.valid) {
        expect(oversizedRes.category).toBe('OVERSIZED');
        expect(oversizedRes.userMessage).toContain('Receipt is too large');
      }
    });

    it('1.10 Strictly rejects MIME vs Extension contradictions', () => {
      // PDF MIME but .md extension
      const fakePdf = validateReceipt({
        isPhoto: false,
        mimeType: 'application/pdf',
        fileName: 'notes.md',
        fileSize: 1024,
      });
      expect(fakePdf.valid).toBe(false);

      // PNG MIME but .pdf extension
      const fakePng = validateReceipt({
        isPhoto: false,
        mimeType: 'image/png',
        fileName: 'document.pdf',
        fileSize: 1024,
      });
      expect(fakePng.valid).toBe(false);
    });

    it('1.11 Strictly rejects zero-byte or negative-size files', () => {
      const zeroRes = validateReceipt({
        isPhoto: false,
        mimeType: 'application/pdf',
        fileName: 'empty.pdf',
        fileSize: 0,
      });
      expect(zeroRes.valid).toBe(false);
    });
  });

  describe('2. P0-B: Main Bot to Payments Bot Cross-Bot File Delivery', () => {
    it('2.1 Successfully downloads receipt bytes using Main Bot credentials', async () => {
      const mockApi = {
        getFile: vi.fn().mockResolvedValue({
          file_id: 'bot_a_file_id_123',
          file_path: 'documents/file_0.pdf',
        }),
      };

      // Mock global fetch
      const fakeBuffer = Buffer.from('Mock PDF Content');
      const fakeArrayBuffer = fakeBuffer.buffer.slice(fakeBuffer.byteOffset, fakeBuffer.byteOffset + fakeBuffer.byteLength);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeArrayBuffer,
      } as any);

      const result = await downloadTelegramReceiptFile(mockApi, 'bot_a_file_id_123', 'fake_bot_token');
      expect(result).not.toBeNull();
      expect(result?.filePath).toBe('documents/file_0.pdf');
      expect(result?.buffer.toString()).toBe('Mock PDF Content');

      fetchSpy.mockRestore();
    });

    it('2.2 Dispatches PDF document with InputFile bytes to admin via Bot B', async () => {
      const sendDocumentMock = vi.fn().mockResolvedValue({ message_id: 101 });
      const mockBotB: any = {
        api: {
          sendDocument: sendDocumentMock,
          sendPhoto: vi.fn(),
          sendMessage: vi.fn(),
        },
      };

      const pdfBuffer = Buffer.from('%PDF-1.4 Mock Receipt');
      await sendAdminPaymentNotification(mockBotB, {
        orderNumber: 'A99',
        userAlias: 'StudentAlice',
        telegramId: 123456789n,
        plan: 'PRO',
        uzsAmount: 55000,
        paymentMethod: 'MANUAL_UZS',
        receiptBuffer: pdfBuffer,
        receiptFileName: 'receipt_A99.pdf',
        receiptMimeType: 'application/pdf',
        createdAt: new Date(),
        status: 'PENDING',
      });

      expect(sendDocumentMock).toHaveBeenCalledTimes(env.ADMIN_TELEGRAM_IDS.length);
      const firstCall = sendDocumentMock.mock.calls[0];
      expect(firstCall[0]).toBe(env.ADMIN_TELEGRAM_IDS[0]);
      expect(firstCall[1]).toBeDefined(); // InputFile instance
      expect(firstCall[2].caption).toContain('A99');
      expect(firstCall[2].caption).toContain('55,000 UZS');
    });

    it('2.3 Dispatches Photo with InputFile bytes to admin via Bot B', async () => {
      const sendPhotoMock = vi.fn().mockResolvedValue({ message_id: 102 });
      const mockBotB: any = {
        api: {
          sendDocument: vi.fn(),
          sendPhoto: sendPhotoMock,
          sendMessage: vi.fn(),
        },
      };

      const photoBuffer = Buffer.from('Mock JPEG Data');
      await sendAdminPaymentNotification(mockBotB, {
        orderNumber: 'A100',
        userAlias: 'StudentBob',
        telegramId: 987654321n,
        plan: 'BOSS',
        uzsAmount: 149000,
        paymentMethod: 'MANUAL_UZS',
        receiptBuffer: photoBuffer,
        receiptFileName: 'receipt_A100.jpg',
        receiptMimeType: 'image/jpeg',
        createdAt: new Date(),
        status: 'PENDING',
      });

      expect(sendPhotoMock).toHaveBeenCalledTimes(env.ADMIN_TELEGRAM_IDS.length);
      const firstCall = sendPhotoMock.mock.calls[0];
      expect(firstCall[0]).toBe(env.ADMIN_TELEGRAM_IDS[0]);
      expect(firstCall[1]).toBeDefined(); // InputFile instance
      expect(firstCall[2].caption).toContain('A100');
      expect(firstCall[2].caption).toContain('149,000 UZS');
    });

    it('2.4 Throws and propagates sanitized error when admin delivery fails', async () => {
      const sendDocumentMock = vi.fn().mockRejectedValue(new Error('400: Bad Request: chat not found'));
      const mockBotB: any = {
        api: {
          sendDocument: sendDocumentMock,
          sendPhoto: vi.fn(),
          sendMessage: vi.fn(),
        },
      };

      const pdfBuffer = Buffer.from('PDF');
      await expect(
        sendAdminPaymentNotification(mockBotB, {
          orderNumber: 'A101',
          userAlias: 'StudentCharlie',
          telegramId: 555666777n,
          plan: 'PLUS',
          uzsAmount: 15000,
          paymentMethod: 'MANUAL_UZS',
          receiptBuffer: pdfBuffer,
          receiptFileName: 'receipt_A101.pdf',
          receiptMimeType: 'application/pdf',
          createdAt: new Date(),
          status: 'PENDING',
        })
      ).rejects.toThrow('Failed to deliver admin notification');
    });
  });
});
