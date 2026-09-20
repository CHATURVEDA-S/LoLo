package models

import (
	"time"
)

type RideRequest struct {
	ID             string      `json:"id"`
	RideID         string      `json:"ride_id"`
	PassengerID    string      `json:"passenger_id"`
	SeatsRequested int         `json:"seats_requested"`
	Status         string      `json:"status"`
	PickupPoint    string      `json:"pickup_point"`
	PickupLat      *float64    `json:"pickup_lat,omitempty"`
	PickupLng      *float64    `json:"pickup_lng,omitempty"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	Passenger      *UserPublic `json:"passenger,omitempty"`
	Ride           *Ride       `json:"ride,omitempty"`
}

type CreateRideRequestReq struct {
	SeatsRequested int      `json:"seats_requested"`
	PickupPoint    string   `json:"pickup_point"`
	PickupLat      *float64 `json:"pickup_lat"`
	PickupLng      *float64 `json:"pickup_lng"`
}

type UpdateRequestStatusReq struct {
	Status string `json:"status"` // accepted, rejected
}

type PaymentRecord struct {
	ID               string     `json:"id"`
	RideID           string     `json:"ride_id"`
	PassengerID      string     `json:"passenger_id"`
	DriverID         string     `json:"driver_id"`
	Amount           float64    `json:"amount"`
	PaymentMethod    string     `json:"payment_method"`
	Status           string     `json:"status"`
	PaidAt           *time.Time `json:"paid_at,omitempty"`
	ConfirmedByDriver bool      `json:"confirmed_by_driver"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type ConfirmPaymentRequest struct {
	PassengerID   string `json:"passenger_id"`
	PaymentMethod string `json:"payment_method"` // cash, upi
}

type ChatMessage struct {
	ID        string      `json:"id"`
	RideID    string      `json:"ride_id"`
	SenderID  string      `json:"sender_id"`
	Content   string      `json:"content"`
	CreatedAt time.Time   `json:"created_at"`
	Sender    *UserPublic `json:"sender,omitempty"`
}

type SendChatMessageReq struct {
	Content string `json:"content"`
}
