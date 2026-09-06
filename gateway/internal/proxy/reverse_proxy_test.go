package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type closeNotifierRecorder struct {
	*httptest.ResponseRecorder
	closed chan bool
}

func (cn *closeNotifierRecorder) CloseNotify() <-chan bool {
	return cn.closed
}

func (cn *closeNotifierRecorder) Flush() {
	cn.ResponseRecorder.Flush()
}

func newCloseNotifierRecorder() *closeNotifierRecorder {
	return &closeNotifierRecorder{
		ResponseRecorder: httptest.NewRecorder(),
		closed:           make(chan bool, 1),
	}
}

func TestReverseProxy_Director(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var (
		receivedHost         string
		receivedPath         string
		receivedTelegramInit string
		receivedTraceID      string
		receivedCustomHeader string
	)

	// Backend server to verify proxied request
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHost = r.Host
		receivedPath = r.URL.Path
		receivedTelegramInit = r.Header.Get("X-Telegram-Init-Data")
		receivedTraceID = r.Header.Get("X-Trace-Id")
		receivedCustomHeader = r.Header.Get("X-Custom-Test")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"status":"proxied"}`)
	}))
	defer backend.Close()

	rp, err := NewReverseProxy(backend.URL)
	if err != nil {
		t.Fatalf("failed to create reverse proxy: %v", err)
	}

	router := gin.New()
	router.NoRoute(rp.Handle)

	req := httptest.NewRequest(http.MethodGet, "/api/users/profile", nil)
	req.Host = "original.example.com"
	req.Header.Set("X-Telegram-Init-Data", "query_id=test_query")
	req.Header.Set("X-Trace-Id", "trace-uuid-12345")
	req.Header.Set("X-Custom-Test", "forward-me")

	rec := newCloseNotifierRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}

	// Verify Host header rewrite
	if receivedHost != rp.target.Host {
		t.Errorf("expected Host header %q, got %q", rp.target.Host, receivedHost)
	}

	// Verify Path preservation
	if receivedPath != "/api/users/profile" {
		t.Errorf("expected Path '/api/users/profile', got %q", receivedPath)
	}

	// Verify custom headers forwarding
	if receivedTelegramInit != "query_id=test_query" {
		t.Errorf("expected X-Telegram-Init-Data 'query_id=test_query', got %q", receivedTelegramInit)
	}
	if receivedTraceID != "trace-uuid-12345" {
		t.Errorf("expected X-Trace-Id 'trace-uuid-12345', got %q", receivedTraceID)
	}
	if receivedCustomHeader != "forward-me" {
		t.Errorf("expected X-Custom-Test 'forward-me', got %q", receivedCustomHeader)
	}
}

func TestNewReverseProxy_InvalidURL(t *testing.T) {
	_, err := NewReverseProxy("::invalid-url::")
	if err == nil {
		t.Errorf("expected error for invalid URL")
	}
}
