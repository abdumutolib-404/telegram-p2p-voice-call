package proxy

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"
)

type ReverseProxy struct {
	proxy          *httputil.ReverseProxy
	target         *url.URL
	trustedProxies []*net.IPNet
}

func NewReverseProxy(targetURL string, trustedProxies ...string) (*ReverseProxy, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return nil, fmt.Errorf("invalid backend proxy target")
	}
	var trusted []*net.IPNet
	for _, value := range trustedProxies {
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			ip := net.ParseIP(value)
			if ip == nil {
				return nil, fmt.Errorf("invalid trusted proxy address")
			}
			bits := 128
			if ip.To4() != nil {
				bits = 32
			}
			network = &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)}
		}
		trusted = append(trusted, network)
	}

	p := httputil.NewSingleHostReverseProxy(u)

	// Custom director to preserve host and forwarding headers
	origDirector := p.Director
	p.Director = func(req *http.Request) {
		origDirector(req)
		req.Header.Set("X-Forwarded-Host", req.Host)
		req.Host = u.Host
	}

	return &ReverseProxy{
		proxy:          p,
		target:         u,
		trustedProxies: trusted,
	}, nil
}

func (rp *ReverseProxy) Handle(c *gin.Context) {
	peer, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil {
		peer = c.Request.RemoteAddr
	}
	ip := net.ParseIP(peer)
	trusted := false
	for _, network := range rp.trustedProxies {
		if network.Contains(ip) {
			trusted = true
			break
		}
	}
	proto := "http"
	if c.Request.TLS != nil {
		proto = "https"
	}
	if trusted && (c.GetHeader("X-Forwarded-Proto") == "https" || c.GetHeader("X-Forwarded-Proto") == "http") {
		proto = c.GetHeader("X-Forwarded-Proto")
	}
	clientIP := c.ClientIP()
	// Node sees the gateway as a trusted loopback peer. Never forward raw client
	// forwarding/Cloudflare headers into that trusted boundary.
	c.Request.Header.Del("CF-Connecting-IP")
	c.Request.Header.Del("Forwarded")
	c.Request.Header.Del("X-Forwarded-For")
	c.Request.Header.Set("X-Forwarded-Proto", proto)
	if clientIP != "" {
		c.Request.Header.Set("X-Real-IP", clientIP)
		c.Request.Header.Set("X-Forwarded-For", clientIP)
	}
	rp.proxy.ServeHTTP(c.Writer, c.Request)
}
