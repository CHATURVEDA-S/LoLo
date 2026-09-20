package services

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/models"
)

type PassengerPostService struct {
	notificationService *NotificationService
}

func NewPassengerPostService(ns *NotificationService) *PassengerPostService {
	return &PassengerPostService{notificationService: ns}
}

func (s *PassengerPostService) CreatePost(passengerID string, req models.CreatePassengerPostRequest) (*models.PassengerPost, error) {
	if strings.TrimSpace(req.Origin) == "" || strings.TrimSpace(req.Destination) == "" {
		return nil, fmt.Errorf("pickup origin and drop destination are required")
	}

	depTime, err := time.Parse(time.RFC3339, req.DepartureTime)
	if err != nil {
		depTime = time.Now().Add(30 * time.Minute)
	}

	if req.SeatsNeeded < 1 {
		req.SeatsNeeded = 1
	}

	if req.VehiclePreference == "" {
		req.VehiclePreference = "any"
	}

	city := req.City
	if strings.TrimSpace(city) == "" {
		city = "Hyderabad"
	}

	var post models.PassengerPost
	err = database.DB.QueryRow(`
		INSERT INTO passenger_posts (
			passenger_id, origin, origin_lat, origin_lng, origin_place_id,
			destination, dest_lat, dest_lng, dest_place_id, city,
			departure_time, seats_needed, vehicle_preference, distance_km,
			suggested_fare, notes, is_daily, recurring_days, status
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17, $18, 'open'
		)
		RETURNING id, passenger_id, origin, origin_lat, origin_lng, origin_place_id,
		          destination, dest_lat, dest_lng, dest_place_id, city,
		          departure_time, seats_needed, vehicle_preference, distance_km,
		          suggested_fare, notes, is_daily, recurring_days, status, accepted_driver_id, created_at, updated_at
	`,
		passengerID, req.Origin, req.OriginLat, req.OriginLng, req.OriginPlaceID,
		req.Destination, req.DestLat, req.DestLng, req.DestPlaceID, city,
		depTime, req.SeatsNeeded, req.VehiclePreference, req.DistanceKm,
		req.SuggestedFare, req.Notes, req.IsDaily, req.RecurringDays,
	).Scan(
		&post.ID, &post.PassengerID, &post.Origin, &post.OriginLat, &post.OriginLng, &post.OriginPlaceID,
		&post.Destination, &post.DestLat, &post.DestLng, &post.DestPlaceID, &post.City,
		&post.DepartureTime, &post.SeatsNeeded, &post.VehiclePreference, &post.DistanceKm,
		&post.SuggestedFare, &post.Notes, &post.IsDaily, &post.RecurringDays, &post.Status, &post.AcceptedDriverID,
		&post.CreatedAt, &post.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("could not create travel post: %w", err)
	}

	// Fetch passenger details
	var p models.UserPublic
	_ = database.DB.QueryRow(`
		SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, avg_rating, total_rides
		FROM users WHERE id = $1
	`, passengerID).Scan(
		&p.ID, &p.FullName, &p.AvatarURL, &p.City, &p.IsDriver, &p.IsVerifiedDriver, &p.AvgRating, &p.TotalRides,
	)
	post.Passenger = &p

	return &post, nil
}

