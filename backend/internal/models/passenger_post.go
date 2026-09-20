package models

import (
	"time"
)

type PassengerPost struct {
	ID                string      `json:"id"`
	PassengerID       string      `json:"passenger_id"`
	Passenger         *UserPublic `json:"passenger,omitempty"`
	Origin            string      `json:"origin"`
	OriginLat         *float64    `json:"origin_lat,omitempty"`
	OriginLng         *float64    `json:"origin_lng,omitempty"`
	OriginPlaceID     string      `json:"origin_place_id"`
	Destination       string      `json:"destination"`
	DestLat           *float64    `json:"dest_lat,omitempty"`
	DestLng           *float64    `json:"dest_lng,omitempty"`
	DestPlaceID       string      `json:"dest_place_id"`
	City              string      `json:"city"`
	DepartureTime     time.Time   `json:"departure_time"`
	SeatsNeeded       int         `json:"seats_needed"`
	VehiclePreference string      `json:"vehicle_preference"` // car, bike, any
	DistanceKm        float64     `json:"distance_km"`
	SuggestedFare     float64     `json:"suggested_fare"`
	Notes             string      `json:"notes"`
	IsDaily           bool        `json:"is_daily"`
	RecurringDays     string      `json:"recurring_days"`
	Status            string      `json:"status"` // open, accepted, completed, cancelled
	AcceptedDriverID  *string     `json:"accepted_driver_id,omitempty"`
	AcceptedDriver    *UserPublic `json:"accepted_driver,omitempty"`
	CreatedAt         time.Time   `json:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at"`
}

type CreatePassengerPostRequest struct {
	Origin            string   `json:"origin"`
	OriginLat         *float64 `json:"origin_lat,omitempty"`
	OriginLng         *float64 `json:"origin_lng,omitempty"`
	OriginPlaceID     string   `json:"origin_place_id,omitempty"`
	Destination       string   `json:"destination"`
	DestLat           *float64 `json:"dest_lat,omitempty"`
	DestLng           *float64 `json:"dest_lng,omitempty"`
	DestPlaceID       string   `json:"dest_place_id,omitempty"`
	City              string   `json:"city"`
	DepartureTime     string   `json:"departure_time"`
	SeatsNeeded       int      `json:"seats_needed"`
	VehiclePreference string   `json:"vehicle_preference"`
	DistanceKm        float64  `json:"distance_km"`
	SuggestedFare     float64  `json:"suggested_fare"`
	Notes             string   `json:"notes"`
	IsDaily           bool     `json:"is_daily"`
	RecurringDays     string   `json:"recurring_days"`
}
