package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port            string
	DatabaseURL     string
	JWTSecret       string
	GoogleMapsKey   string
	ExpoPushToken   string
	VerificationURL string
	Environment     string
	TwoFactorAPIKey string
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		DatabaseURL:     getEnv("DATABASE_URL", ""),
		JWTSecret:       getEnv("JWT_SECRET", "lo-ride-dev-secret-change-in-production"),
		GoogleMapsKey:   getEnv("GOOGLE_MAPS_API_KEY", ""),
		ExpoPushToken:   getEnv("EXPO_PUSH_ACCESS_TOKEN", ""),
		VerificationURL: getEnv("VERIFICATION_API_URL", ""),
		Environment:     getEnv("ENVIRONMENT", "development"),
		TwoFactorAPIKey: getEnv("TWOFACTOR_API_KEY", "c1cf5835-6543-11f1-8f15-0200cd936042"),
	}
}

func (c *Config) IsDev() bool {
	return c.Environment == "development"
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(val)
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
