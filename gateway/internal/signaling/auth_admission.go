package signaling

import (
	"context"
	"github.com/pairtalk/gateway/internal/database"
	"sync"
)

// Reservations never queue callers. Capacity covers work before session admission.
func (s *SocketIOServer) reserveIngress(ip string, authentication bool) (func(), bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	slots, ips, perIP := s.handshakeSlots, s.handshakeIPs, 8
	if authentication {
		slots, ips, perIP = s.authSlots, s.authIPs, 4
	}
	if s.closed || ips[ip] >= perIP {
		return nil, false
	}
	select {
	case slots <- struct{}{}:
	default:
		return nil, false
	}
	ips[ip]++
	var once sync.Once
	return func() {
		once.Do(func() {
			s.mu.Lock()
			ips[ip]--
			if ips[ip] == 0 {
				delete(ips, ip)
			}
			<-slots
			s.mu.Unlock()
		})
	}, true
}

func (s *SocketIOServer) authenticate(ctx context.Context, ip, token string) (*database.User, bool) {
	release, ok := s.reserveIngress(ip, true)
	if !ok {
		return nil, false
	}
	defer release()
	if ctx.Err() != nil {
		return nil, false
	}
	return s.Hub.Authenticate(ctx, token)
}