func (s *PassengerPostService) GetOpenPosts(city, origin, destination, vehiclePref string) ([]models.PassengerPost, error) {
	query := `
		SELECT p.id, p.passenger_id, p.origin, p.origin_lat, p.origin_lng, p.origin_place_id,
		       p.destination, p.dest_lat, p.dest_lng, p.dest_place_id, p.city,
		       p.departure_time, p.seats_needed, p.vehicle_preference, p.distance_km,
		       p.suggested_fare, p.notes, p.is_daily, p.recurring_days, p.status, p.accepted_driver_id, p.created_at, p.updated_at,
		       u.id, u.full_name, COALESCE(u.avatar_url, ''), COALESCE(u.city, ''),
		       u.is_driver, u.is_verified_driver, COALESCE(u.avg_rating, 5.0), COALESCE(u.total_rides, 0)
		FROM passenger_posts p
		JOIN users u ON u.id = p.passenger_id
		WHERE p.status = 'open'
		  AND p.departure_time >= NOW() - INTERVAL '2 hours'
	`
	var args []interface{}
	idx := 1

	if city != "" {
		query += fmt.Sprintf(" AND LOWER(p.city) = LOWER($%d)", idx)
		args = append(args, city)
		idx++
	}

	if origin != "" {
		query += fmt.Sprintf(" AND (p.origin ILIKE $%d)", idx)
		args = append(args, "%"+origin+"%")
		idx++
	}

	if destination != "" {
		query += fmt.Sprintf(" AND (p.destination ILIKE $%d)", idx)
		args = append(args, "%"+destination+"%")
		idx++
	}

	if vehiclePref != "" && vehiclePref != "any" && vehiclePref != "all" {
		query += fmt.Sprintf(" AND (p.vehicle_preference = $%d OR p.vehicle_preference = 'any')", idx)
		args = append(args, vehiclePref)
		idx++
	}

	query += " ORDER BY p.departure_time ASC LIMIT 50"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("could not query passenger posts: %w", err)
	}
	defer rows.Close()

	posts := []models.PassengerPost{}
	for rows.Next() {
		var post models.PassengerPost
		var passenger models.UserPublic
		err := rows.Scan(
			&post.ID, &post.PassengerID, &post.Origin, &post.OriginLat, &post.OriginLng, &post.OriginPlaceID,
			&post.Destination, &post.DestLat, &post.DestLng, &post.DestPlaceID, &post.City,
			&post.DepartureTime, &post.SeatsNeeded, &post.VehiclePreference, &post.DistanceKm,
			&post.SuggestedFare, &post.Notes, &post.IsDaily, &post.RecurringDays, &post.Status, &post.AcceptedDriverID, &post.CreatedAt, &post.UpdatedAt,
			&passenger.ID, &passenger.FullName, &passenger.AvatarURL, &passenger.City,
			&passenger.IsDriver, &passenger.IsVerifiedDriver, &passenger.AvgRating, &passenger.TotalRides,
		)
		if err == nil {
			post.Passenger = &passenger
			posts = append(posts, post)
		}
	}

	return posts, nil
}

