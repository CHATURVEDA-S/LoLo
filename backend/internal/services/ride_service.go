package services

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/models"
)

type RideService struct {
	notificationService *NotificationService
}

func NewRideService(ns *NotificationService) *RideService {
	return &RideService{notificationService: ns}
}

func (s *RideService) CreateRide(driverID string, req models.CreateRideRequest) (*models.Ride, error) {
	departureTime, err := time.Parse(time.RFC3339, req.DepartureTime)
	if err != nil {
		return nil, fmt.Errorf("invalid departure_time format, use RFC3339")
	}

	if req.IsDaily && departureTime.Before(time.Now()) {
		departureTime = departureTime.AddDate(0, 0, 1)
	} else if !req.IsDaily && departureTime.Before(time.Now()) {
		return nil, fmt.Errorf("departure time must be in the future")
	}

	vType := req.VehicleType
	if vType == "" {
		vType = "car"
	}

	if vType == "bike" && (req.SeatsTotal < 1 || req.SeatsTotal > 2) {
		return nil, fmt.Errorf("bike seats must be 1 or 2")
	} else if vType != "bike" && (req.SeatsTotal < 1 || req.SeatsTotal > 8) {
		return nil, fmt.Errorf("seats must be between 1 and 8")
	}

	if req.PricePerSeat < 0 {
		return nil, fmt.Errorf("price must be non-negative")
	}

	// Get driver's city
	var city string
	err = database.DB.QueryRow(`SELECT city FROM users WHERE id = $1`, driverID).Scan(&city)
	if err != nil {
		return nil, fmt.Errorf("could not find driver")
	}

	var ride models.Ride
	err = database.DB.QueryRow(`
		INSERT INTO rides (driver_id, origin, origin_lat, origin_lng, origin_place_id,
		                   destination, dest_lat, dest_lng, dest_place_id,
		                   city, departure_time, seats_total, seats_available,
		                   price_per_seat, vehicle_type, vehicle_info, notes, is_daily, recurring_days)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14, $15, $16, $17, $18)
		RETURNING id, driver_id, origin, origin_lat, origin_lng, origin_place_id,
		          destination, dest_lat, dest_lng, dest_place_id,
		          city, departure_time, seats_total, seats_available,
		          price_per_seat, vehicle_type, vehicle_info, notes, is_daily, recurring_days, status, created_at, updated_at
	`, driverID, req.Origin, req.OriginLat, req.OriginLng, req.OriginPlaceID,
		req.Destination, req.DestLat, req.DestLng, req.DestPlaceID,
		city, departureTime, req.SeatsTotal, req.PricePerSeat, vType, req.VehicleInfo, req.Notes,
		req.IsDaily, req.RecurringDays,
	).Scan(
		&ride.ID, &ride.DriverID, &ride.Origin, &ride.OriginLat, &ride.OriginLng, &ride.OriginPlaceID,
		&ride.Destination, &ride.DestLat, &ride.DestLng, &ride.DestPlaceID,
		&ride.City, &ride.DepartureTime, &ride.SeatsTotal, &ride.SeatsAvailable,
		&ride.PricePerSeat, &ride.VehicleType, &ride.VehicleInfo, &ride.Notes,
		&ride.IsDaily, &ride.RecurringDays, &ride.Status, &ride.CreatedAt, &ride.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &ride, nil
}

func (s *RideService) GetRide(rideID string) (*models.Ride, error) {
	var ride models.Ride
	var driver models.UserPublic

	err := database.DB.QueryRow(`
		SELECT r.id, r.driver_id, r.origin, r.origin_lat, r.origin_lng, r.origin_place_id,
		       r.destination, r.dest_lat, r.dest_lng, r.dest_place_id,
		       r.city, r.departure_time, r.seats_total, r.seats_available,
		       r.price_per_seat, r.vehicle_type, r.vehicle_info, r.notes, r.is_daily, r.recurring_days, r.status, r.created_at, r.updated_at,
		       r.driver_live_lat, r.driver_live_lng,
		       u.id, u.full_name, u.avatar_url, u.city, u.is_driver, u.is_verified_driver, u.avg_rating, u.total_rides
		FROM rides r
		JOIN users u ON r.driver_id = u.id
		WHERE r.id = $1
	`, rideID).Scan(
		&ride.ID, &ride.DriverID, &ride.Origin, &ride.OriginLat, &ride.OriginLng, &ride.OriginPlaceID,
		&ride.Destination, &ride.DestLat, &ride.DestLng, &ride.DestPlaceID,
		&ride.City, &ride.DepartureTime, &ride.SeatsTotal, &ride.SeatsAvailable,
		&ride.PricePerSeat, &ride.VehicleType, &ride.VehicleInfo, &ride.Notes,
		&ride.IsDaily, &ride.RecurringDays, &ride.Status, &ride.CreatedAt, &ride.UpdatedAt,
		&ride.DriverLiveLat, &ride.DriverLiveLng,
		&driver.ID, &driver.FullName, &driver.AvatarURL, &driver.City, &driver.IsDriver, &driver.IsVerifiedDriver, &driver.AvgRating, &driver.TotalRides,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	ride.Driver = &driver
	return &ride, nil
}

func (s *RideService) SearchRides(city, origin, destination, vehicleType string) ([]models.Ride, error) {
	query := `
		SELECT r.id, r.driver_id, r.origin, r.origin_lat, r.origin_lng, r.origin_place_id,
		       r.destination, r.dest_lat, r.dest_lng, r.dest_place_id,
		       r.city, r.departure_time, r.seats_total, r.seats_available,
		       r.price_per_seat, r.vehicle_type, r.vehicle_info, r.notes, r.is_daily, r.recurring_days, r.status, r.created_at, r.updated_at,
		       r.driver_live_lat, r.driver_live_lng,
		       u.id, u.full_name, u.avatar_url, u.city, u.is_driver, u.is_verified_driver, u.avg_rating, u.total_rides
		FROM rides r
		JOIN users u ON r.driver_id = u.id
		WHERE r.status = 'open'
		  AND r.seats_available > 0
		  AND (r.departure_time >= NOW() OR r.is_daily = TRUE)
	`

	args := []interface{}{}
	argIdx := 1

	if city != "" {
		query += fmt.Sprintf(" AND r.city = $%d", argIdx)
		args = append(args, city)
		argIdx++
	}

	if origin != "" {
		query += fmt.Sprintf(" AND LOWER(r.origin) LIKE $%d", argIdx)
		args = append(args, "%"+strings.ToLower(origin)+"%")
		argIdx++
	}

	if destination != "" {
		query += fmt.Sprintf(" AND LOWER(r.destination) LIKE $%d", argIdx)
		args = append(args, "%"+strings.ToLower(destination)+"%")
		argIdx++
	}

	if vehicleType != "" {
		query += fmt.Sprintf(" AND r.vehicle_type = $%d", argIdx)
		args = append(args, vehicleType)
		argIdx++
	}

	query += " ORDER BY r.departure_time ASC LIMIT 50"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rides []models.Ride
	for rows.Next() {
		var ride models.Ride
		var driver models.UserPublic
		err := rows.Scan(
			&ride.ID, &ride.DriverID, &ride.Origin, &ride.OriginLat, &ride.OriginLng, &ride.OriginPlaceID,
			&ride.Destination, &ride.DestLat, &ride.DestLng, &ride.DestPlaceID,
			&ride.City, &ride.DepartureTime, &ride.SeatsTotal, &ride.SeatsAvailable,
			&ride.PricePerSeat, &ride.VehicleType, &ride.VehicleInfo, &ride.Notes,
			&ride.IsDaily, &ride.RecurringDays, &ride.Status, &ride.CreatedAt, &ride.UpdatedAt,
			&ride.DriverLiveLat, &ride.DriverLiveLng,
			&driver.ID, &driver.FullName, &driver.AvatarURL, &driver.City, &driver.IsDriver, &driver.IsVerifiedDriver, &driver.AvgRating, &driver.TotalRides,
		)
		if err != nil {
			return nil, err
		}
		ride.Driver = &driver
		rides = append(rides, ride)
	}

	return rides, nil
}

func (s *RideService) UpdateDriverLocation(rideID, driverID string, lat, lng float64) error {
	_, err := database.DB.Exec(`
		UPDATE rides SET driver_live_lat = $1, driver_live_lng = $2, updated_at = NOW()
		WHERE id = $3 AND driver_id = $4
	`, lat, lng, rideID, driverID)
	return err
}

func (s *RideService) UpdateRideStatus(rideID, driverID, newStatus string) error {
	validStatuses := map[string]bool{
		"open": true, "confirmed": true, "in_progress": true, "completed": true, "cancelled": true,
	}
	if !validStatuses[newStatus] {
		return fmt.Errorf("invalid status: %s", newStatus)
	}

	result, err := database.DB.Exec(`
		UPDATE rides SET status = $1, updated_at = NOW()
		WHERE id = $2 AND driver_id = $3
	`, newStatus, rideID, driverID)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("ride not found or you are not the driver")
	}

	// Send notifications based on status change
	if newStatus == "in_progress" || newStatus == "completed" || newStatus == "cancelled" {
		go s.notifyPassengersStatusChange(rideID, driverID, newStatus)
	}

	// If completed or cancelled, terminate any active in-app calls immediately
	if newStatus == "completed" || newStatus == "cancelled" {
		database.DB.Exec(`
			UPDATE ride_calls SET status = 'ended', ended_at = NOW()
			WHERE ride_id = $1 AND status IN ('ringing', 'connected')
		`, rideID)
	}

	// If cancelled, mark any active requests as cancelled
	if newStatus == "cancelled" {
		_, _ = database.DB.Exec(`
			UPDATE ride_requests SET status = 'cancelled', updated_at = NOW()
			WHERE ride_id = $1 AND status IN ('pending', 'accepted')
		`, rideID)
	}

	// If completed, create payment records for accepted passengers and sync total_rides
	if newStatus == "completed" {
		go s.createPaymentRecords(rideID)
		go s.syncTotalRidesForRide(rideID, driverID)
	}

	return nil
}

func (s *RideService) notifyPassengersStatusChange(rideID, driverID, status string) {
	var driverName string
	database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, driverID).Scan(&driverName)

	statusFilter := "status = 'accepted'"
	if status == "cancelled" {
		statusFilter = "status IN ('accepted', 'pending')"
	}

	rows, _ := database.DB.Query(fmt.Sprintf(`
		SELECT passenger_id, seats_requested FROM ride_requests
		WHERE ride_id = $1 AND %s
	`, statusFilter), rideID)
	if rows == nil {
		return
	}
	defer rows.Close()

	var pricePerSeat float64
	database.DB.QueryRow(`SELECT price_per_seat FROM rides WHERE id = $1`, rideID).Scan(&pricePerSeat)

	for rows.Next() {
		var passengerID string
		var seatsRequested int
		rows.Scan(&passengerID, &seatsRequested)

		if status == "in_progress" {
			s.notificationService.NotifyRideStarted(passengerID, driverName, rideID)
		} else if status == "completed" {
			amount := pricePerSeat * float64(seatsRequested)
			s.notificationService.NotifyRideCompleted(passengerID, driverName, amount, rideID)
		} else if status == "cancelled" {
			s.notificationService.NotifyRideCancelled(passengerID, driverName, rideID)
		}
	}
}

