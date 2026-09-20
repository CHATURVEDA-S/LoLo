package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type RideHandler struct {
	rideService *services.RideService
}

func NewRideHandler(rs *services.RideService) *RideHandler {
	return &RideHandler{rideService: rs}
}

func (h *RideHandler) CreateRide(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.CreateRideRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := utils.ValidateRequired(req.Origin, "origin"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidateRequired(req.Destination, "destination"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := utils.ValidateRequired(req.DepartureTime, "departure_time"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	ride, err := h.rideService.CreateRide(userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, ride)
}

func (h *RideHandler) GetRide(w http.ResponseWriter, r *http.Request) {
	rideID := mux.Vars(r)["id"]

	ride, err := h.rideService.GetRide(rideID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch ride")
		return
	}
	if ride == nil {
		utils.JSONError(w, http.StatusNotFound, "ride not found")
		return
	}

	// Get requests if user is the driver
	userID := middleware.GetUserID(r)
	result := map[string]interface{}{
		"ride": ride,
	}

	if ride.DriverID == userID {
		requests, _ := h.rideService.GetRideRequests(rideID)
		result["requests"] = requests
	}

	// Get my request if I'm a passenger
	myRequest, _ := h.rideService.GetMyRequest(rideID, userID)
	if myRequest != nil {
		result["my_request"] = myRequest
	}

	// Get existing rating
	rating, _ := h.rideService.GetRating(rideID, userID)
	if rating != nil {
		result["my_rating"] = rating
	}

	// Get payment records
	payments, _ := h.rideService.GetPaymentRecords(rideID)
	if len(payments) > 0 {
		result["payments"] = payments
	}

	utils.JSON(w, http.StatusOK, result)
}

func (h *RideHandler) SearchRides(w http.ResponseWriter, r *http.Request) {
	city := r.URL.Query().Get("city")
	origin := r.URL.Query().Get("origin")
	destination := r.URL.Query().Get("destination")
	vehicleType := r.URL.Query().Get("vehicle_type")

	rides, err := h.rideService.SearchRides(city, origin, destination, vehicleType)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not search rides")
		return
	}

	if rides == nil {
		rides = []models.Ride{}
	}

	utils.JSON(w, http.StatusOK, rides)
}

func (h *RideHandler) UpdateRideStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.UpdateRideStatusRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.rideService.UpdateRideStatus(rideID, userID, req.Status)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "ride status updated")
}

func (h *RideHandler) GetMyTrips(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	trips, err := h.rideService.GetUserTrips(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch trips")
		return
	}

	if trips == nil {
		trips = []map[string]interface{}{}
	}

	utils.JSON(w, http.StatusOK, trips)
}

func (h *RideHandler) UpdateDriverLocation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.UpdateDriverLocationRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.rideService.UpdateDriverLocation(rideID, userID, req.Lat, req.Lng)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "driver location updated")
}

func (h *RideHandler) SendChatMessage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.SendChatMessageReq
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	msg, err := h.rideService.SendChatMessage(rideID, userID, req.Content)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, msg)
}

func (h *RideHandler) GetChatMessages(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	messages, err := h.rideService.GetChatMessages(rideID, userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	utils.JSON(w, http.StatusOK, messages)
}

func (h *RideHandler) InitiateRideCall(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	var req models.InitiateCallReq
	_ = utils.DecodeJSON(r, &req)

	call, err := h.rideService.InitiateRideCall(rideID, userID, req.ReceiverID)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, call)
}

func (h *RideHandler) GetActiveRideCall(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	rideID := mux.Vars(r)["id"]

	call, err := h.rideService.GetActiveRideCall(rideID, userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if call == nil {
		utils.JSON(w, http.StatusOK, map[string]interface{}{"active": false, "call": nil})
		return
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{"active": true, "call": call})
}

func (h *RideHandler) GetUserActiveIncomingCall(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	call, err := h.rideService.GetUserActiveIncomingCall(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if call == nil {
		utils.JSON(w, http.StatusOK, map[string]interface{}{"active": false, "call": nil})
		return
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{"active": true, "call": call})
}

func (h *RideHandler) UpdateRideCallStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	vars := mux.Vars(r)
	rideID := vars["id"]
	callID := vars["callId"]

	var req models.UpdateCallStatusReq
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	call, err := h.rideService.UpdateRideCallStatus(rideID, callID, userID, req.Status)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusOK, call)
}

func (h *RideHandler) SendCallSignal(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	vars := mux.Vars(r)
	rideID := vars["id"]
	callID := vars["callId"]

	var req models.SendSignalReq
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	sig, err := h.rideService.SendCallSignal(rideID, callID, userID, req.Type, req.Payload)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, sig)
}

func (h *RideHandler) GetCallSignals(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	vars := mux.Vars(r)
	rideID := vars["id"]
	callID := vars["callId"]
	afterID := r.URL.Query().Get("after")

	signals, err := h.rideService.GetCallSignals(rideID, callID, userID, afterID)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusOK, signals)
}

