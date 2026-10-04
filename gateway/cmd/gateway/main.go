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
		log.Fatal("[Gateway] Fatal: database connection failed")
	}
	defer db.Close()
	db.AdminTelegramIDs = cfg.AdminTelegramIDs
	if err := db.RefreshPlanConfiguration(ctx); err != nil {
		log.Fatal("[Gateway] Fatal: persisted plan configuration is unavailable or invalid")
	}
	log.Println("[Gateway] Connected to PostgreSQL pool")

	// Initialize Redis client
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatal("[Gateway] Fatal: invalid Redis configuration")
	}
	redisOpts.DialTimeout = 3 * time.Second
	redisOpts.ReadTimeout = 2 * time.Second
	redisOpts.WriteTimeout = 2 * time.Second
	redisOpts.PoolTimeout = 3 * time.Second
	redisOpts.ContextTimeoutEnabled = true
	redisOpts.MaxRetries = 1
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()
	pingCtx, pingCancel := context.WithTimeout(ctx, 3*time.Second)
	pingErr := rdb.Ping(pingCtx).Err()
	pingCancel()
	if pingErr != nil {
		log.Fatal("[Gateway] Fatal: Redis is unavailable")
	}
	log.Println("[Gateway] Connected to Redis")

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

	// Admin Telegram IDs parsed from environment
	adminIDs := cfg.AdminTelegramIDs

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
	socketIOServer := signaling.NewSocketIOServer(hub, cfg.OriginAllowed)

	// Initialize Reverse Proxy to Node
	revProxy, err := proxy.NewReverseProxy(cfg.NodeURL, cfg.TrustedProxyCIDRs...)
	if err != nil {
		log.Fatalf("[Gateway] Fatal: invalid node URL for reverse proxy: %v", err)
	}

	router := gin.New()
	if err := router.SetTrustedProxies(cfg.TrustedProxyCIDRs); err != nil {
		log.Fatal("[Gateway] Fatal: invalid TRUSTED_PROXY_CIDRS")
	}
	router.Use(gin.Recovery())

	// Health endpoint
	router.GET("/healthz", readinessHandler(
		func(ctx context.Context) error {
			return db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT id FROM "User" LIMIT 1)`).Scan(new(bool))
		},
		func(ctx context.Context) error { return rdb.Ping(ctx).Err() },
		nodeReadiness(cfg.NodeURL),
	))

	// Socket.IO endpoint
	router.Any("/socket.io/*any", socketIOServer.HandleRequest)
	router.Any("/socket.io", socketIOServer.HandleRequest)

	// All other traffic reverse-proxied to internal Node backend
	router.NoRoute(revProxy.Handle)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 * 1024,
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

	cancel() // Stop background loops immediately during drain
	hub.Close()
	socketIOServer.Close()
	log.Println("[Gateway] Shutting down gateway gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Gateway] Server shutdown error: %v", err)
	}
	log.Println("[Gateway] Gateway exited successfully")
}
