package database

import "time"

func (u *User) Restricted(now time.Time) bool {
	return u == nil || u.IsPermanentlyBanned || (u.IsBanned && u.BannedUntil == nil) || (u.BannedUntil != nil && u.BannedUntil.After(now))
}
