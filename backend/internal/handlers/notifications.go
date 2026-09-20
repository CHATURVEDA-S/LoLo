package handlers

import (
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/loride/backend/internal/middleware"
	"github.com/loride/backend/internal/services"
	"github.com/loride/backend/internal/utils"
)

type NotificationHandler struct {
	notificationService *services.NotificationService
}

func NewNotificationHandler(ns *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{notificationService: ns}
}

func (h *NotificationHandler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	notifications, err := h.notificationService.GetNotifications(userID, limit)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not fetch notifications")
		return
	}

	unreadCount, _ := h.notificationService.GetUnreadCount(userID)

	result := map[string]interface{}{
		"unread_count": unreadCount,
	}
	if notifications != nil {
		result["notifications"] = notifications
	} else {
		result["notifications"] = []struct{}{}
	}

	utils.JSON(w, http.StatusOK, result)
}

func (h *NotificationHandler) MarkAsRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	notificationID := mux.Vars(r)["id"]

	err := h.notificationService.MarkAsRead(notificationID, userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not mark notification as read")
		return
	}

	utils.JSONMessage(w, http.StatusOK, "notification marked as read")
}

func (h *NotificationHandler) MarkAllAsRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	err := h.notificationService.MarkAllAsRead(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not mark notifications as read")
		return
	}

	utils.JSONMessage(w, http.StatusOK, "all notifications marked as read")
}

func (h *NotificationHandler) GetUnreadCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	count, err := h.notificationService.GetUnreadCount(userID)
	if err != nil {
		utils.JSONError(w, http.StatusInternalServerError, "could not get unread count")
		return
	}

	utils.JSON(w, http.StatusOK, map[string]int{"unread_count": count})
}
