package signaling

import (
	"testing"
	"testing/synctest"
	"time"
)

func TestDisconnectGraceAllowsMobileReopen(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
		defer hub.Close()
		finished := false
		hub.scheduleDisconnectGrace("returning-owner", func() { finished = true })
		time.Sleep(30 * time.Second)
		synctest.Wait()
		if finished {
			t.Fatal("call ended before the owner could reopen after 30 seconds")
		}
		socket := &ClientSocket{ID: "new-socket", UserID: "returning-owner", Hub: hub, Rooms: map[string]bool{}}
		if !hub.AddSocket(socket) {
			t.Fatal("reconnecting owner was rejected")
		}
		time.Sleep(31 * time.Second)
		synctest.Wait()
		if finished {
			t.Fatal("reconnection did not cancel the pending teardown")
		}
	})
}

func TestDisconnectGraceStillExpiresAndStopsOnShutdown(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
		finished := 0
		hub.scheduleDisconnectGrace("absent-owner", func() { finished++ })
		time.Sleep(59 * time.Second)
		synctest.Wait()
		if finished != 0 {
			t.Fatal("disconnect grace ended before one minute")
		}
		time.Sleep(time.Second)
		synctest.Wait()
		if finished != 1 {
			t.Fatal("absent owner did not reach teardown at one minute")
		}
		hub.scheduleDisconnectGrace("another-owner", func() { finished++ })
		hub.Close()
		time.Sleep(61 * time.Second)
		synctest.Wait()
		if finished != 1 {
			t.Fatal("shutdown left a disconnect callback running")
		}
	})
}
