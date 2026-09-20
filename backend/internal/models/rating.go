package models

import (
	"time"
)

type Rating struct {
	ID        string      `json:"id"`
	RideID    string      `json:"ride_id"`
	RaterID   string      `json:"rater_id"`
	RateeID   string      `json:"ratee_id"`
	Score     int         `json:"score"`
	Comment   string      `json:"comment"`
	CreatedAt time.Time   `json:"created_at"`
	Rater     *UserPublic `json:"rater,omitempty"`
}

type CreateRatingRequest struct {
	RideID  string `json:"ride_id"`
	RateeID string `json:"ratee_id"`
	Score   int    `json:"score"`
	Comment string `json:"comment"`
}

type ReviewDetail struct {
	ID          string    `json:"id"`
	RideID      string    `json:"ride_id"`
	RaterID     string    `json:"rater_id"`
	RaterName   string    `json:"rater_name"`
	RaterAvatar string    `json:"rater_avatar"`
	RateeID     string    `json:"ratee_id"`
	Score       int       `json:"score"`
	Comment     string    `json:"comment"`
	CreatedAt   time.Time `json:"created_at"`
	Origin      string    `json:"origin"`
	Destination string    `json:"destination"`
	RaterRole   string    `json:"rater_role"` // "Passenger" or "Driver"
}

type ProfileReviewsResponse struct {
	Reviews          []ReviewDetail `json:"reviews"`
	AvgRating        float64        `json:"avg_rating"`
	TotalReviews     int            `json:"total_reviews"`
	TotalRides       int            `json:"total_rides"`
	RidesAsDriver    int            `json:"rides_as_driver"`
	RidesAsPassenger int            `json:"rides_as_passenger"`
	ActiveRides      int            `json:"active_rides"`
	CompletedRides   int            `json:"completed_rides"`
}

