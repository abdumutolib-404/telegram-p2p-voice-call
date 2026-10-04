package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestReadinessFailsClosedAndOmitsDependencyDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, fail := range []bool{false, true} {
		router := gin.New()
		router.GET("/healthz", readinessHandler(func(ctx context.Context) error {
			if _, ok := ctx.Deadline(); !ok {
				t.Fatal("readiness check has no deadline")
			}
			if fail {
				return errors.New("private database connection detail")
			}
			return nil
		}))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		want := http.StatusOK
		if fail {
			want = http.StatusServiceUnavailable
		}
		if response.Code != want || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(response.Body.String(), "private") {
			t.Fatalf("unsafe readiness response: %d %s", response.Code, response.Body.String())
		}
	}
}

func TestNodeReadinessRequiresBackendReadyState(t *testing.T) {
	for _, value := range []struct {
		status int
		body   string
		ready  bool
	}{
		{200, `{"status":"ok"}`, true}, {200, `{"status":"degraded"}`, false}, {503, `{"status":"ok"}`, false}, {200, `not JSON`, false},
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(value.status)
			_, _ = w.Write([]byte(value.body))
		}))
		err := nodeReadiness(server.URL)(context.Background())
		server.Close()
		if (err == nil) != value.ready {
			t.Fatalf("readiness accepted wrong backend state: %+v", value)
		}
	}
}
