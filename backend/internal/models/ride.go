package models

import (
	"time"
)

type Ride struct {
	ID             string      `json:"id"`
	DriverID       string      `json:"driver_id"`
	Origin         string      `json:"origin"`
	OriginLat      *float64    `json:"origin_lat,omitempty"`
	OriginLng      *float64    `json:"origin_lng,omitempty"`
	OriginPlaceID  string      `json:"origin_place_id,omitempty"`
	Destination    string      `json:"destination"`
	DestLat        *float64    `json:"dest_lat,omitempty"`
	DestLng        *float64    `json:"dest_lng,omitempty"`
	DestPlaceID    string      `json:"dest_place_id,omitempty"`
	City           string      `json:"city"`
	DepartureTime  time.Time   `json:"departure_time"`
	SeatsTotal     int         `json:"seats_total"`
	SeatsAvailable int         `json:"seats_available"`
	PricePerSeat   float64     `json:"price_per_seat"`
	VehicleType    string      `json:"vehicle_type"` // "car" or "bike"
	VehicleInfo    string      `json:"vehicle_info"`
	Notes          string      `json:"notes"`
	IsDaily        bool        `json:"is_daily"`
	RecurringDays  string      `json:"recurring_days"`
	Status         string      `json:"status"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	DriverLiveLat  *float64    `json:"driver_live_lat,omitempty"`
	DriverLiveLng  *float64    `json:"driver_live_lng,omitempty"`
	Driver         *UserPublic `json:"driver,omitempty"`
}

type UpdateDriverLocationRequest struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type CreateRideRequest struct {
	Origin        string   `json:"origin"`
	OriginLat     *float64 `json:"origin_lat"`
	OriginLng     *float64 `json:"origin_lng"`
	OriginPlaceID string   `json:"origin_place_id"`
	Destination   string   `json:"destination"`
	DestLat       *float64 `json:"dest_lat"`
	DestLng       *float64 `json:"dest_lng"`
	DestPlaceID   string   `json:"dest_place_id"`
	DepartureTime string   `json:"departure_time"`
	SeatsTotal    int      `json:"seats_total"`
	PricePerSeat  float64  `json:"price_per_seat"`
	VehicleType   string   `json:"vehicle_type"` // "car" or "bike"
	VehicleInfo   string   `json:"vehicle_info"`
	Notes         string   `json:"notes"`
	IsDaily       bool     `json:"is_daily"`
	RecurringDays string   `json:"recurring_days"`
}

type SearchRidesRequest struct {
	Origin      string `json:"origin"`
	Destination string `json:"destination"`
	City        string `json:"city"`
	Date        string `json:"date"`
	VehicleType string `json:"vehicle_type"`
}

type UpdateRideStatusRequest struct {
	Status string `json:"status"`
}
