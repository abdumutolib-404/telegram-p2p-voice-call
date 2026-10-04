/** Matches recorder markers by complete user ID; callers handle legacy null markers. */
export function isUserSessionRecorder(recordedByUserId: string | null | undefined, userId: string): boolean {
  if (!recordedByUserId || !userId) return false;
  if (recordedByUserId === 'BOTH' || recordedByUserId === 'ALL') return true;
  const ids = recordedByUserId.split(',').map((id) => id.trim()).filter(Boolean);
  return ids.includes(userId);
}