func (s *RideService) createPaymentRecords(rideID string) {
	var driverID string
	var pricePerSeat float64
	database.DB.QueryRow(`SELECT driver_id, price_per_seat FROM rides WHERE id = $1`, rideID).Scan(&driverID, &pricePerSeat)

	rows, _ := database.DB.Query(`
		SELECT passenger_id, seats_requested FROM ride_requests
		WHERE ride_id = $1 AND status = 'accepted'
	`, rideID)
	if rows == nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var passengerID string
		var seatsRequested int
		rows.Scan(&passengerID, &seatsRequested)

		amount := pricePerSeat * float64(seatsRequested)
		database.DB.Exec(`
			INSERT INTO payment_records (ride_id, passenger_id, driver_id, amount)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (ride_id, passenger_id) DO NOTHING
		`, rideID, passengerID, driverID, amount)
	}
}

// Ride request methods

func (s *RideService) CreateRideRequest(rideID, passengerID string, req models.CreateRideRequestReq) (*models.RideRequest, error) {
	// Verify ride exists and is open
	ride, err := s.GetRide(rideID)
	if err != nil || ride == nil {
		return nil, fmt.Errorf("ride not found")
	}
	if ride.Status != "open" {
		return nil, fmt.Errorf("ride is not open for requests")
	}
	if ride.DriverID == passengerID {
		return nil, fmt.Errorf("you cannot request your own ride")
	}
	if req.SeatsRequested > ride.SeatsAvailable {
		return nil, fmt.Errorf("not enough seats available")
	}
	if req.SeatsRequested < 1 {
		req.SeatsRequested = 1
	}

	var rr models.RideRequest
	err = database.DB.QueryRow(`
		INSERT INTO ride_requests (ride_id, passenger_id, seats_requested, pickup_point, pickup_lat, pickup_lng)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, ride_id, passenger_id, seats_requested, status, pickup_point, pickup_lat, pickup_lng, created_at, updated_at
	`, rideID, passengerID, req.SeatsRequested, req.PickupPoint, req.PickupLat, req.PickupLng).Scan(
		&rr.ID, &rr.RideID, &rr.PassengerID, &rr.SeatsRequested, &rr.Status,
		&rr.PickupPoint, &rr.PickupLat, &rr.PickupLng, &rr.CreatedAt, &rr.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Notify driver
	var passengerName string
	database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, passengerID).Scan(&passengerName)
	s.notificationService.NotifyRideRequest(ride.DriverID, passengerName, rideID)

	return &rr, nil
}

