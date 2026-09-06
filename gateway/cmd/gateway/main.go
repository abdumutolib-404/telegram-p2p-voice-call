package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/pairtalk/gateway/internal/config"
	"github.com/pairtalk/gateway/internal/database"
	"github.com/pairtalk/gateway/internal/livekit"
	"github.com/pairtalk/gateway/internal/matchmaking"
	"github.com/pairtalk/gateway/internal/proxy"
	"github.com/pairtalk/gateway/internal/signaling"
)

func main() {
	cfg := config.LoadConfig()

	if cfg.NodeEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize PostgreSQL pool
	db, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[Gateway] Warning: database connection failed: %v", err)
	} else {
		defer db.Close()
		log.Println("[Gateway] Connected to PostgreSQL pool")
	}

	// Initialize Redis client
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[Gateway] Fatal: invalid redis URL: %v", err)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("[Gateway] Warning: redis ping failed: %v", err)
	} else {
		log.Println("[Gateway] Connected to Redis")
	}

	// Initialize Matchmaking Engine
	matchEngine := matchmaking.NewEngine(rdb)

	// Initialize LiveKit Client
	lkClient := livekit.NewClient(
		cfg.LiveKitHost,
		cfg.LiveKitAPIKey,
		cfg.LiveKitAPISecret,
		cfg.S3Key,
		cfg.S3Secret,
		cfg.S3Bucket,
		cfg.S3Region,
		cfg.S3Endpoint,
		cfg.S3ForcePathStyle,
		cfg.RecordingsDir,
	)

	// Initialize PubSub Client
	pubsubClient := signaling.NewPubSubClient(rdb)

	// Admin Telegram IDs (e.g. from env if configured)
	adminIDs := []string{}

	// Initialize Signaling Hub
	hub := signaling.NewHub(
		db,
		matchEngine,
		lkClient,
		pubsubClient,
		cfg.BotToken,
		cfg.LiveKitHost,
		cfg.LiveKitAPIKey,
		cfg.LiveKitAPISecret,
		adminIDs,
	)

	// Startup reconciliation
	if db != nil {
		reconciled, err := hub.ReconcileActiveSessions(ctx)
		if err != nil {
			log.Printf("[Gateway] Reconcile active sessions warning: %v", err)
		} else {
			log.Printf("[Gateway] Reconciled %d active sessions on startup", reconciled)
		}
		hub.StartZombieSessionCleaner(ctx)
	}

	// Start Redis command subscriber for SCHEDULE_CALL_TEARDOWN
	pubsubClient.StartCommandSubscriber(ctx, hub)

	// Initialize Socket.IO Server
	socketIOServer := signaling.NewSocketIOServer(hub)

	// Initialize Reverse Proxy to Node
	revProxy, err := proxy.NewReverseProxy(cfg.NodeURL)
	if err != nil {
		log.Fatalf("[Gateway] Fatal: invalid node URL for reverse proxy: %v", err)
	}

	router := gin.New()
	router.Use(gin.Recovery())

	// Health endpoint
	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"service":   "gateway",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Socket.IO endpoint
	router.Any("/socket.io/*any", socketIOServer.HandleRequest)
	router.Any("/socket.io", socketIOServer.HandleRequest)

	// All other traffic reverse-proxied to internal Node backend
	router.NoRoute(revProxy.Handle)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	go func() {
		log.Printf("[Gateway] High-concurrency Go voice core listening on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[Gateway] Server listen failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Gateway] Shutting down gateway gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Gateway] Server shutdown error: %v", err)
	}
	log.Println("[Gateway] Gateway exited successfully")
}
