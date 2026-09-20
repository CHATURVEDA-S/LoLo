package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/loride/backend/internal/config"
	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/handlers"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

func main() {
	cfg := config.Load()

	// Connect to PostgreSQL
	if cfg.DatabaseURL == "" {
		log.Fatalf("❌ DATABASE_URL environment variable is required")
	}
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := database.RunMigrations(); err != nil {
		log.Fatalf("❌ Migration failed: %v", err)
	}

	// Initialize services
	authService := services.NewAuthService(cfg.JWTSecret)
	cityService := services.NewCityService()
	twoFactorService := services.NewTwoFactorService(cfg.TwoFactorAPIKey)
	notificationService := services.NewNotificationService(cfg.ExpoPushToken)
	rideService := services.NewRideService(notificationService)
	passengerPostService := services.NewPassengerPostService(notificationService)
	verificationService := services.NewVerificationService()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, cityService, twoFactorService)
	rideHandler := handlers.NewRideHandler(rideService)
	profileHandler := handlers.NewProfileHandler(rideService)
	requestHandler := handlers.NewRequestHandler(rideService)
	ratingHandler := handlers.NewRatingHandler(rideService)
	passengerPostHandler := handlers.NewPassengerPostHandler(passengerPostService)
	verificationHandler := handlers.NewVerificationHandler(verificationService)
	notificationHandler := handlers.NewNotificationHandler(notificationService)

	// Setup router
	r := mux.NewRouter()

	// Apply CORS globally
	r.Use(middleware.CORSMiddleware)

	// Health check
	r.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		utils.JSON(w, http.StatusOK, map[string]string{
			"status":  "healthy",
			"service": "Lo Ride API",
			"version": "1.0.0",
		})
	}).Methods("GET")

	// Privacy Policy (Google Play Store requirement)
	r.HandleFunc("/privacy", handlers.PrivacyPolicyHandler).Methods("GET", "HEAD")
	r.HandleFunc("/privacy-policy", handlers.PrivacyPolicyHandler).Methods("GET", "HEAD")
	r.HandleFunc("/api/privacy-policy", handlers.PrivacyPolicyHandler).Methods("GET", "HEAD")

	// Public routes
	r.HandleFunc("/api/auth/send-otp", authHandler.SendOTP).Methods("POST")
	r.HandleFunc("/api/auth/verify-otp", authHandler.VerifyOTP).Methods("POST")
	r.HandleFunc("/api/auth/register-otp", authHandler.RegisterOTP).Methods("POST")
	r.HandleFunc("/api/auth/signup", authHandler.Signup).Methods("POST")
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")

	// Cities (public)
	r.HandleFunc("/api/cities", func(w http.ResponseWriter, r *http.Request) {
		cities, err := cityService.GetSupportedCities()
		if err != nil {
			utils.JSONError(w, http.StatusInternalServerError, "could not fetch cities")
			return
		}
		utils.JSON(w, http.StatusOK, cities)
	}).Methods("GET")

	// Protected routes
	auth := r.PathPrefix("/api").Subrouter()
	auth.Use(middleware.AuthMiddleware(authService))

	// Auth
	auth.HandleFunc("/auth/refresh", authHandler.RefreshToken).Methods("POST")

	// Profile
	auth.HandleFunc("/profile", profileHandler.GetProfile).Methods("GET")
	auth.HandleFunc("/profile", profileHandler.UpdateProfile).Methods("PUT")
	auth.HandleFunc("/profile/reviews", profileHandler.GetProfileReviews).Methods("GET")

	// Verification
	auth.HandleFunc("/profile/verify-dl", verificationHandler.SubmitDL).Methods("POST")
	auth.HandleFunc("/profile/verify-rc", verificationHandler.SubmitRC).Methods("POST")
	auth.HandleFunc("/profile/verification-status", verificationHandler.GetVerificationStatus).Methods("GET")

	// Push notifications
	auth.HandleFunc("/notifications/register", profileHandler.RegisterPushToken).Methods("POST")
	auth.HandleFunc("/notifications", notificationHandler.GetNotifications).Methods("GET")
	auth.HandleFunc("/notifications/{id}/read", notificationHandler.MarkAsRead).Methods("PUT")
	auth.HandleFunc("/notifications/read-all", notificationHandler.MarkAllAsRead).Methods("PUT")
	auth.HandleFunc("/notifications/unread-count", notificationHandler.GetUnreadCount).Methods("GET")

	// Rides
	auth.HandleFunc("/rides", rideHandler.SearchRides).Methods("GET")
	auth.HandleFunc("/rides", rideHandler.CreateRide).Methods("POST")
	auth.HandleFunc("/rides/{id}", rideHandler.GetRide).Methods("GET")
	auth.HandleFunc("/rides/{id}/status", rideHandler.UpdateRideStatus).Methods("PUT")
	auth.HandleFunc("/rides/{id}/location", rideHandler.UpdateDriverLocation).Methods("PUT")
	auth.HandleFunc("/rides/{id}/request", requestHandler.CreateRequest).Methods("POST")
	auth.HandleFunc("/rides/{id}/complete-payment", requestHandler.ConfirmPayment).Methods("POST")
	auth.HandleFunc("/rides/{id}/messages", rideHandler.GetChatMessages).Methods("GET")
	auth.HandleFunc("/rides/{id}/messages", rideHandler.SendChatMessage).Methods("POST")
	auth.HandleFunc("/rides/{id}/call/initiate", rideHandler.InitiateRideCall).Methods("POST")
	auth.HandleFunc("/rides/{id}/call/active", rideHandler.GetActiveRideCall).Methods("GET")
	auth.HandleFunc("/rides/{id}/call/{callId}/status", rideHandler.UpdateRideCallStatus).Methods("PUT")
	auth.HandleFunc("/rides/{id}/call/{callId}/signal", rideHandler.SendCallSignal).Methods("POST")
	auth.HandleFunc("/rides/{id}/call/{callId}/signals", rideHandler.GetCallSignals).Methods("GET")
	auth.HandleFunc("/calls/active-incoming", rideHandler.GetUserActiveIncomingCall).Methods("GET")

	// Requests
	auth.HandleFunc("/requests/{id}", requestHandler.UpdateRequestStatus).Methods("PUT")
	auth.HandleFunc("/requests/{id}", requestHandler.DeleteRequest).Methods("DELETE")

	// Trips
	auth.HandleFunc("/trips", rideHandler.GetMyTrips).Methods("GET")

	// Ratings
	auth.HandleFunc("/ratings", ratingHandler.CreateRating).Methods("POST")

	// Passenger Travel Posts ("Need a Drop / Travel Request")
	auth.HandleFunc("/passenger-posts", passengerPostHandler.CreatePost).Methods("POST")
	auth.HandleFunc("/passenger-posts", passengerPostHandler.GetOpenPosts).Methods("GET")
	auth.HandleFunc("/passenger-posts/my", passengerPostHandler.GetMyPosts).Methods("GET")
	auth.HandleFunc("/passenger-posts/{id}", passengerPostHandler.GetPost).Methods("GET")
	auth.HandleFunc("/passenger-posts/{id}/accept", passengerPostHandler.AcceptPost).Methods("POST")
	auth.HandleFunc("/passenger-posts/{id}/complete", passengerPostHandler.CompletePost).Methods("PUT")
	auth.HandleFunc("/passenger-posts/{id}/cancel", passengerPostHandler.CancelPost).Methods("PUT")

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("🚗 Lo Ride API server starting on %s", addr)
	log.Printf("📍 Environment: %s", cfg.Environment)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("❌ Server failed: %v", err)
	}
}