func (s *RideService) UpdateRequestStatus(requestID, driverID, newStatus string) error {
	if newStatus != "accepted" && newStatus != "rejected" {
		return fmt.Errorf("status must be 'accepted' or 'rejected'")
	}

	// Verify the driver owns the ride
	var rideID, passengerID string
	var seatsRequested int
	err := database.DB.QueryRow(`
		SELECT rr.ride_id, rr.passenger_id, rr.seats_requested
		FROM ride_requests rr
		JOIN rides r ON rr.ride_id = r.id
		WHERE rr.id = $1 AND r.driver_id = $2
	`, requestID, driverID).Scan(&rideID, &passengerID, &seatsRequested)
	if err != nil {
		return fmt.Errorf("request not found or you are not the driver")
	}

	_, err = database.DB.Exec(`
		UPDATE ride_requests SET status = $1, updated_at = NOW()
		WHERE id = $2
	`, newStatus, requestID)
	if err != nil {
		return err
	}

	var driverName string
	database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, driverID).Scan(&driverName)

	if newStatus == "accepted" {
		// Decrement available seats
		database.DB.Exec(`
			UPDATE rides SET seats_available = GREATEST(0, seats_available - $1), updated_at = NOW()
			WHERE id = $2
		`, seatsRequested, rideID)

		s.notificationService.NotifyRequestAccepted(passengerID, driverName, rideID)
	} else {
		s.notificationService.NotifyRequestRejected(passengerID, driverName, rideID)
	}

	return nil
}

