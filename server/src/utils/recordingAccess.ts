/** Matches recorder markers by complete user ID; callers handle legacy null markers. */
export function isUserSessionRecorder(recordedByUserId: string | null | undefined, userId: string): boolean {
  if (!recordedByUserId || !userId) return false;
  if (recordedByUserId === 'BOTH' || recordedByUserId === 'ALL') return true;
  const ids = recordedByUserId.split(',').map((id) => id.trim()).filter(Boolean);
  return ids.includes(userId);
}
export function recordingDeadline(segment:{createdAt:Date;expiresAt:Date|null;creditOwnerIds?:string[];storedOwnerIds?:string[]},userId:string): number {
  const creditDeadline=segment.creditOwnerIds?.includes(userId)?segment.createdAt.getTime()+(segment.storedOwnerIds?.includes(userId)?30:1)*86400000:Infinity;
  return Math.min(segment.expiresAt?.getTime()??Infinity,creditDeadline);
}
