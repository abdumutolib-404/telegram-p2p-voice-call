-- Public channel packs replace new personal offers. Preserve submitted and
-- authorized purchases so receipts/payments already in flight can still settle.
UPDATE "DiscountOffer" SET status='EXPIRED',"noticeQueuedAt"=COALESCE("noticeQueuedAt",CURRENT_TIMESTAMP)
 WHERE status IN ('AVAILABLE','CHECKOUT');
UPDATE "NotificationJob" SET status='EXPIRED',failure='Personal offer promotions retired; offers are public channel posts.'
 WHERE status='QUEUED' AND "dedupeKey" LIKE 'discount-offer:%';
