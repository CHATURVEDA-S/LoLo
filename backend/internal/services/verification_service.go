package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/models"
)

type VerificationService struct{}

func NewVerificationService() *VerificationService {
	return &VerificationService{}
}

func (s *VerificationService) GetVerification(userID string) (*models.DriverVerification, error) {
	var v models.DriverVerification
	err := database.DB.QueryRow(`
		SELECT id, user_id, dl_number, dl_image_url, dl_status, dl_verified_at,
		       rc_number, rc_image_url, rc_status, rc_verified_at, vehicle_type,
		       vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate,
		       COALESCE(secondary_rc_number, ''), COALESCE(secondary_rc_image_url, ''),
		       COALESCE(secondary_rc_status, 'not_submitted'), COALESCE(secondary_vehicle_type, ''),
		       COALESCE(secondary_vehicle_make, ''), COALESCE(secondary_vehicle_model, ''),
		       COALESCE(secondary_vehicle_year, ''), COALESCE(secondary_vehicle_color, ''),
		       COALESCE(secondary_vehicle_plate, ''),
		       rejection_reason, created_at, updated_at
		FROM driver_verifications
		WHERE user_id = $1
	`, userID).Scan(
		&v.ID, &v.UserID, &v.DLNumber, &v.DLImageURL, &v.DLStatus, &v.DLVerifiedAt,
		&v.RCNumber, &v.RCImageURL, &v.RCStatus, &v.RCVerifiedAt, &v.VehicleType,
		&v.VehicleMake, &v.VehicleModel, &v.VehicleYear, &v.VehicleColor, &v.VehiclePlate,
		&v.SecondaryRCNumber, &v.SecondaryRCImageURL, &v.SecondaryRCStatus, &v.SecondaryVehicleType,
		&v.SecondaryVehicleMake, &v.SecondaryVehicleModel, &v.SecondaryVehicleYear,
		&v.SecondaryVehicleColor, &v.SecondaryVehiclePlate,
		&v.RejectionReason, &v.CreatedAt, &v.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if v.RCNumber == "" && (v.RCStatus == "pending" || v.RCStatus == "") {
		v.RCStatus = "not_submitted"
	}
	if v.DLNumber == "" && (v.DLStatus == "pending" || v.DLStatus == "") {
		v.DLStatus = "not_submitted"
	}
	return &v, nil
}

func (s *VerificationService) SubmitDL(userID string, req models.SubmitDLRequest) (*models.DriverVerification, error) {
	existing, err := s.GetVerification(userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()

	if existing == nil {
		// Create new record
		var v models.DriverVerification
		err = database.DB.QueryRow(`
			INSERT INTO driver_verifications (user_id, dl_number, dl_image_url, dl_status, rc_status, created_at, updated_at)
			VALUES ($1, $2, $3, 'pending', 'not_submitted', $4, $4)
			RETURNING id, user_id, dl_number, dl_image_url, dl_status, dl_verified_at,
			          rc_number, rc_image_url, rc_status, rc_verified_at, vehicle_type,
			          vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate,
			          rejection_reason, created_at, updated_at
		`, userID, req.DLNumber, req.DLImageURL, now).Scan(
			&v.ID, &v.UserID, &v.DLNumber, &v.DLImageURL, &v.DLStatus, &v.DLVerifiedAt,
			&v.RCNumber, &v.RCImageURL, &v.RCStatus, &v.RCVerifiedAt, &v.VehicleType,
			&v.VehicleMake, &v.VehicleModel, &v.VehicleYear, &v.VehicleColor, &v.VehiclePlate,
			&v.RejectionReason, &v.CreatedAt, &v.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Mock auto-verify in dev
		go s.mockVerifyDL(v.ID)

		return &v, nil
	}

	// Update existing
	_, err = database.DB.Exec(`
		UPDATE driver_verifications
		SET dl_number = $1,
		    dl_image_url = CASE WHEN $2 != '' THEN $2 ELSE dl_image_url END,
		    dl_status = 'pending',
		    updated_at = $3
		WHERE user_id = $4
	`, req.DLNumber, req.DLImageURL, now, userID)
	if err != nil {
		return nil, err
	}

	go s.mockVerifyDL(existing.ID)

	return s.GetVerification(userID)
}

func (s *VerificationService) SubmitRC(userID string, req models.SubmitRCRequest) (*models.DriverVerification, error) {
	existing, err := s.GetVerification(userID)
	if err != nil {
		return nil, err
	}

	vType := req.VehicleType
	if vType == "" {
		vType = "car"
	}

	now := time.Now()

	if existing == nil {
		var v models.DriverVerification
		err = database.DB.QueryRow(`
			INSERT INTO driver_verifications (user_id, rc_number, rc_image_url, rc_status, vehicle_type, vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, created_at, updated_at)
			VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $10)
			RETURNING id, user_id, dl_number, dl_image_url, dl_status, dl_verified_at,
			          rc_number, rc_image_url, rc_status, rc_verified_at, vehicle_type,
			          vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate,
			          rejection_reason, created_at, updated_at
		`, userID, req.RCNumber, req.RCImageURL, vType, req.VehicleMake, req.VehicleModel, req.VehicleYear, req.VehicleColor, req.VehiclePlate, now).Scan(
			&v.ID, &v.UserID, &v.DLNumber, &v.DLImageURL, &v.DLStatus, &v.DLVerifiedAt,
			&v.RCNumber, &v.RCImageURL, &v.RCStatus, &v.RCVerifiedAt, &v.VehicleType,
			&v.VehicleMake, &v.VehicleModel, &v.VehicleYear, &v.VehicleColor, &v.VehiclePlate,
			&v.RejectionReason, &v.CreatedAt, &v.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		go s.mockVerifyRC(v.ID)

		return &v, nil
	}

	// If existing primary vehicle is verified and different from requested type, store as secondary vehicle
	if existing.RCNumber != "" && existing.VehicleType != "" && existing.VehicleType != vType {
		_, err = database.DB.Exec(`
			UPDATE driver_verifications
			SET secondary_rc_number = $1,
			    secondary_rc_image_url = CASE WHEN $2 != '' THEN $2 ELSE secondary_rc_image_url END,
			    secondary_rc_status = 'pending',
			    secondary_vehicle_type = $3,
			    secondary_vehicle_make = $4,
			    secondary_vehicle_model = $5,
			    secondary_vehicle_year = $6,
			    secondary_vehicle_color = $7,
			    secondary_vehicle_plate = $8,
			    updated_at = $9
			WHERE user_id = $10
		`, req.RCNumber, req.RCImageURL, vType, req.VehicleMake, req.VehicleModel, req.VehicleYear, req.VehicleColor, req.VehiclePlate, now, userID)
		if err != nil {
			return nil, err
		}

		go s.mockVerifySecondaryRC(existing.ID)

		return s.GetVerification(userID)
	}

	_, err = database.DB.Exec(`
		UPDATE driver_verifications
		SET rc_number = $1,
		    rc_image_url = CASE WHEN $2 != '' THEN $2 ELSE rc_image_url END,
		    rc_status = 'pending',
		    vehicle_type = $3,
		    vehicle_make = $4,
		    vehicle_model = $5,
		    vehicle_year = $6,
		    vehicle_color = $7,
		    vehicle_plate = $8,
		    updated_at = $9
		WHERE user_id = $10
	`, req.RCNumber, req.RCImageURL, vType, req.VehicleMake, req.VehicleModel, req.VehicleYear, req.VehicleColor, req.VehiclePlate, now, userID)
	if err != nil {
		return nil, err
	}

	go s.mockVerifyRC(existing.ID)

	return s.GetVerification(userID)
}

// mockVerifyDL simulates government API verification with a 3-second delay
func (s *VerificationService) mockVerifyDL(verificationID string) {
	time.Sleep(3 * time.Second)

	now := time.Now()
	database.DB.Exec(`
		UPDATE driver_verifications
		SET dl_status = 'verified', dl_verified_at = $1, updated_at = $1
		WHERE id = $2
	`, now, verificationID)

	// Check if both DL and RC are verified, update user
	s.checkAndUpdateDriverStatus(verificationID)
}

func (s *VerificationService) mockVerifyRC(verificationID string) {
	time.Sleep(3 * time.Second)

	now := time.Now()
	database.DB.Exec(`
		UPDATE driver_verifications
		SET rc_status = 'verified', rc_verified_at = $1, updated_at = $1
		WHERE id = $2
	`, now, verificationID)

	s.checkAndUpdateDriverStatus(verificationID)
}

func (s *VerificationService) mockVerifySecondaryRC(verificationID string) {
	time.Sleep(3 * time.Second)

	now := time.Now()
	database.DB.Exec(`
		UPDATE driver_verifications
		SET secondary_rc_status = 'verified', updated_at = $1
		WHERE id = $2
	`, now, verificationID)

	s.checkAndUpdateDriverStatus(verificationID)
}

func (s *VerificationService) checkAndUpdateDriverStatus(verificationID string) {
	var userID string
	var dlStatus, rcStatus string
	err := database.DB.QueryRow(`
		SELECT user_id, dl_status, rc_status FROM driver_verifications WHERE id = $1
	`, verificationID).Scan(&userID, &dlStatus, &rcStatus)
	if err != nil {
		return
	}

	if dlStatus == "verified" && rcStatus == "verified" {
		database.DB.Exec(`
			UPDATE users SET is_verified_driver = true, is_driver = true, updated_at = NOW()
			WHERE id = $1
		`, userID)
		fmt.Printf("✅ Driver %s fully verified\n", userID)
	}
}
