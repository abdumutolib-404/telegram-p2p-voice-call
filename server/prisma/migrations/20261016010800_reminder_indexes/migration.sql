CREATE INDEX "NotificationJob_category_createdAt_idx" ON "NotificationJob"(category,"createdAt");
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");
CREATE INDEX "User_notifyInactivity_nextReminderAt_id_idx" ON "User"("notifyInactivity","nextReminderAt",id);
CREATE INDEX "User_notifyCheckout_nextReminderAt_idx" ON "User"("notifyCheckout","nextReminderAt");
CREATE INDEX "User_notifyPeak_nextReminderAt_id_idx" ON "User"("notifyPeak","nextReminderAt",id);
CREATE INDEX "User_notifyChannel_nextReminderAt_id_idx" ON "User"("notifyChannel","nextReminderAt",id);