func (s *RideService) GetRideRequests(rideID string) ([]models.RideRequest, error) {
	rows, err := database.DB.Query(`
		SELECT rr.id, rr.ride_id, rr.passenger_id, rr.seats_requested, rr.status,
		       rr.pickup_point, rr.pickup_lat, rr.pickup_lng, rr.created_at, rr.updated_at,
		       u.id, u.full_name, u.avatar_url, u.city, u.is_driver, u.is_verified_driver, u.avg_rating, u.total_rides
		FROM ride_requests rr
		JOIN users u ON rr.passenger_id = u.id
		WHERE rr.ride_id = $1
		ORDER BY rr.created_at ASC
	`, rideID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.RideRequest
	for rows.Next() {
		var rr models.RideRequest
		var passenger models.UserPublic
		err := rows.Scan(
			&rr.ID, &rr.RideID, &rr.PassengerID, &rr.SeatsRequested, &rr.Status,
			&rr.PickupPoint, &rr.PickupLat, &rr.PickupLng, &rr.CreatedAt, &rr.UpdatedAt,
			&passenger.ID, &passenger.FullName, &passenger.AvatarURL, &passenger.City,
			&passenger.IsDriver, &passenger.IsVerifiedDriver, &passenger.AvgRating, &passenger.TotalRides,
		)
		if err != nil {
			return nil, err
		}
		rr.Passenger = &passenger
		requests = append(requests, rr)
	}

	return requests, nil
}

func (s *RideService) GetMyRequest(rideID, passengerID string) (*models.RideRequest, error) {
	var rr models.RideRequest
	err := database.DB.QueryRow(`
		SELECT id, ride_id, passenger_id, seats_requested, status,
		       pickup_point, pickup_lat, pickup_lng, created_at, updated_at
		FROM ride_requests
		WHERE ride_id = $1 AND passenger_id = $2
	`, rideID, passengerID).Scan(
		&rr.ID, &rr.RideID, &rr.PassengerID, &rr.SeatsRequested, &rr.Status,
		&rr.PickupPoint, &rr.PickupLat, &rr.PickupLng, &rr.CreatedAt, &rr.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rr, nil
}

func (s *RideService) DeleteRequest(requestID, passengerID string) error {
	var rideID, status string
	var seatsRequested int
	err := database.DB.QueryRow(`
		SELECT ride_id, status, seats_requested FROM ride_requests WHERE id = $1 AND passenger_id = $2
	`, requestID, passengerID).Scan(&rideID, &status, &seatsRequested)
	if err == nil && status == "accepted" {
		database.DB.Exec(`
			UPDATE rides SET seats_available = seats_available + $1, updated_at = NOW() WHERE id = $2
		`, seatsRequested, rideID)
	}

	_, err = database.DB.Exec(`
		DELETE FROM ride_requests WHERE id = $1 AND passenger_id = $2
	`, requestID, passengerID)
	return err
}

func (s *RideService) GetUserTrips(userID string) ([]map[string]interface{}, error) {
	// Driver rides
	driverRides, err := s.getDriverRides(userID)
	if err != nil {
		return nil, err
	}

	// Passenger rides
	passengerRides, err := s.getPassengerRides(userID)
	if err != nil {
		return nil, err
	}

	trips := append(driverRides, passengerRides...)
	return trips, nil
}

func (s *RideService) getDriverRides(userID string) ([]map[string]interface{}, error) {
	rows, err := database.DB.Query(`
		SELECT r.id, r.origin, r.destination, r.city, r.departure_time,
		       r.seats_total, r.seats_available, r.price_per_seat, r.vehicle_type, r.vehicle_info,
		       r.is_daily, r.recurring_days, r.status, r.created_at
		FROM rides r
		WHERE r.driver_id = $1
		ORDER BY r.departure_time DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trips []map[string]interface{}
	for rows.Next() {
		var id, origin, dest, city, vehicleType, vehicleInfo, recurringDays, status string
		var departureTime, createdAt time.Time
		var seatsTotal, seatsAvailable int
		var pricePerSeat float64
		var isDaily bool

		rows.Scan(&id, &origin, &dest, &city, &departureTime,
			&seatsTotal, &seatsAvailable, &pricePerSeat, &vehicleType, &vehicleInfo,
			&isDaily, &recurringDays, &status, &createdAt)

		trips = append(trips, map[string]interface{}{
			"ride": map[string]interface{}{
				"id": id, "origin": origin, "destination": dest, "city": city,
				"departure_time": departureTime, "seats_total": seatsTotal,
				"seats_available": seatsAvailable, "price_per_seat": pricePerSeat,
				"vehicle_type": vehicleType, "vehicle_info": vehicleInfo,
				"is_daily": isDaily, "recurring_days": recurringDays,
				"status": status, "created_at": createdAt,
			},
			"role": "driver",
		})
	}
	return trips, nil
}

func (s *RideService) getPassengerRides(userID string) ([]map[string]interface{}, error) {
	rows, err := database.DB.Query(`
		SELECT r.id, r.origin, r.destination, r.city, r.departure_time,
		       r.seats_total, r.seats_available, r.price_per_seat, r.vehicle_type, r.vehicle_info,
		       r.is_daily, r.recurring_days, r.status, r.created_at,
		       rr.status as request_status,
		       u.full_name as driver_name
		FROM ride_requests rr
		JOIN rides r ON rr.ride_id = r.id
		JOIN users u ON r.driver_id = u.id
		WHERE rr.passenger_id = $1
		ORDER BY r.departure_time DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trips []map[string]interface{}
	for rows.Next() {
		var id, origin, dest, city, vehicleType, vehicleInfo, recurringDays, status, reqStatus, driverName string
		var departureTime, createdAt time.Time
		var seatsTotal, seatsAvailable int
		var pricePerSeat float64
		var isDaily bool

		rows.Scan(&id, &origin, &dest, &city, &departureTime,
			&seatsTotal, &seatsAvailable, &pricePerSeat, &vehicleType, &vehicleInfo,
			&isDaily, &recurringDays, &status, &createdAt,
			&reqStatus, &driverName)

		trips = append(trips, map[string]interface{}{
			"ride": map[string]interface{}{
				"id": id, "origin": origin, "destination": dest, "city": city,
				"departure_time": departureTime, "seats_total": seatsTotal,
				"seats_available": seatsAvailable, "price_per_seat": pricePerSeat,
				"vehicle_type": vehicleType, "vehicle_info": vehicleInfo,
				"is_daily": isDaily, "recurring_days": recurringDays,
				"status": status, "created_at": createdAt,
				"driver_name": driverName,
			},
			"role":           "passenger",
			"request_status": reqStatus,
		})
	}
	return trips, nil
}

// Payment methods

func (s *RideService) ConfirmPayment(rideID, driverID string, req models.ConfirmPaymentRequest) error {
	// Verify driver owns the ride
	var exists bool
	err := database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2)`, rideID, driverID).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("ride not found or you are not the driver")
	}

	now := time.Now()
	result, err := database.DB.Exec(`
		UPDATE payment_records
		SET status = 'paid', payment_method = $1, paid_at = $2, confirmed_by_driver = true, updated_at = $2
		WHERE ride_id = $3 AND passenger_id = $4
	`, req.PaymentMethod, now, rideID, req.PassengerID)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("payment record not found")
	}

	// Notify passenger
	var passengerName string
	database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, req.PassengerID).Scan(&passengerName)
	var amount float64
	database.DB.QueryRow(`SELECT amount FROM payment_records WHERE ride_id = $1 AND passenger_id = $2`, rideID, req.PassengerID).Scan(&amount)
	s.notificationService.NotifyPaymentReceived(driverID, passengerName, amount, rideID)

	return nil
}

func (s *RideService) GetPaymentRecords(rideID string) ([]models.PaymentRecord, error) {
	rows, err := database.DB.Query(`
		SELECT id, ride_id, passenger_id, driver_id, amount, payment_method, status, paid_at, confirmed_by_driver, created_at, updated_at
		FROM payment_records
		WHERE ride_id = $1
		ORDER BY created_at ASC
	`, rideID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []models.PaymentRecord
	for rows.Next() {
		var pr models.PaymentRecord
		rows.Scan(&pr.ID, &pr.RideID, &pr.PassengerID, &pr.DriverID, &pr.Amount,
			&pr.PaymentMethod, &pr.Status, &pr.PaidAt, &pr.ConfirmedByDriver, &pr.CreatedAt, &pr.UpdatedAt)
		records = append(records, pr)
	}
	return records, nil
}

// Rating methods

func (s *RideService) CreateRating(raterID string, req models.CreateRatingRequest) (*models.Rating, error) {
	if req.Score < 1 || req.Score > 5 {
		return nil, fmt.Errorf("score must be between 1 and 5")
	}

	var rating models.Rating
	err := database.DB.QueryRow(`
		INSERT INTO ratings (ride_id, rater_id, ratee_id, score, comment)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, ride_id, rater_id, ratee_id, score, comment, created_at
	`, req.RideID, raterID, req.RateeID, req.Score, req.Comment).Scan(
		&rating.ID, &rating.RideID, &rating.RaterID, &rating.RateeID,
		&rating.Score, &rating.Comment, &rating.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Update average rating for the ratee
	go func() {
		database.DB.Exec(`
			UPDATE users SET avg_rating = (
				SELECT COALESCE(AVG(score), 0)::numeric(3,2) FROM ratings WHERE ratee_id = $1
			), updated_at = NOW()
			WHERE id = $1
		`, req.RateeID)
	}()

	return &rating, nil
}

func (s *RideService) GetRating(rideID, raterID string) (*models.Rating, error) {
	var rating models.Rating
	err := database.DB.QueryRow(`
		SELECT id, ride_id, rater_id, ratee_id, score, comment, created_at
		FROM ratings
		WHERE ride_id = $1 AND rater_id = $2
	`, rideID, raterID).Scan(
		&rating.ID, &rating.RideID, &rating.RaterID, &rating.RateeID,
		&rating.Score, &rating.Comment, &rating.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rating, nil
}

func (s *RideService) syncTotalRidesForRide(rideID, driverID string) {
	// Sync driver total_rides
	database.DB.Exec(`
		UPDATE users SET total_rides = (
			(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status = 'completed') +
			(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status = 'completed')
		), updated_at = NOW() WHERE id = $1
	`, driverID)

	// Sync passengers total_rides
	rows, err := database.DB.Query(`
		SELECT passenger_id FROM ride_requests WHERE ride_id = $1 AND status = 'accepted'
	`, rideID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var pid string
		if err := rows.Scan(&pid); err == nil {
			database.DB.Exec(`
				UPDATE users SET total_rides = (
					(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status = 'completed') +
					(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status = 'completed')
				), updated_at = NOW() WHERE id = $1
			`, pid)
		}
	}
}

func (s *RideService) GetReviewsForUser(userID string) (*models.ProfileReviewsResponse, error) {
	resp := &models.ProfileReviewsResponse{
		Reviews: []models.ReviewDetail{},
	}

	// Compute ride stats dynamically
	_ = database.DB.QueryRow(`
		SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status != 'cancelled'
	`, userID).Scan(&resp.RidesAsDriver)

	_ = database.DB.QueryRow(`
		SELECT COUNT(*) FROM ride_requests rr
		JOIN rides r ON rr.ride_id = r.id
		WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status != 'cancelled'
	`, userID).Scan(&resp.RidesAsPassenger)

	resp.TotalRides = resp.RidesAsDriver + resp.RidesAsPassenger

	_ = database.DB.QueryRow(`
		SELECT (
			(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status IN ('open', 'active', 'in_progress')) +
			(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status IN ('open', 'active', 'in_progress'))
		)
	`, userID).Scan(&resp.ActiveRides)

	_ = database.DB.QueryRow(`
		SELECT (
			(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status = 'completed') +
			(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status = 'completed')
		)
	`, userID).Scan(&resp.CompletedRides)

	// Compute average rating and total reviews
	_ = database.DB.QueryRow(`
		SELECT COALESCE(AVG(score), 0.0)::numeric(3,2), COUNT(*)
		FROM ratings WHERE ratee_id = $1
	`, userID).Scan(&resp.AvgRating, &resp.TotalReviews)

	// Keep user row synchronized with latest cached stats
	go func() {
		database.DB.Exec(`
			UPDATE users SET total_rides = $1, avg_rating = $2, updated_at = NOW() WHERE id = $3
		`, resp.TotalRides, resp.AvgRating, userID)
	}()

	// Fetch detailed reviews
	rows, err := database.DB.Query(`
		SELECT 
			r.id,
			r.ride_id,
			r.rater_id,
			u.full_name,
			COALESCE(u.avatar_url, ''),
			r.ratee_id,
			r.score,
			COALESCE(r.comment, ''),
			r.created_at,
			rd.origin,
			rd.destination,
			CASE WHEN rd.driver_id = r.rater_id THEN 'Driver' ELSE 'Passenger' END AS rater_role
		FROM ratings r
		JOIN users u ON u.id = r.rater_id
		JOIN rides rd ON rd.id = r.ride_id
		WHERE r.ratee_id = $1
		ORDER BY r.created_at DESC
	`, userID)
	if err != nil {
		return resp, nil
	}
	defer rows.Close()

	for rows.Next() {
		var rev models.ReviewDetail
		if err := rows.Scan(
			&rev.ID,
			&rev.RideID,
			&rev.RaterID,
			&rev.RaterName,
			&rev.RaterAvatar,
			&rev.RateeID,
			&rev.Score,
			&rev.Comment,
			&rev.CreatedAt,
			&rev.Origin,
			&rev.Destination,
			&rev.RaterRole,
		); err == nil {
			resp.Reviews = append(resp.Reviews, rev)
		}
	}

	return resp, nil
}


func (s *RideService) SendChatMessage(rideID, senderID, content string) (*models.ChatMessage, error) {
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("message content cannot be empty")
	}

	ride, err := s.GetRide(rideID)
	if err != nil || ride == nil {
		// Check if it's a passenger post (drop request)
		var post models.PassengerPost
		var acceptedDriverID sql.NullString
		pErr := database.DB.QueryRow(`
			SELECT id, passenger_id, accepted_driver_id, status
			FROM passenger_posts WHERE id = $1
		`, rideID).Scan(&post.ID, &post.PassengerID, &acceptedDriverID, &post.Status)
		if pErr != nil {
			return nil, fmt.Errorf("ride or drop request not found")
		}
		if post.Status == "completed" || post.Status == "cancelled" {
			return nil, fmt.Errorf("drop request is completed. In-app chat is closed to protect user privacy")
		}
		driverID := ""
		if acceptedDriverID.Valid {
			driverID = acceptedDriverID.String
		}
		isParticipant := (senderID == post.PassengerID || (driverID != "" && senderID == driverID))
		if !isParticipant {
			return nil, fmt.Errorf("forbidden: you are not a participant in this drop request")
		}

		var msg models.ChatMessage
		err = database.DB.QueryRow(`
			INSERT INTO ride_messages (ride_id, sender_id, content)
			VALUES ($1, $2, $3)
			RETURNING id, ride_id, sender_id, content, created_at
		`, rideID, senderID, content).Scan(&msg.ID, &msg.RideID, &msg.SenderID, &msg.Content, &msg.CreatedAt)
		if err != nil {
			return nil, err
		}

		var sender models.UserPublic
		database.DB.QueryRow(`
			SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
			FROM users WHERE id = $1
		`, senderID).Scan(&sender.ID, &sender.FullName, &sender.AvatarURL, &sender.City, &sender.IsDriver, &sender.IsVerifiedDriver, &sender.AvgRating, &sender.TotalRides)
		msg.Sender = &sender

		// Notify recipient
		if senderID == driverID && post.PassengerID != "" {
			s.notificationService.NotifyChatMessage(post.PassengerID, sender.FullName, content, rideID)
		} else if senderID == post.PassengerID && driverID != "" {
			s.notificationService.NotifyChatMessage(driverID, sender.FullName, content, rideID)
		}
		return &msg, nil
	}

	// Strictly block chat if ride is completed or cancelled
	if ride.Status == "completed" || ride.Status == "cancelled" {
		return nil, fmt.Errorf("ride is completed. In-app chat is closed to protect user privacy")
	}

	// Verify that sender is a valid participant (driver or accepted/pending passenger)
	isParticipant := (senderID == ride.DriverID)
	if !isParticipant {
		var reqCount int
		_ = database.DB.QueryRow(`
			SELECT COUNT(*) FROM ride_requests 
			WHERE ride_id = $1 AND passenger_id = $2 AND status IN ('accepted', 'pending')
		`, rideID, senderID).Scan(&reqCount)
		if reqCount > 0 {
			isParticipant = true
		}
	}
	if !isParticipant {
		return nil, fmt.Errorf("forbidden: you are not a participant in this ride")
	}

	var msg models.ChatMessage
	err = database.DB.QueryRow(`
		INSERT INTO ride_messages (ride_id, sender_id, content)
		VALUES ($1, $2, $3)
		RETURNING id, ride_id, sender_id, content, created_at
	`, rideID, senderID, content).Scan(&msg.ID, &msg.RideID, &msg.SenderID, &msg.Content, &msg.CreatedAt)
	if err != nil {
		return nil, err
	}

	var sender models.UserPublic
	database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, senderID).Scan(&sender.ID, &sender.FullName, &sender.AvatarURL, &sender.City, &sender.IsDriver, &sender.IsVerifiedDriver, &sender.AvgRating, &sender.TotalRides)
	msg.Sender = &sender

	// Notify recipient
	if senderID == ride.DriverID {
		// Notify passengers (both accepted and pending requests)
		rows, err := database.DB.Query(`
			SELECT passenger_id FROM ride_requests
			WHERE ride_id = $1 AND status IN ('accepted', 'pending')
		`, rideID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var pID string
				if rows.Scan(&pID) == nil {
					s.notificationService.NotifyChatMessage(pID, sender.FullName, content, rideID)
				}
			}
		}
	} else {
		// Notify driver
		s.notificationService.NotifyChatMessage(ride.DriverID, sender.FullName, content, rideID)
	}

	return &msg, nil
}

func (s *RideService) GetChatMessages(rideID, userID string) ([]models.ChatMessage, error) {
	ride, err := s.GetRide(rideID)
	if err != nil || ride == nil {
		// Check passenger post
		var post models.PassengerPost
		var acceptedDriverID sql.NullString
		pErr := database.DB.QueryRow(`
			SELECT id, passenger_id, accepted_driver_id
			FROM passenger_posts WHERE id = $1
		`, rideID).Scan(&post.ID, &post.PassengerID, &acceptedDriverID)
		if pErr != nil {
			return nil, fmt.Errorf("ride or drop request not found")
		}
		driverID := ""
		if acceptedDriverID.Valid {
			driverID = acceptedDriverID.String
		}
		if userID != post.PassengerID && (driverID == "" || userID != driverID) {
			return nil, fmt.Errorf("forbidden: you are not a participant in this drop request")
		}
	} else {
		// Verify that requester is a participant (driver or passenger)
		isParticipant := (userID == ride.DriverID)
		if !isParticipant {
			var reqCount int
			_ = database.DB.QueryRow(`
				SELECT COUNT(*) FROM ride_requests 
				WHERE ride_id = $1 AND passenger_id = $2
			`, rideID, userID).Scan(&reqCount)
			if reqCount > 0 {
				isParticipant = true
			}
		}
		if !isParticipant {
			return nil, fmt.Errorf("forbidden: you are not a participant in this ride")
		}
	}

	rows, err := database.DB.Query(`
		SELECT m.id, m.ride_id, m.sender_id, m.content, m.created_at,
		       u.id, u.full_name, COALESCE(u.avatar_url, ''), COALESCE(u.city, ''), u.is_driver, u.is_verified_driver, COALESCE(u.avg_rating, 5.0), COALESCE(u.total_rides, 0)
		FROM ride_messages m
		JOIN users u ON m.sender_id = u.id
		WHERE m.ride_id = $1
		ORDER BY m.created_at ASC
	`, rideID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.ChatMessage
	for rows.Next() {
		var msg models.ChatMessage
		var sender models.UserPublic
		err := rows.Scan(
			&msg.ID, &msg.RideID, &msg.SenderID, &msg.Content, &msg.CreatedAt,
			&sender.ID, &sender.FullName, &sender.AvatarURL, &sender.City, &sender.IsDriver, &sender.IsVerifiedDriver, &sender.AvgRating, &sender.TotalRides,
		)
		if err != nil {
			return nil, err
		}
		msg.Sender = &sender
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []models.ChatMessage{}
	}

	return messages, nil
}

// In-App Calling (Rider <-> Passenger Only, Strictly Isolated and Closed Post-Ride)

func (s *RideService) InitiateRideCall(rideID, callerID, targetReceiverID string) (*models.RideCall, error) {
	var receiverID string
	ride, err := s.GetRide(rideID)
	if err != nil || ride == nil {
		// Check if it's a passenger post (drop request)
		var post models.PassengerPost
		var acceptedDriverID sql.NullString
		pErr := database.DB.QueryRow(`
			SELECT id, passenger_id, accepted_driver_id, status
			FROM passenger_posts WHERE id = $1
		`, rideID).Scan(&post.ID, &post.PassengerID, &acceptedDriverID, &post.Status)
		if pErr != nil {
			return nil, fmt.Errorf("ride or drop request not found")
		}
		if post.Status == "completed" || post.Status == "cancelled" {
			return nil, fmt.Errorf("drop request is completed. In-app calling is closed to protect user privacy")
		}
		driverID := ""
		if acceptedDriverID.Valid {
			driverID = acceptedDriverID.String
		}
		if driverID == "" {
			return nil, fmt.Errorf("cannot initiate call: no commuter driver has accepted this drop offer yet")
		}
		if callerID == driverID {
			receiverID = post.PassengerID
		} else if callerID == post.PassengerID {
			receiverID = driverID
		} else {
			return nil, fmt.Errorf("forbidden: only participants in this drop request can call")
		}
	} else {
		// 1. Strictly block calling if ride is completed or cancelled
		if ride.Status == "completed" || ride.Status == "cancelled" {
			return nil, fmt.Errorf("ride is completed. In-app calling is closed to protect user privacy")
		}

		if callerID == ride.DriverID {
			// Caller is Driver: Calling an accepted passenger
			if targetReceiverID != "" {
				var count int
				_ = database.DB.QueryRow(`
					SELECT COUNT(*) FROM ride_requests
					WHERE ride_id = $1 AND passenger_id = $2 AND status IN ('accepted', 'pending')
				`, rideID, targetReceiverID).Scan(&count)
				if count == 0 {
					return nil, fmt.Errorf("passenger is not part of this ride")
				}
				receiverID = targetReceiverID
			} else {
				// Default to first accepted or pending passenger
				err := database.DB.QueryRow(`
					SELECT passenger_id FROM ride_requests
					WHERE ride_id = $1 AND status IN ('accepted', 'pending')
					ORDER BY CASE WHEN status = 'accepted' THEN 0 ELSE 1 END, created_at ASC
					LIMIT 1
				`, rideID).Scan(&receiverID)
				if err != nil {
					return nil, fmt.Errorf("no accepted passengers available to call")
				}
			}
		} else {
			// Caller is Passenger: Must be accepted/pending passenger calling the Driver
			var count int
			_ = database.DB.QueryRow(`
				SELECT COUNT(*) FROM ride_requests
				WHERE ride_id = $1 AND passenger_id = $2 AND status IN ('accepted', 'pending')
			`, rideID, callerID).Scan(&count)
			if count == 0 {
				return nil, fmt.Errorf("forbidden: only passengers on this ride can call the driver")
			}
			receiverID = ride.DriverID
		}
	}

	// Terminate any previous ringing or connected calls involving this caller or receiver
	_, _ = database.DB.Exec(`
		UPDATE ride_calls SET status = 'ended', ended_at = NOW()
		WHERE (ride_id = $1 OR caller_id = $2 OR receiver_id = $3) AND status IN ('ringing', 'connected')
	`, rideID, callerID, receiverID)

	var call models.RideCall
	err = database.DB.QueryRow(`
		INSERT INTO ride_calls (ride_id, caller_id, receiver_id, status, started_at)
		VALUES ($1, $2, $3, 'ringing', NOW())
		RETURNING id, ride_id, caller_id, receiver_id, status, started_at, duration_seconds, created_at
	`, rideID, callerID, receiverID).Scan(
		&call.ID, &call.RideID, &call.CallerID, &call.ReceiverID, &call.Status,
		&call.StartedAt, &call.DurationSeconds, &call.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Fetch Caller public info
	var caller models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, callerID).Scan(&caller.ID, &caller.FullName, &caller.AvatarURL, &caller.City, &caller.IsDriver, &caller.IsVerifiedDriver, &caller.AvgRating, &caller.TotalRides)
	call.Caller = &caller

	// Fetch Receiver public info
	var receiver models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, receiverID).Scan(&receiver.ID, &receiver.FullName, &receiver.AvatarURL, &receiver.City, &receiver.IsDriver, &receiver.IsVerifiedDriver, &receiver.AvgRating, &receiver.TotalRides)
	call.Receiver = &receiver

	// Trigger high-priority push call notification to the receiver
	go s.notificationService.NotifyIncomingCall(receiverID, caller.FullName, rideID, call.ID)

	return &call, nil
}

func (s *RideService) GetActiveRideCall(rideID, userID string) (*models.RideCall, error) {
	var call models.RideCall
	var callerID, receiverID string
	var connectedAt, endedAt sql.NullTime

	err := database.DB.QueryRow(`
		SELECT id, ride_id, caller_id, receiver_id, status, started_at, connected_at, ended_at, duration_seconds, created_at
		FROM ride_calls
		WHERE ride_id = $1 AND (caller_id = $2 OR receiver_id = $2) AND status IN ('ringing', 'connected')
		ORDER BY created_at DESC LIMIT 1
	`, rideID, userID).Scan(
		&call.ID, &call.RideID, &callerID, &receiverID, &call.Status,
		&call.StartedAt, &connectedAt, &endedAt, &call.DurationSeconds, &call.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	call.CallerID = callerID
	call.ReceiverID = receiverID
	if connectedAt.Valid {
		call.ConnectedAt = &connectedAt.Time
	}
	if endedAt.Valid {
		call.EndedAt = &endedAt.Time
	}

	// Fetch caller and receiver details
	var caller models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, callerID).Scan(&caller.ID, &caller.FullName, &caller.AvatarURL, &caller.City, &caller.IsDriver, &caller.IsVerifiedDriver, &caller.AvgRating, &caller.TotalRides)
	call.Caller = &caller

	var receiver models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, receiverID).Scan(&receiver.ID, &receiver.FullName, &receiver.AvatarURL, &receiver.City, &receiver.IsDriver, &receiver.IsVerifiedDriver, &receiver.AvgRating, &receiver.TotalRides)
	call.Receiver = &receiver

	return &call, nil
}

func (s *RideService) GetUserActiveIncomingCall(userID string) (*models.RideCall, error) {
	// Auto-expire calls that have been ringing for more than 60 seconds
	_, _ = database.DB.Exec(`
		UPDATE ride_calls SET status = 'ended', ended_at = NOW()
		WHERE status = 'ringing' AND started_at < NOW() - INTERVAL '60 seconds'
	`)

	var call models.RideCall
	var callerID, receiverID string
	var connectedAt, endedAt sql.NullTime

	err := database.DB.QueryRow(`
		SELECT rc.id, rc.ride_id, rc.caller_id, rc.receiver_id, rc.status, rc.started_at, rc.connected_at, rc.ended_at, rc.duration_seconds, rc.created_at
		FROM ride_calls rc
		JOIN rides r ON r.id = rc.ride_id
		WHERE rc.receiver_id = $1 AND rc.status IN ('ringing', 'connected') AND r.status NOT IN ('completed', 'cancelled')
		ORDER BY rc.created_at DESC LIMIT 1
	`, userID).Scan(
		&call.ID, &call.RideID, &callerID, &receiverID, &call.Status,
		&call.StartedAt, &connectedAt, &endedAt, &call.DurationSeconds, &call.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	call.CallerID = callerID
	call.ReceiverID = receiverID
	if connectedAt.Valid {
		call.ConnectedAt = &connectedAt.Time
	}
	if endedAt.Valid {
		call.EndedAt = &endedAt.Time
	}

	var caller models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, COALESCE(avg_rating, 5.0), COALESCE(total_rides, 0)
		FROM users WHERE id = $1
	`, callerID).Scan(&caller.ID, &caller.FullName, &caller.AvatarURL, &caller.City, &caller.IsDriver, &caller.IsVerifiedDriver, &caller.AvgRating, &caller.TotalRides)
	call.Caller = &caller

	return &call, nil
}

func (s *RideService) UpdateRideCallStatus(rideID, callID, userID, newStatus string) (*models.RideCall, error) {
	valid := map[string]bool{"connected": true, "ended": true, "rejected": true}
	if !valid[newStatus] {
		return nil, fmt.Errorf("invalid call status: %s", newStatus)
	}

	var current models.RideCall
	var connectedAt sql.NullTime
	err := database.DB.QueryRow(`
		SELECT id, ride_id, caller_id, receiver_id, status, connected_at
		FROM ride_calls
		WHERE id = $1 AND ride_id = $2 AND (caller_id = $3 OR receiver_id = $3)
	`, callID, rideID, userID).Scan(
		&current.ID, &current.RideID, &current.CallerID, &current.ReceiverID, &current.Status, &connectedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("call not found or unauthorized")
	}

	if newStatus == "connected" {
		_, err = database.DB.Exec(`
			UPDATE ride_calls
			SET status = 'connected', connected_at = NOW()
			WHERE id = $1
		`, callID)
	} else {
		// "ended" or "rejected"
		var durationSecs int
		if connectedAt.Valid {
			durationSecs = int(time.Since(connectedAt.Time).Seconds())
			if durationSecs < 0 {
				durationSecs = 0
			}
		}
		_, err = database.DB.Exec(`
			UPDATE ride_calls
			SET status = $1, ended_at = NOW(), duration_seconds = $2
			WHERE id = $3
		`, newStatus, durationSecs, callID)
	}

	if err != nil {
		return nil, err
	}

	var updated models.RideCall
	var callerID, receiverID string
	var connTime, endTime sql.NullTime
	_ = database.DB.QueryRow(`
		SELECT id, ride_id, caller_id, receiver_id, status, started_at, connected_at, ended_at, duration_seconds, created_at
		FROM ride_calls WHERE id = $1
	`, callID).Scan(
		&updated.ID, &updated.RideID, &callerID, &receiverID, &updated.Status,
		&updated.StartedAt, &connTime, &endTime, &updated.DurationSeconds, &updated.CreatedAt,
	)
	updated.CallerID = callerID
	updated.ReceiverID = receiverID
	if connTime.Valid {
		updated.ConnectedAt = &connTime.Time
	}
	if endTime.Valid {
		updated.EndedAt = &endTime.Time
	}

	return &updated, nil
}

func (s *RideService) SendCallSignal(rideID, callID, senderID, signalType, payload string) (*models.CallSignal, error) {
	var authorized bool
	err := database.DB.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM ride_calls
			WHERE id = $1 AND ride_id = $2 AND (caller_id = $3 OR receiver_id = $3)
			AND status IN ('ringing', 'connected')
		)
	`, callID, rideID, senderID).Scan(&authorized)
	if err != nil || !authorized {
		return nil, fmt.Errorf("call not found or unauthorized")
	}

	var sig models.CallSignal
	err = database.DB.QueryRow(`
		INSERT INTO call_signals (call_id, sender_id, type, payload, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		RETURNING id, call_id, sender_id, type, payload, created_at
	`, callID, senderID, signalType, payload).Scan(
		&sig.ID, &sig.CallID, &sig.SenderID, &sig.Type, &sig.Payload, &sig.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &sig, nil
}

func (s *RideService) GetCallSignals(rideID, callID, userID, afterID string) ([]models.CallSignal, error) {
	var authorized bool
	err := database.DB.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM ride_calls
			WHERE id = $1 AND ride_id = $2 AND (caller_id = $3 OR receiver_id = $3)
		)
	`, callID, rideID, userID).Scan(&authorized)
	if err != nil || !authorized {
		return nil, fmt.Errorf("call not found or unauthorized")
	}

	var rows *sql.Rows
	if afterID != "" {
		var afterCreatedAt time.Time
		err := database.DB.QueryRow(`SELECT created_at FROM call_signals WHERE id = $1`, afterID).Scan(&afterCreatedAt)
		if err == nil {
			rows, err = database.DB.Query(`
				SELECT id, call_id, sender_id, type, payload, created_at
				FROM call_signals
				WHERE call_id = $1 AND sender_id != $2 AND created_at > $3
				ORDER BY created_at ASC
			`, callID, userID, afterCreatedAt)
		} else {
			rows, err = database.DB.Query(`
				SELECT id, call_id, sender_id, type, payload, created_at
				FROM call_signals
				WHERE call_id = $1 AND sender_id != $2
				ORDER BY created_at ASC
			`, callID, userID)
		}
	} else {
		rows, err = database.DB.Query(`
			SELECT id, call_id, sender_id, type, payload, created_at
			FROM call_signals
			WHERE call_id = $1 AND sender_id != $2
			ORDER BY created_at ASC
		`, callID, userID)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	signals := make([]models.CallSignal, 0)
	for rows.Next() {
		var sig models.CallSignal
		if err := rows.Scan(&sig.ID, &sig.CallID, &sig.SenderID, &sig.Type, &sig.Payload, &sig.CreatedAt); err != nil {
			continue
		}
		signals = append(signals, sig)
	}

	return signals, nil
}

