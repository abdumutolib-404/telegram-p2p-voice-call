export function isAccountRestricted(user: { isBanned: boolean; isPermanentlyBanned: boolean; bannedUntil: Date | null }, now = new Date()): boolean {
  return user.isPermanentlyBanned || (user.isBanned && !user.bannedUntil) || Boolean(user.bannedUntil && user.bannedUntil > now);
}
