package handlers

import (
	"net/http"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type ProfileHandler struct {
	rideService *services.RideService
}

func NewProfileHandler(rs *services.RideService) *ProfileHandler {
	return &ProfileHandler{rideService: rs}
}

func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var user models.User
	err := database.DB.QueryRow(`
		SELECT id,
		       COALESCE(email, ''),
		       COALESCE(phone, ''),
		       COALESCE(full_name, ''),
		       COALESCE(avatar_url, ''),
		       COALESCE(city, 'Hyderabad'),
		       COALESCE(bio, ''),
		       COALESCE(gender, ''),
		       COALESCE(emergency_contact_name, ''),
		       COALESCE(emergency_contact_phone, ''),
		       is_driver, is_verified_driver,
		       COALESCE((SELECT AVG(score)::numeric(3,2) FROM ratings WHERE ratee_id = users.id), avg_rating, 5.0),
		       (
		           (SELECT COUNT(*) FROM rides WHERE driver_id = users.id AND status = 'completed') +
		           (SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = users.id AND rr.status = 'accepted' AND r.status = 'completed')
		       ),
		       created_at, updated_at
		FROM users WHERE id = $1
	`, userID).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName, &user.AvatarURL, &user.City,
		&user.Bio, &user.Gender, &user.EmergencyContactName, &user.EmergencyContactPhone,
		&user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.JSONError(w, http.StatusNotFound, "profile not found")
		return
	}

	utils.JSON(w, http.StatusOK, user)
}

func (h *ProfileHandler) GetProfileReviews(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	targetID := r.URL.Query().Get("user_id")
	if targetID == "" {
		targetID = userID
	}

	resp, err := h.rideService.GetReviewsForUser(targetID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch reviews")
		return
	}

	utils.JSON(w, http.StatusOK, resp)
}

func (h *ProfileHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.UpdateProfileRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var user models.User
	err := database.DB.QueryRow(`
		UPDATE users
		SET full_name = COALESCE(NULLIF($1, ''), full_name),
		    phone = COALESCE(NULLIF($2, ''), phone),
		    city = COALESCE(NULLIF($3, ''), city),
		    avatar_url = COALESCE(NULLIF($4, ''), avatar_url),
		    bio = COALESCE(NULLIF($5, ''), bio),
		    gender = COALESCE(NULLIF($6, ''), gender),
		    emergency_contact_name = COALESCE(NULLIF($7, ''), emergency_contact_name),
		    emergency_contact_phone = COALESCE(NULLIF($8, ''), emergency_contact_phone),
		    is_driver = $9,
		    updated_at = NOW()
		WHERE id = $10
		RETURNING id, email, phone, full_name, avatar_url, city,
		          bio, gender, emergency_contact_name, emergency_contact_phone,
		          is_driver, is_verified_driver, avg_rating, total_rides, created_at, updated_at
	`, req.FullName, req.Phone, req.City, req.AvatarURL, req.Bio, req.Gender,
		req.EmergencyContactName, req.EmergencyContactPhone, req.IsDriver, userID).Scan(
		&user.ID, &user.Email, &user.Phone, &user.FullName, &user.AvatarURL, &user.City,
		&user.Bio, &user.Gender, &user.EmergencyContactName, &user.EmergencyContactPhone,
		&user.IsDriver, &user.IsVerifiedDriver,
		&user.AvgRating, &user.TotalRides, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not update profile")
		return
	}

	utils.JSON(w, http.StatusOK, user)
}

func (h *ProfileHandler) RegisterPushToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req struct {
		Token string `json:"token"`
	}
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	_, err := database.DB.Exec(`
		UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2
	`, req.Token, userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not save push token")
		return
	}

	utils.JSONMessage(w, http.StatusOK, "push token registered")
}
