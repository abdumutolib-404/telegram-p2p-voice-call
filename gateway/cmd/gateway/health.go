package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func readinessHandler(checks ...func(context.Context) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		status, code := "ok", http.StatusOK
		for _, check := range checks {
			if err := check(ctx); err != nil {
				status = "degraded"
				code = http.StatusServiceUnavailable
				break
			}
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(code, gin.H{"status": status, "service": "gateway", "timestamp": time.Now().UTC().Format(time.RFC3339)})
	}
}

func nodeReadiness(baseURL string) func(context.Context) error {
	client := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	return func(ctx context.Context) error {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/health", nil)
		if err != nil {
			return err
		}
		response, err := client.Do(req)
		if err != nil {
			return errors.New("internal backend is unavailable")
		}
		defer response.Body.Close()
		var payload struct {
			Status string `json:"status"`
		}
		if response.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&payload) != nil || payload.Status != "ok" {
			return errors.New("internal backend is not ready")
		}
		return nil
	}
}
