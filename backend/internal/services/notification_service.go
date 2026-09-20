package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/models"
)

type NotificationService struct {
	expoPushToken string
}

func NewNotificationService(expoPushToken string) *NotificationService {
	return &NotificationService{expoPushToken: expoPushToken}
}

func (s *NotificationService) CreateNotification(userID, title, body, notifType string, rideID *string) error {
	_, err := database.DB.Exec(`
		INSERT INTO notifications (user_id, title, body, type, ride_id)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, title, body, notifType, rideID)
	if err != nil {
		return err
	}

	// Try to send push notification
	go s.sendPushNotification(userID, title, body)

	return nil
}

func (s *NotificationService) GetNotifications(userID string, limit int) ([]models.Notification, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := database.DB.Query(`
		SELECT id, user_id, title, body, type, ride_id, is_read, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Body, &n.Type, &n.RideID, &n.IsRead, &n.CreatedAt)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, n)
	}
	return notifications, nil
}

func (s *NotificationService) MarkAsRead(notificationID, userID string) error {
	_, err := database.DB.Exec(`
		UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2
	`, notificationID, userID)
	return err
}

func (s *NotificationService) MarkAllAsRead(userID string) error {
	_, err := database.DB.Exec(`
		UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false
	`, userID)
	return err
}

func (s *NotificationService) GetUnreadCount(userID string) (int, error) {
	var count int
	err := database.DB.QueryRow(`
		SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false
	`, userID).Scan(&count)
	return count, err
}

func (s *NotificationService) sendPushNotification(userID, title, body string) {
	s.sendPushNotificationWithMeta(userID, title, body, "default", "normal", nil)
}

func (s *NotificationService) sendPushNotificationWithMeta(userID, title, body, channelID, priority string, extraData map[string]interface{}) {
	// Get user's push token
	var pushToken string
	err := database.DB.QueryRow(`SELECT push_token FROM users WHERE id = $1`, userID).Scan(&pushToken)
	if err != nil || pushToken == "" {
		return
	}

	payload := map[string]interface{}{
		"to":        pushToken,
		"title":     title,
		"body":      body,
		"sound":     "default",
		"priority":  priority,
		"channelId": channelID,
	}
	if extraData != nil {
		payload["data"] = extraData
	}

	jsonPayload, err := json.Marshal([]interface{}{payload})
	if err != nil {
		log.Printf("Failed to marshal push payload: %v", err)
		return
	}

	req, err := http.NewRequest("POST", "https://exp.host/--/api/v2/push/send", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Printf("Failed to create push request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if s.expoPushToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.expoPushToken))
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send push notification: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("Push notification failed with status: %d", resp.StatusCode)
	}
}

// Helper methods for common notification types
func (s *NotificationService) NotifyRideRequest(driverID, passengerName string, rideID string) {
	s.CreateNotification(
		driverID,
		"New Ride Request",
		fmt.Sprintf("%s wants to join your ride", passengerName),
		"ride_request",
		&rideID,
	)
}

func (s *NotificationService) NotifyRequestAccepted(passengerID, driverName string, rideID string) {
	s.CreateNotification(
		passengerID,
		"Request Accepted! 🎉",
		fmt.Sprintf("%s accepted your ride request", driverName),
		"request_accepted",
		&rideID,
	)
}

func (s *NotificationService) NotifyRequestRejected(passengerID, driverName string, rideID string) {
	s.CreateNotification(
		passengerID,
		"Request Declined",
		fmt.Sprintf("%s declined your ride request", driverName),
		"request_rejected",
		&rideID,
	)
}

func (s *NotificationService) NotifyRideStarted(passengerID, driverName string, rideID string) {
	s.CreateNotification(
		passengerID,
		"Ride Started! 🚗",
		fmt.Sprintf("%s has started the ride", driverName),
		"ride_started",
		&rideID,
	)
}

func (s *NotificationService) NotifyRideCompleted(passengerID, driverName string, amount float64, rideID string) {
	s.CreateNotification(
		passengerID,
		"Ride Completed! ✅",
		fmt.Sprintf("Ride with %s completed. Please pay ₹%.0f", driverName, amount),
		"ride_completed",
		&rideID,
	)
}

func (s *NotificationService) NotifyPaymentReceived(driverID, passengerName string, amount float64, rideID string) {
	s.CreateNotification(
		driverID,
		"Payment Confirmed 💰",
		fmt.Sprintf("₹%.0f received from %s", amount, passengerName),
		"payment_confirmed",
		&rideID,
	)
}

func (s *NotificationService) NotifyChatMessage(recipientID, senderName, message, rideID string) {
	s.CreateNotification(
		recipientID,
		fmt.Sprintf("💬 Message from %s", senderName),
		message,
		"chat_message",
		&rideID,
	)
}

func (s *NotificationService) NotifyRideCancelled(passengerID, driverName string, rideID string) {
	s.CreateNotification(
		passengerID,
		"Ride Cancelled ⚠️",
		fmt.Sprintf("%s cancelled the ride. If you need a drop, you can post a drop request or search for another ride.", driverName),
		"ride_cancelled",
		&rideID,
	)
}

func (s *NotificationService) NotifyIncomingCall(recipientID, callerName, rideID, callID string) {
	title := fmt.Sprintf("📞 Incoming In-App Call from %s", callerName)
	body := "Lo Ride Secure In-App Audio Call • Tap to Answer"
	
	// Create database notification record
	_, _ = database.DB.Exec(`
		INSERT INTO notifications (user_id, title, body, type, ride_id)
		VALUES ($1, $2, $3, 'incoming_call', $4)
	`, recipientID, title, body, rideID)

	// High priority immediate push notification with call sound and data payload
	go s.sendPushNotificationWithMeta(recipientID, title, body, "calls", "high", map[string]interface{}{
		"type":    "incoming_call",
		"ride_id": rideID,
		"call_id": callID,
		"caller":  callerName,
	})
}

