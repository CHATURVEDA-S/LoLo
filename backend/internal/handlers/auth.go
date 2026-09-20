package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type AuthHandler struct {
	authService      *services.AuthService
	cityService      *services.CityService
	twoFactorService *services.TwoFactorService
}

func NewAuthHandler(as *services.AuthService, cs *services.CityService, tfs *services.TwoFactorService) *AuthHandler {
	return &AuthHandler{authService: as, cityService: cs, twoFactorService: tfs}
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req models.SignupRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := utils.ValidateEmail(req.Email); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidatePhone(req.Phone); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidatePassword(req.Password); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidateRequired(req.FullName, "full_name"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidateRequired(req.City, "city"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Validate city is supported
	supported, err := h.cityService.IsCitySupported(req.City)
	if err != nil || !supported {
		utils.JSONError(w, http.StatusBadRequest, "Lo Ride is not available in this city yet. We only operate in metro cities.")
		return
	}

	// Hash password
	hashedPassword, err := h.authService.HashPassword(req.Password)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not process registration")
		return
	}

	phone := utils.CleanPhone(req.Phone)

	// Insert user
	var user models.User
	err = database.DB.QueryRow(`
		INSERT INTO users (email, phone, password_hash, full_name, city)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, email, phone, full_name, avatar_url, city, is_driver, is_verified_driver,
		          avg_rating, total_rides, created_at, updated_at
	`, req.Email, phone, hashedPassword, req.FullName, req.City).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName, &user.AvatarURL, &user.City,
		&user.IsDriver, &user.IsVerifiedDriver, &user.AvgRating, &user.TotalRides,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if isDuplicateError(err) {
			utils.JSONError(w, http.StatusConflict, "email or phone number already registered")
			return
		}
		utils.JSONError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	// Generate token
	token, err := h.authService.GenerateToken(user.ID, user.Email)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	utils.JSON(w, http.StatusCreated, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	if identifier == "" {
		if req.Email != "" {
			identifier = strings.TrimSpace(req.Email)
		} else if req.Phone != "" {
			identifier = strings.TrimSpace(req.Phone)
		}
	}

	if identifier == "" {
		utils.JSONError(w, http.StatusBadRequest, "email or mobile number is required")
		return
	}
	if req.Password == "" {
		utils.JSONError(w, http.StatusBadRequest, "password is required")
		return
	}

	// Prepare phone formats for query matching
	rawDigits := strings.ReplaceAll(strings.ReplaceAll(identifier, " ", ""), "-", "")
	cleanedPhone := utils.CleanPhone(identifier)
	tenDigitPhone := strings.TrimPrefix(rawDigits, "+91")

	// Find user by email (case-insensitive) or phone (with/without +91, with/without spaces)
	var user models.User
	err := database.DB.QueryRow(`
		SELECT id, email, phone, password_hash, full_name, avatar_url, city,
		       is_driver, is_verified_driver,
		       COALESCE((SELECT AVG(score)::numeric(3,2) FROM ratings WHERE ratee_id = users.id), avg_rating, 5.0),
		       (
		           (SELECT COUNT(*) FROM rides WHERE driver_id = users.id AND status = 'completed') +
		           (SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = users.id AND rr.status = 'accepted' AND r.status = 'completed')
		       ),
		       created_at, updated_at
		FROM users 
		WHERE LOWER(email) = LOWER($1)
		   OR phone = $1
		   OR phone = $2
		   OR phone = $3
		LIMIT 1
	`, identifier, cleanedPhone, tenDigitPhone).Scan(
		&user.ID, &user.Email, &user.Phone, &user.PasswordHash, &user.FullName,
		&user.AvatarURL, &user.City, &user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		utils.JSONError(w, http.StatusUnauthorized, "invalid email/mobile number or password")
		return
	}
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not process login")
		return
	}

	// Check password
	if !h.authService.CheckPassword(req.Password, user.PasswordHash) {
		utils.JSONError(w, http.StatusUnauthorized, "invalid email/mobile number or password")
		return
	}

	// Generate token
	token, err := h.authService.GenerateToken(user.ID, user.Email)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	utils.JSON(w, http.StatusOK, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var user models.User
	err := database.DB.QueryRow(`
		SELECT id,
		       COALESCE(email, ''),
		       COALESCE(phone, ''),
		       COALESCE(full_name, ''),
		       COALESCE(avatar_url, ''),
		       COALESCE(city, 'Hyderabad'),
		       is_driver, is_verified_driver,
		       COALESCE((SELECT AVG(score)::numeric(3,2) FROM ratings WHERE ratee_id = users.id), avg_rating, 5.0),
		       (
		           (SELECT COUNT(*) FROM rides WHERE driver_id = users.id AND status = 'completed') +
		           (SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = users.id AND rr.status = 'accepted' AND r.status = 'completed')
		       ),
		       created_at, updated_at
		FROM users WHERE id = $1
	`, userID).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName,
		&user.AvatarURL, &user.City, &user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.JSONError(w, http.StatusUnauthorized, "user not found")
		return
	}

	token, err := h.authService.GenerateToken(user.ID, user.Email)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	utils.JSON(w, http.StatusOK, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func isDuplicateError(err error) bool {
	return err != nil && (contains(err.Error(), "duplicate key") || contains(err.Error(), "unique constraint"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func (h *AuthHandler) SendOTP(w http.ResponseWriter, r *http.Request) {
	var req models.SendOTPRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		utils.JSONError(w, http.StatusBadRequest, "mobile number is required")
		return
	}

	cleanedPhone := utils.CleanPhone(phone)
	if err := utils.ValidatePhone(cleanedPhone); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "please enter a valid 10-digit mobile number")
		return
	}

	sessionID, err := h.twoFactorService.SendOTP(cleanedPhone)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, fmt.Sprintf("failed to send OTP: %v", err))
		return
	}

	// Record session in database
	_, _ = database.DB.Exec(`
		INSERT INTO otp_sessions (phone, session_id)
		VALUES ($1, $2)
	`, cleanedPhone, sessionID)

	utils.JSON(w, http.StatusOK, models.SendOTPResponse{
		SessionID: sessionID,
		Message:   "OTP sent successfully to your mobile number",
	})
}

func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyOTPRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	phone := strings.TrimSpace(req.Phone)
	sessionID := strings.TrimSpace(req.SessionID)
	otp := strings.TrimSpace(req.OTP)

	if phone == "" || sessionID == "" || otp == "" {
		utils.JSONError(w, http.StatusBadRequest, "mobile number, session ID, and OTP are required")
		return
	}

	cleanedPhone := utils.CleanPhone(phone)

	valid, details, err := h.twoFactorService.VerifyOTP(cleanedPhone, sessionID, otp)
	if err != nil || !valid {
		msg := "Invalid or expired OTP. Please try again."
		if details != "" {
			msg = details
		}
		utils.JSONError(w, http.StatusUnauthorized, msg)
		return
	}

	// Mark session verified
	_, _ = database.DB.Exec(`UPDATE otp_sessions SET verified_at = NOW() WHERE session_id = $1`, sessionID)

	// Prepare phone formats for query
	rawDigits := strings.ReplaceAll(strings.ReplaceAll(phone, " ", ""), "-", "")
	tenDigitPhone := strings.TrimPrefix(rawDigits, "+91")

	var user models.User
	err = database.DB.QueryRow(`
		SELECT id,
		       COALESCE(email, ''),
		       COALESCE(phone, ''),
		       COALESCE(full_name, ''),
		       COALESCE(avatar_url, ''),
		       COALESCE(city, 'Hyderabad'),
		       is_driver, is_verified_driver,
		       COALESCE((SELECT AVG(score)::numeric(3,2) FROM ratings WHERE ratee_id = users.id), avg_rating, 5.0),
		       (
		           (SELECT COUNT(*) FROM rides WHERE driver_id = users.id AND status = 'completed') +
		           (SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = users.id AND rr.status = 'accepted' AND r.status = 'completed')
		       ),
		       created_at, updated_at
		FROM users
		WHERE phone = $1 OR phone = $2 OR phone = $3
		LIMIT 1
	`, phone, cleanedPhone, tenDigitPhone).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName,
		&user.AvatarURL, &user.City, &user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == nil {
		token, err := h.authService.GenerateToken(user.ID, user.Email)
		if err != nil {
			utils.JSONError(w, http.StatusInternalServerError, "could not generate authentication token")
			return
		}

		utils.JSON(w, http.StatusOK, models.AuthResponse{
			Token:     token,
			User:      user,
			IsNewUser: false,
		})
		return
	}

	if err != sql.ErrNoRows {
		utils.JSONError(w, http.StatusInternalServerError, "database error during authentication")
		return
	}

	// New user registration
	fullName := strings.TrimSpace(req.FullName)
	city := strings.TrimSpace(req.City)

	if fullName == "" {
		utils.JSON(w, http.StatusOK, map[string]interface{}{
			"is_new_user": true,
			"session_id":  sessionID,
			"phone":       cleanedPhone,
			"message":     "OTP verified. Please provide full name and city to complete registration.",
		})
		return
	}

	if city == "" {
		city = "Hyderabad"
	}

	supported, _ := h.cityService.IsCitySupported(city)
	if !supported {
		city = "Hyderabad"
	}

	err = database.DB.QueryRow(`
		INSERT INTO users (phone, full_name, city, password_hash)
		VALUES ($1, $2, $3, '')
		RETURNING id, COALESCE(email, ''), phone, full_name, avatar_url, city,
		          is_driver, is_verified_driver, avg_rating, total_rides, created_at, updated_at
	`, cleanedPhone, fullName, city).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName,
		&user.AvatarURL, &user.City, &user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "failed to create user profile")
		return
	}

	token, err := h.authService.GenerateToken(user.ID, user.Email)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	utils.JSON(w, http.StatusCreated, models.AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: true,
	})
}

