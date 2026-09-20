package models

import (
	"time"
)

type User struct {
	ID                    string    `json:"id"`
	Email                 string    `json:"email"`
	Phone                 string    `json:"phone"`
	PasswordHash          string    `json:"-"`
	FullName              string    `json:"full_name"`
	AvatarURL             string    `json:"avatar_url"`
	City                  string    `json:"city"`
	Bio                   string    `json:"bio"`
	Gender                string    `json:"gender"`
	EmergencyContactName  string    `json:"emergency_contact_name"`
	EmergencyContactPhone string    `json:"emergency_contact_phone"`
	IsDriver              bool      `json:"is_driver"`
	IsVerifiedDriver      bool      `json:"is_verified_driver"`
	AvgRating             float64   `json:"avg_rating"`
	TotalRides            int       `json:"total_rides"`
	PushToken             string    `json:"-"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type UserPublic struct {
	ID               string  `json:"id"`
	FullName         string  `json:"full_name"`
	AvatarURL        string  `json:"avatar_url"`
	City             string  `json:"city"`
	Bio              string  `json:"bio"`
	Gender           string  `json:"gender"`
	IsDriver         bool    `json:"is_driver"`
	IsVerifiedDriver bool    `json:"is_verified_driver"`
	AvgRating        float64 `json:"avg_rating"`
	TotalRides       int     `json:"total_rides"`
}

func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:               u.ID,
		FullName:         u.FullName,
		AvatarURL:        u.AvatarURL,
		City:             u.City,
		Bio:              u.Bio,
		Gender:           u.Gender,
		IsDriver:         u.IsDriver,
		IsVerifiedDriver: u.IsVerifiedDriver,
		AvgRating:        u.AvgRating,
		TotalRides:       u.TotalRides,
	}
}

type SignupRequest struct {
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	City     string `json:"city"`
}

type LoginRequest struct {
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

type UpdateProfileRequest struct {
	FullName              string `json:"full_name"`
	Phone                 string `json:"phone"`
	City                  string `json:"city"`
	AvatarURL             string `json:"avatar_url"`
	Bio                   string `json:"bio"`
	Gender                string `json:"gender"`
	EmergencyContactName  string `json:"emergency_contact_name"`
	EmergencyContactPhone string `json:"emergency_contact_phone"`
	IsDriver              bool   `json:"is_driver"`
}

type AuthResponse struct {
	Token     string `json:"token"`
	User      User   `json:"user"`
	IsNewUser bool   `json:"is_new_user,omitempty"`
}

type SendOTPRequest struct {
	Phone string `json:"phone"`
}

type SendOTPResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

type VerifyOTPRequest struct {
	Phone     string `json:"phone"`
	SessionID string `json:"session_id"`
	OTP       string `json:"otp"`
	FullName  string `json:"full_name,omitempty"`
	City      string `json:"city,omitempty"`
}
