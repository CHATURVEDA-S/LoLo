package utils

import (
	"fmt"
	"net/mail"
	"regexp"
	"strings"
)

var phoneRegex = regexp.MustCompile(`^(\+91)?[6-9]\d{9}$`)

func ValidateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
	}
	_, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("invalid email format")
	}
	return nil
}

func ValidatePhone(phone string) error {
	if phone == "" {
		return fmt.Errorf("phone number is required")
	}
	cleaned := strings.ReplaceAll(phone, " ", "")
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	if !phoneRegex.MatchString(cleaned) {
		return fmt.Errorf("invalid Indian phone number")
	}
	return nil
}

func ValidatePassword(password string) error {
	if len(password) < 6 {
		return fmt.Errorf("password must be at least 6 characters")
	}
	return nil
}

func ValidateRequired(field, name string) error {
	if strings.TrimSpace(field) == "" {
		return fmt.Errorf("%s is required", name)
	}
	return nil
}

func CleanPhone(phone string) string {
	cleaned := strings.ReplaceAll(phone, " ", "")
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	if !strings.HasPrefix(cleaned, "+91") && len(cleaned) == 10 {
		cleaned = "+91" + cleaned
	}
	return cleaned
}
