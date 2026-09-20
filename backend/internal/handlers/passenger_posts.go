package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type PassengerPostHandler struct {
	postService *services.PassengerPostService
}

func NewPassengerPostHandler(ps *services.PassengerPostService) *PassengerPostHandler {
	return &PassengerPostHandler{postService: ps}
}

func (h *PassengerPostHandler) CreatePost(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.CreatePassengerPostRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	post, err := h.postService.CreatePost(userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusCreated, post)
}

func (h *PassengerPostHandler) GetOpenPosts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	city := q.Get("city")
	origin := q.Get("origin")
	destination := q.Get("destination")
	vehiclePref := q.Get("vehicle_preference")

	posts, err := h.postService.GetOpenPosts(city, origin, destination, vehiclePref)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch travel requests")
		return
	}

	utils.JSON(w, http.StatusOK, posts)
}

func (h *PassengerPostHandler) GetMyPosts(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	posts, err := h.postService.GetMyPosts(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch your travel requests")
		return
	}

	utils.JSON(w, http.StatusOK, posts)
}

func (h *PassengerPostHandler) GetPost(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	post, err := h.postService.GetPostByID(id)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch travel request")
		return
	}
	if post == nil {
		utils.JSONError(w, http.StatusNotFound, "travel request not found")
		return
	}

	utils.JSON(w, http.StatusOK, post)
}

func (h *PassengerPostHandler) AcceptPost(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := mux.Vars(r)["id"]

	post, err := h.postService.AcceptPost(id, userID)
	if err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSON(w, http.StatusOK, post)
}

func (h *PassengerPostHandler) CompletePost(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := mux.Vars(r)["id"]

	if err := h.postService.CompletePost(id, userID); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "travel request completed")
}

func (h *PassengerPostHandler) CancelPost(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := mux.Vars(r)["id"]

	if err := h.postService.CancelPost(id, userID); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.JSONMessage(w, http.StatusOK, "travel request cancelled")
}
