package database

import (
	"github.com/google/uuid"
	"github.com/pairtalk/gateway/internal/auth"
	"testing"
)

func TestIntegrationTermsRequiredForAuthenticationAndAdmission(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	user, err := db.GetUserByID(ctx, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	registered, err := db.GetRegisteredUserByTelegramID(ctx, user.TelegramID, auth.TermsVersion, auth.TermsDocumentSHA256)
	if err != nil || registered == nil {
		t.Fatalf("registered participant rejected: %v", err)
	}
	for _, change := range []string{`onboarded=FALSE`, `"termsAcceptedAt"=NULL`, `"termsDocumentSha256"='wrong-document'`, `"termsAcceptedVersion"='old-version'`} {
		_, err = db.Pool.Exec(ctx, `UPDATE "User" SET onboarded=TRUE,"termsAcceptedAt"=NOW(),"termsDocumentSha256"=$2,"termsAcceptedVersion"=$3 WHERE id=$1`, ids[0], auth.TermsDocumentSHA256, auth.TermsVersion)
		if err != nil {
			t.Fatal(err)
		}
		_, err = db.Pool.Exec(ctx, `UPDATE "User" SET `+change+` WHERE id=$1`, ids[0])
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.GetRegisteredUserByTelegramID(ctx, user.TelegramID, auth.TermsVersion, auth.TermsDocumentSHA256); err == nil {
			t.Fatalf("authentication accepted %s", change)
		}
		call := uuid.NewString()
		if err = db.CreateCallSession(ctx, call, call, ids[0], ids[1]); err == nil {
			t.Fatalf("admission accepted %s", change)
		}
	}
}
