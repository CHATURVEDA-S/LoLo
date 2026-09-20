package models

import (
	"time"
)

type DriverVerification struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	DLNumber        string     `json:"dl_number"`
	DLImageURL      string     `json:"dl_image_url"`
	DLStatus        string     `json:"dl_status"`
	DLVerifiedAt    *time.Time `json:"dl_verified_at,omitempty"`
	RCNumber        string     `json:"rc_number"`
	RCImageURL      string     `json:"rc_image_url"`
	RCStatus        string     `json:"rc_status"`
	RCVerifiedAt    *time.Time `json:"rc_verified_at,omitempty"`
	VehicleType     string     `json:"vehicle_type"` // "car" or "bike"
	VehicleMake     string     `json:"vehicle_make"`
	VehicleModel    string     `json:"vehicle_model"`
	VehicleYear     string     `json:"vehicle_year"`
	VehicleColor    string     `json:"vehicle_color"`
	VehiclePlate          string     `json:"vehicle_plate"`
	SecondaryRCNumber     string     `json:"secondary_rc_number"`
	SecondaryRCImageURL   string     `json:"secondary_rc_image_url"`
	SecondaryRCStatus     string     `json:"secondary_rc_status"`
	SecondaryVehicleType  string     `json:"secondary_vehicle_type"`
	SecondaryVehicleMake  string     `json:"secondary_vehicle_make"`
	SecondaryVehicleModel string     `json:"secondary_vehicle_model"`
	SecondaryVehicleYear  string     `json:"secondary_vehicle_year"`
	SecondaryVehicleColor string     `json:"secondary_vehicle_color"`
	SecondaryVehiclePlate string     `json:"secondary_vehicle_plate"`
	RejectionReason       string     `json:"rejection_reason"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

type SubmitDLRequest struct {
	DLNumber   string `json:"dl_number"`
	DLImageURL string `json:"dl_image_url"`
}

type SubmitRCRequest struct {
	RCNumber     string `json:"rc_number"`
	RCImageURL   string `json:"rc_image_url"`
	VehicleType  string `json:"vehicle_type"` // "car" or "bike"
	VehicleMake  string `json:"vehicle_make"`
	VehicleModel string `json:"vehicle_model"`
	VehicleYear  string `json:"vehicle_year"`
	VehicleColor string `json:"vehicle_color"`
	VehiclePlate string `json:"vehicle_plate"`
}

type SupportedCity struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	State    string  `json:"state"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	RadiusKM float64 `json:"radius_km"`
	IsActive bool    `json:"is_active"`
}

type Notification struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Type      string    `json:"type"`
	RideID    *string   `json:"ride_id,omitempty"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}