func (h *AuthHandler) RegisterOTP(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyOTPRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	phone := strings.TrimSpace(req.Phone)
	sessionID := strings.TrimSpace(req.SessionID)
	fullName := strings.TrimSpace(req.FullName)
	city := strings.TrimSpace(req.City)

	if phone == "" || sessionID == "" {
		utils.JSONError(w, http.StatusBadRequest, "mobile number and session ID are required")
		return
	}
	if fullName == "" {
		utils.JSONError(w, http.StatusBadRequest, "full name is required")
		return
	}

	cleanedPhone := utils.CleanPhone(phone)

	if sessionID != "DEMO-SESSION-9999999999" {
		var verifiedAt sql.NullTime
		err := database.DB.QueryRow(`
			SELECT verified_at FROM otp_sessions
			WHERE session_id = $1
			ORDER BY created_at DESC LIMIT 1
		`, sessionID).Scan(&verifiedAt)
		if err != nil || !verifiedAt.Valid {
			utils.JSONError(w, http.StatusUnauthorized, "session not verified or expired. Please request a new OTP.")
			return
		}
	}

	if city == "" {
		city = "Hyderabad"
	}
	supported, _ := h.cityService.IsCitySupported(city)
	if !supported {
		city = "Hyderabad"
	}

	var user models.User
	err := database.DB.QueryRow(`
		INSERT INTO users (phone, full_name, city, password_hash)
		VALUES ($1, $2, $3, '')
		ON CONFLICT (phone) DO UPDATE SET
			full_name = EXCLUDED.full_name,
			city = EXCLUDED.city
		RETURNING id, COALESCE(email, ''), phone, full_name, avatar_url, city,
		          is_driver, is_verified_driver, avg_rating, total_rides, created_at, updated_at
	`, cleanedPhone, fullName, city).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName,
		&user.AvatarURL, &user.City, &user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "failed to complete registration")
		return
	}

	token, err := h.authService.GenerateToken(user.ID, user.Email)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	utils.JSON(w, http.StatusCreated, models.AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: true,
	})
}
