package services

import (
	"database/sql"
	"math"

	"github.com/loride/backend/internal/database"
	"github.com/loride/backend/internal/models"
)

type CityService struct{}

func NewCityService() *CityService {
	return &CityService{}
}

func (s *CityService) GetSupportedCities() ([]models.SupportedCity, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, state, lat, lng, radius_km, is_active
		FROM supported_cities
		WHERE is_active = true
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cities []models.SupportedCity
	for rows.Next() {
		var c models.SupportedCity
		err := rows.Scan(&c.ID, &c.Name, &c.State, &c.Lat, &c.Lng, &c.RadiusKM, &c.IsActive)
		if err != nil {
			return nil, err
		}
		cities = append(cities, c)
	}
	return cities, nil
}

func (s *CityService) IsCitySupported(cityName string) (bool, error) {
	var exists bool
	err := database.DB.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM supported_cities WHERE name = $1 AND is_active = true
		)
	`, cityName).Scan(&exists)
	return exists, err
}

func (s *CityService) GetCityByName(cityName string) (*models.SupportedCity, error) {
	var c models.SupportedCity
	err := database.DB.QueryRow(`
		SELECT id, name, state, lat, lng, radius_km, is_active
		FROM supported_cities
		WHERE name = $1 AND is_active = true
	`, cityName).Scan(&c.ID, &c.Name, &c.State, &c.Lat, &c.Lng, &c.RadiusKM, &c.IsActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// IsLocationInCity checks if a lat/lng is within a supported city's radius
func (s *CityService) IsLocationInCity(lat, lng float64, cityName string) (bool, error) {
	city, err := s.GetCityByName(cityName)
	if err != nil || city == nil {
		return false, err
	}

	dist := haversineDistance(lat, lng, city.Lat, city.Lng)
	return dist <= city.RadiusKM, nil
}

// FindCityForLocation finds which supported city a lat/lng falls within
func (s *CityService) FindCityForLocation(lat, lng float64) (*models.SupportedCity, error) {
	cities, err := s.GetSupportedCities()
	if err != nil {
		return nil, err
	}

	for _, city := range cities {
		dist := haversineDistance(lat, lng, city.Lat, city.Lng)
		if dist <= city.RadiusKM {
			return &city, nil
		}
	}

	return nil, nil
}

// haversineDistance calculates the distance in km between two lat/lng points
func haversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKm = 6371.0

	dLat := degreesToRadians(lat2 - lat1)
	dLng := degreesToRadians(lng2 - lng1)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(degreesToRadians(lat1))*math.Cos(degreesToRadians(lat2))*
			math.Sin(dLng/2)*math.Sin(dLng/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}

func degreesToRadians(degrees float64) float64 {
	return degrees * math.Pi / 180
}
