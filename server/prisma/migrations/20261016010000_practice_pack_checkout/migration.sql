-- Pack snapshots describe selected sessions; wallet quantities remain 15-minute
-- units. Existing invoices keep their original amounts and null snapshot.
ALTER TABLE "CreditOrder" ADD COLUMN "packSnapshot" TEXT,
 ADD COLUMN "checkoutCurrency" TEXT CHECK("checkoutCurrency" IN ('XTR','UZS'));
ALTER TABLE "ManualPaymentRequest" ADD COLUMN "creditOrderId" TEXT UNIQUE REFERENCES "CreditOrder"(id);
ALTER TABLE "CreditOrder" DROP CONSTRAINT "CreditOrder_calls_check",
 DROP CONSTRAINT "CreditOrder_recordings_check",
 DROP CONSTRAINT "CreditOrder_status_check";
ALTER TABLE "CreditOrder" ADD CONSTRAINT "CreditOrder_calls_check" CHECK(calls>=0),
 ADD CONSTRAINT "CreditOrder_recordings_check" CHECK(recordings>=0),
 ADD CONSTRAINT "CreditOrder_pack_counts_check" CHECK("packSnapshot" IS NULL OR (calls>0 AND recordings<=calls)),
 ADD CONSTRAINT "CreditOrder_status_check" CHECK(status IN ('PENDING','PAID','REFUND_PENDING','REFUNDED','CANCELLED','EXPIRED'));