func (s *PassengerPostService) GetMyPosts(userID string) ([]models.PassengerPost, error) {
	rows, err := database.DB.Query(`
		SELECT p.id, p.passenger_id, p.origin, p.origin_lat, p.origin_lng, p.origin_place_id,
		       p.destination, p.dest_lat, p.dest_lng, p.dest_place_id, p.city,
		       p.departure_time, p.seats_needed, p.vehicle_preference, p.distance_km,
		       p.suggested_fare, p.notes, p.is_daily, p.recurring_days, p.status, p.accepted_driver_id, p.created_at, p.updated_at,
		       u.id, u.full_name, COALESCE(u.avatar_url, ''), COALESCE(u.city, ''),
		       u.is_driver, u.is_verified_driver, COALESCE(u.avg_rating, 5.0), COALESCE(u.total_rides, 0)
		FROM passenger_posts p
		JOIN users u ON u.id = p.passenger_id
		WHERE p.passenger_id = $1 OR p.accepted_driver_id = $1
		ORDER BY p.created_at DESC
		LIMIT 50
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := []models.PassengerPost{}
	for rows.Next() {
		var post models.PassengerPost
		var passenger models.UserPublic
		err := rows.Scan(
			&post.ID, &post.PassengerID, &post.Origin, &post.OriginLat, &post.OriginLng, &post.OriginPlaceID,
			&post.Destination, &post.DestLat, &post.DestLng, &post.DestPlaceID, &post.City,
			&post.DepartureTime, &post.SeatsNeeded, &post.VehiclePreference, &post.DistanceKm,
			&post.SuggestedFare, &post.Notes, &post.IsDaily, &post.RecurringDays, &post.Status, &post.AcceptedDriverID, &post.CreatedAt, &post.UpdatedAt,
			&passenger.ID, &passenger.FullName, &passenger.AvatarURL, &passenger.City,
			&passenger.IsDriver, &passenger.IsVerifiedDriver, &passenger.AvgRating, &passenger.TotalRides,
		)
		if err == nil {
			post.Passenger = &passenger

			// If accepted, also populate driver info
			if post.AcceptedDriverID != nil && *post.AcceptedDriverID != "" {
				var driver models.UserPublic
				_ = database.DB.QueryRow(`
					SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, avg_rating, total_rides
					FROM users WHERE id = $1
				`, *post.AcceptedDriverID).Scan(
					&driver.ID, &driver.FullName, &driver.AvatarURL, &driver.City,
					&driver.IsDriver, &driver.IsVerifiedDriver, &driver.AvgRating, &driver.TotalRides,
				)
				post.AcceptedDriver = &driver
			}

			posts = append(posts, post)
		}
	}

	return posts, nil
}

func (s *PassengerPostService) GetPostByID(id string) (*models.PassengerPost, error) {
	var post models.PassengerPost
	var passenger models.UserPublic

	err := database.DB.QueryRow(`
		SELECT p.id, p.passenger_id, p.origin, p.origin_lat, p.origin_lng, p.origin_place_id,
		       p.destination, p.dest_lat, p.dest_lng, p.dest_place_id, p.city,
		       p.departure_time, p.seats_needed, p.vehicle_preference, p.distance_km,
		       p.suggested_fare, p.notes, p.is_daily, p.recurring_days, p.status, p.accepted_driver_id, p.created_at, p.updated_at,
		       u.id, u.full_name, COALESCE(u.avatar_url, ''), COALESCE(u.city, ''),
		       u.is_driver, u.is_verified_driver, COALESCE(u.avg_rating, 5.0), COALESCE(u.total_rides, 0)
		FROM passenger_posts p
		JOIN users u ON u.id = p.passenger_id
		WHERE p.id = $1
	`, id).Scan(
		&post.ID, &post.PassengerID, &post.Origin, &post.OriginLat, &post.OriginLng, &post.OriginPlaceID,
		&post.Destination, &post.DestLat, &post.DestLng, &post.DestPlaceID, &post.City,
		&post.DepartureTime, &post.SeatsNeeded, &post.VehiclePreference, &post.DistanceKm,
		&post.SuggestedFare, &post.Notes, &post.IsDaily, &post.RecurringDays, &post.Status, &post.AcceptedDriverID, &post.CreatedAt, &post.UpdatedAt,
		&passenger.ID, &passenger.FullName, &passenger.AvatarURL, &passenger.City,
		&passenger.IsDriver, &passenger.IsVerifiedDriver, &passenger.AvgRating, &passenger.TotalRides,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	post.Passenger = &passenger

	if post.AcceptedDriverID != nil && *post.AcceptedDriverID != "" {
		var driver models.UserPublic
		_ = database.DB.QueryRow(`
			SELECT id, full_name, COALESCE(avatar_url, ''), COALESCE(city, ''), is_driver, is_verified_driver, avg_rating, total_rides
			FROM users WHERE id = $1
		`, *post.AcceptedDriverID).Scan(
			&driver.ID, &driver.FullName, &driver.AvatarURL, &driver.City,
			&driver.IsDriver, &driver.IsVerifiedDriver, &driver.AvgRating, &driver.TotalRides,
		)
		post.AcceptedDriver = &driver
	}

	return &post, nil
}

func (s *PassengerPostService) AcceptPost(postID, driverID string) (*models.PassengerPost, error) {
	// 1. Fetch current post
	post, err := s.GetPostByID(postID)
	if err != nil || post == nil {
		return nil, fmt.Errorf("travel request not found")
	}

	if post.Status != "open" {
		return nil, fmt.Errorf("this travel request is already %s", post.Status)
	}

	if post.PassengerID == driverID {
		return nil, fmt.Errorf("you cannot accept your own travel request")
	}

	// 2. Fetch driver name
	var driverName string
	_ = database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, driverID).Scan(&driverName)
	if driverName == "" {
		driverName = "A verified driver"
	}

	// 3. Update post to accepted
	_, err = database.DB.Exec(`
		UPDATE passenger_posts
		SET status = 'accepted', accepted_driver_id = $1, updated_at = NOW()
		WHERE id = $2 AND status = 'open'
	`, driverID, postID)
	if err != nil {
		return nil, fmt.Errorf("could not accept travel request: %w", err)
	}

	// 4. Send instant push notification to passenger
	go func() {
		s.notificationService.CreateNotification(
			post.PassengerID,
			"Driver Found! 🚗",
			fmt.Sprintf("%s accepted your travel request from %s to %s. Est. Payment: ₹%.0f", driverName, post.Origin, post.Destination, post.SuggestedFare),
			"passenger_post_accepted",
			nil,
		)
	}()

	return s.GetPostByID(postID)
}

func (s *PassengerPostService) CompletePost(postID, userID string) error {
	post, err := s.GetPostByID(postID)
	if err != nil || post == nil {
		return fmt.Errorf("post not found")
	}

	if post.PassengerID != userID && (post.AcceptedDriverID == nil || *post.AcceptedDriverID != userID) {
		return fmt.Errorf("unauthorized to complete this post")
	}

	_, err = database.DB.Exec(`
		UPDATE passenger_posts SET status = 'completed', updated_at = NOW() WHERE id = $1
	`, postID)
	if err != nil {
		return err
	}

	// Increment total_rides for passenger and driver
	go func() {
		database.DB.Exec(`
			UPDATE users SET total_rides = (
				(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status = 'completed') +
				(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status = 'completed') +
				(SELECT COUNT(*) FROM passenger_posts WHERE (passenger_id = $1 OR accepted_driver_id = $1) AND status = 'completed')
			), updated_at = NOW() WHERE id = $1
		`, post.PassengerID)

		if post.AcceptedDriverID != nil && *post.AcceptedDriverID != "" {
			database.DB.Exec(`
				UPDATE users SET total_rides = (
					(SELECT COUNT(*) FROM rides WHERE driver_id = $1 AND status = 'completed') +
					(SELECT COUNT(*) FROM ride_requests rr JOIN rides r ON rr.ride_id = r.id WHERE rr.passenger_id = $1 AND rr.status = 'accepted' AND r.status = 'completed') +
					(SELECT COUNT(*) FROM passenger_posts WHERE (passenger_id = $1 OR accepted_driver_id = $1) AND status = 'completed')
				), updated_at = NOW() WHERE id = $1
			`, *post.AcceptedDriverID)
		}
	}()

	return nil
}

func (s *PassengerPostService) CancelPost(postID, userID string) error {
	post, err := s.GetPostByID(postID)
	if err != nil || post == nil {
		return fmt.Errorf("drop request not found")
	}

	isPassenger := post.PassengerID == userID
	isAcceptedDriver := post.AcceptedDriverID != nil && *post.AcceptedDriverID == userID

	if !isPassenger && !isAcceptedDriver {
		return fmt.Errorf("unauthorized to cancel or withdraw from this drop request")
	}

	if isPassenger {
		res, err := database.DB.Exec(`
			UPDATE passenger_posts SET status = 'cancelled', updated_at = NOW()
			WHERE id = $1 AND passenger_id = $2 AND status IN ('open', 'accepted')
		`, postID, userID)
		if err != nil {
			return err
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			return fmt.Errorf("could not cancel drop request (already completed or cancelled)")
		}

		// Notify driver if drop was already accepted
		if post.AcceptedDriverID != nil && *post.AcceptedDriverID != "" {
			passengerName := "Passenger"
			if post.Passenger != nil && post.Passenger.FullName != "" {
				passengerName = post.Passenger.FullName
			}
			_ = s.notificationService.CreateNotification(
				*post.AcceptedDriverID,
				"Drop Request Cancelled",
				fmt.Sprintf("%s cancelled their drop request for %s ➔ %s.", passengerName, post.Origin, post.Destination),
				"post_cancelled",
				nil,
			)
		}
		return nil
	}

	// Driver withdrawing their drop offer -> revert to open so other drivers can accept
	_, err = database.DB.Exec(`
		UPDATE passenger_posts SET status = 'open', accepted_driver_id = NULL, updated_at = NOW()
		WHERE id = $1 AND accepted_driver_id = $2 AND status = 'accepted'
	`, postID, userID)
	if err != nil {
		return fmt.Errorf("could not withdraw drop offer: %w", err)
	}

	// Notify passenger that driver withdrew
	var driverName string
	_ = database.DB.QueryRow(`SELECT full_name FROM users WHERE id = $1`, userID).Scan(&driverName)
	if driverName == "" {
		driverName = "The driver"
	}
	_ = s.notificationService.CreateNotification(
		post.PassengerID,
		"Drop Offer Update",
		fmt.Sprintf("%s withdrew their drop offer. Your request is now open for other commuters!", driverName),
		"post_driver_withdrew",
		nil,
	)

	return nil
}
