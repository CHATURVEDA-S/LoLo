package models

import (
	"time"
)

type RideCall struct {
	ID              string      `json:"id"`
	RideID          string      `json:"ride_id"`
	CallerID        string      `json:"caller_id"`
	ReceiverID      string      `json:"receiver_id"`
	Status          string      `json:"status"` // ringing, connected, ended, rejected, missed
	StartedAt       time.Time   `json:"started_at"`
	ConnectedAt     *time.Time  `json:"connected_at,omitempty"`
	EndedAt         *time.Time  `json:"ended_at,omitempty"`
	DurationSeconds int         `json:"duration_seconds"`
	CreatedAt       time.Time   `json:"created_at"`
	Caller          *UserPublic `json:"caller,omitempty"`
	Receiver        *UserPublic `json:"receiver,omitempty"`
}

type InitiateCallReq struct {
	ReceiverID string `json:"receiver_id,omitempty"`
}

type UpdateCallStatusReq struct {
	Status string `json:"status"` // connected, ended, rejected
}

type CallSignal struct {
	ID        string    `json:"id"`
	CallID    string    `json:"call_id"`
	SenderID  string    `json:"sender_id"`
	Type      string    `json:"type"` // offer, answer, candidate
	Payload   string    `json:"payload"`
	CreatedAt time.Time `json:"created_at"`
}

type SendSignalReq struct {
	Type    string `json:"type"`    // offer, answer, candidate
	Payload string `json:"payload"` // JSON string of SDP or candidate
}
