package handlers

import (
	"net/http"

	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type RatingHandler struct {
	rideService *services.RideService
}

func NewRatingHandler(rs *services.RideService) *RatingHandler {
	return &RatingHandler{rideService: rs}
}

func (h *RatingHandler) CreateRating(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.CreateRatingRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	rating, err := h.rideService.CreateRating(userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, rating)
}
