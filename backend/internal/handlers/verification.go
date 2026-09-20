package handlers

import (
	"net/http"

	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/models"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type VerificationHandler struct {
	verificationService *services.VerificationService
}

func NewVerificationHandler(vs *services.VerificationService) *VerificationHandler {
	return &VerificationHandler{verificationService: vs}
}

func (h *VerificationHandler) GetVerificationStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	verification, err := h.verificationService.GetVerification(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch verification status")
		return
	}

	if verification == nil {
		utils.JSON(w, http.StatusOK, map[string]interface{}{
			"dl_status": "not_submitted",
			"rc_status": "not_submitted",
			"is_verified": false,
		})
		return
	}

	utils.JSON(w, http.StatusOK, verification)
}

func (h *VerificationHandler) SubmitDL(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.SubmitDLRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := utils.ValidateRequired(req.DLNumber, "dl_number"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	verification, err := h.verificationService.SubmitDL(userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not submit DL for verification")
		return
	}

	utils.JSON(w, http.StatusOK, verification)
}

func (h *VerificationHandler) SubmitRC(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.SubmitRCRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.JSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := utils.ValidateRequired(req.RCNumber, "rc_number"); err != nil {
		utils.JSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	verification, err := h.verificationService.SubmitRC(userID, req)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not submit RC for verification")
		return
	}

	utils.JSON(w, http.StatusOK, verification)
}
