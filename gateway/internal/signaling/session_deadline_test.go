package signaling

import (
	"sync"
	"testing"
	"time"
)

func TestSessionDeadlineCannotBeExtendedByConcurrentReplays(t *testing.T) {
	h := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
	defer h.Close()
	fired := make(chan struct{}, 1)
	h.installSessionDeadline("fixture", time.Now().Add(40*time.Millisecond), func() { fired <- struct{}{} })
	var workers sync.WaitGroup
	for i := 0; i < 100; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			h.installSessionDeadline("fixture", time.Now().Add(time.Hour), func() { t.Error("later replay replaced original teardown") })
		}()
	}
	workers.Wait()
	select {
	case <-fired:
	case <-time.After(2 * time.Second):
		t.Fatal("original teardown was postponed")
	}
}

func TestOverdueSessionDeadlineShortensExistingTimer(t *testing.T) {
	h := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
	defer h.Close()
	fired := make(chan struct{}, 1)
	h.installSessionDeadline("fixture", time.Now().Add(time.Hour), func() { t.Error("obsolete timer fired") })
	h.installSessionDeadline("fixture", time.Now().Add(-time.Second), func() { fired <- struct{}{} })
	select {
	case <-fired:
	case <-time.After(2 * time.Second):
		t.Fatal("overdue cleanup delayed")
	}
}
