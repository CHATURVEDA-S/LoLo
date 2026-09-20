package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type RequestHandler struct {
	rideService *services.RideService
}

func NewRequestHandler(rs *services.RideService) *RequestHandler {
	return &RequestHandler{rideService: rs}
}

func (h *RequestHandler) CreateRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.CreateRideRequestReq
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	rideRequest, err := h.rideService.CreateRideRequest(rideID, userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, rideRequest)
}

func (h *RequestHandler) UpdateRequestStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	requestID := mux.Vars(r)["id"]

	var req models.UpdateRequestStatusReq
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.rideService.UpdateRequestStatus(requestID, userID, req.Status)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "request status updated")
}

func (h *RequestHandler) DeleteRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	requestID := mux.Vars(r)["id"]

	err := h.rideService.DeleteRequest(requestID, userID)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "request cancelled")
}

func (h *RequestHandler) ConfirmPayment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.ConfirmPaymentRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.rideService.ConfirmPayment(rideID, userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "payment confirmed")
}
