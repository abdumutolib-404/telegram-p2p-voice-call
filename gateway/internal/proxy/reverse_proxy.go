package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"
)

type ReverseProxy struct {
	proxy  *httputil.ReverseProxy
	target *url.URL
}

func NewReverseProxy(targetURL string) (*ReverseProxy, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	p := httputil.NewSingleHostReverseProxy(u)

	// Custom director to preserve host and forwarding headers
	origDirector := p.Director
	p.Director = func(req *http.Request) {
		origDirector(req)
		req.Host = u.Host
	}

	return &ReverseProxy{
		proxy:  p,
		target: u,
	}, nil
}

func (rp *ReverseProxy) Handle(c *gin.Context) {
	clientIP := c.ClientIP()
	if clientIP != "" {
		c.Request.Header.Set("X-Real-IP", clientIP)
	}
	rp.proxy.ServeHTTP(c.Writer, c.Request)
}
