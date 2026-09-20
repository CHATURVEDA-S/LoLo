package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type TwoFactorService struct {
	apiKey     string
	httpClient *http.Client
}

type TwoFactorResponse struct {
	Status  string `json:"Status"`
	Details string `json:"Details"`
}

func NewTwoFactorService(apiKey string) *TwoFactorService {
	if apiKey == "" {
		apiKey = "c1cf5835-6543-11f1-8f15-0200cd936042"
	}
	return &TwoFactorService{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
		},
	}
}

func (s *TwoFactorService) FormatPhone(phone string) string {
	digits := ""
	for _, ch := range phone {
		if ch >= '0' && ch <= '9' {
			digits += string(ch)
		}
	}
	// If 10 digits, format with +91
	if len(digits) == 10 {
		return "+91" + digits
	}
	// If 12 digits starting with 91
	if len(digits) == 12 && strings.HasPrefix(digits, "91") {
		return "+" + digits
	}
	if strings.HasPrefix(phone, "+") {
		return "+" + digits
	}
	return "+91" + digits
}

func (s *TwoFactorService) IsDemoPhone(phone string) bool {
	clean := s.FormatPhone(phone)
	return clean == "+919999999999" || strings.HasSuffix(clean, "9999999999")
}

func (s *TwoFactorService) SendOTP(phone string) (string, error) {
	formatted := s.FormatPhone(phone)

	// Play Store review demo bypass
	if s.IsDemoPhone(formatted) {
		return "DEMO-SESSION-9999999999", nil
	}

	reqURL := fmt.Sprintf("https://2factor.in/API/V1/%s/SMS/%s/AUTOGEN", s.apiKey, url.PathEscape(formatted))
	resp, err := s.httpClient.Get(reqURL)
	if err != nil {
		return "", fmt.Errorf("failed to reach OTP gateway: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response from OTP gateway: %w", err)
	}

	var res TwoFactorResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return "", fmt.Errorf("invalid response from OTP gateway: %s", string(bodyBytes))
	}

	if res.Status != "Success" {
		return "", fmt.Errorf("%s", res.Details)
	}

	return res.Details, nil
}

func (s *TwoFactorService) VerifyOTP(phone, sessionID, otp string) (bool, string, error) {
	formatted := s.FormatPhone(phone)
	otp = strings.TrimSpace(otp)

	// Demo bypass for Play Store reviewer: phone 9999999999 and OTP 123456
	if (s.IsDemoPhone(formatted) || sessionID == "DEMO-SESSION-9999999999") && otp == "123456" {
		return true, "Demo OTP verified", nil
	}

	reqURL := fmt.Sprintf("https://2factor.in/API/V1/%s/SMS/VERIFY/%s/%s", s.apiKey, url.PathEscape(sessionID), url.PathEscape(otp))
	resp, err := s.httpClient.Get(reqURL)
	if err != nil {
		return false, "", fmt.Errorf("failed to reach OTP gateway: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, "", fmt.Errorf("failed to read verification response: %w", err)
	}

	var res TwoFactorResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return false, "", fmt.Errorf("invalid response format from OTP gateway: %s", string(bodyBytes))
	}

	if res.Status == "Success" && strings.Contains(strings.ToLower(res.Details), "matched") {
		return true, res.Details, nil
	}

	return false, res.Details, nil
}
