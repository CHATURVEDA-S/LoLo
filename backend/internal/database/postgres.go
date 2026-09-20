package database

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Connect(databaseURL string) error {
	var err error
	DB, err = sql.Open("postgres", databaseURL)
	if err == nil {
		if err = DB.Ping(); err == nil {
			DB.SetMaxOpenConns(25)
			DB.SetMaxIdleConns(5)
			log.Println("✅ Connected to PostgreSQL")
			return nil
		}
		DB.Close()
	}

	// If direct connection fails (e.g. Render IPv6 network unreachable) and host is Supabase direct domain:
	poolerCandidates := getSupabasePoolerURLs(databaseURL)
	for _, pURL := range poolerCandidates {
		log.Printf("⚠️ Direct DB connection failed (%v). Attempting IPv4 Supabase Pooler...", err)
		DB, err = sql.Open("postgres", pURL)
		if err == nil {
			if err = DB.Ping(); err == nil {
				DB.SetMaxOpenConns(25)
				DB.SetMaxIdleConns(5)
				log.Println("✅ Connected to PostgreSQL via IPv4 Supabase Pooler")
				return nil
			}
			DB.Close()
		}
	}

	return fmt.Errorf("failed to ping database: %w", err)
}

func getSupabasePoolerURLs(rawURL string) []string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	hostname := u.Hostname()
	if strings.HasPrefix(hostname, "db.") && strings.HasSuffix(hostname, ".supabase.co") {
		parts := strings.Split(hostname, ".")
		if len(parts) >= 3 {
			ref := parts[1]
			username := u.User.Username()
			if !strings.HasSuffix(username, "."+ref) {
				username = username + "." + ref
			}
			password, hasPassword := u.User.Password()
			var userinfo *url.Userinfo
			if hasPassword {
				userinfo = url.UserPassword(username, password)
			} else {
				userinfo = url.User(username)
			}
			u.User = userinfo

			// Try session pooler (port 5432) first, then transaction pooler (port 6543)
			u.Host = "aws-0-ap-south-1.pooler.supabase.com:5432"
			url5432 := u.String()
			u.Host = "aws-0-ap-south-1.pooler.supabase.com:6543"
			url6543 := u.String()
			return []string{url5432, url6543}
		}
	}
	return nil
}

func RunMigrations() error {
	// Get the directory of this source file to find migrations relative to it
	_, filename, _, _ := runtime.Caller(0)
	baseDir := filepath.Dir(filepath.Dir(filepath.Dir(filename)))
	migrationsDir := filepath.Join(baseDir, "migrations")

	// If migrations directory is not found via source path (e.g. running in Docker/Render), try working directory
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		candidates := []string{"migrations", "./migrations", "../migrations", "backend/migrations"}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				migrationsDir = c
				break
			}
		}
	}

	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to read migrations directory (%s): %w", migrationsDir, err)
	}

	for _, f := range files {
		if filepath.Ext(f.Name()) != ".sql" {
			continue
		}

		path := filepath.Join(migrationsDir, f.Name())
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", f.Name(), err)
		}

		_, err = DB.Exec(string(content))
		if err != nil {
			return fmt.Errorf("failed to execute migration %s: %w", f.Name(), err)
		}

		log.Printf("✅ Migration applied: %s", f.Name())
	}

	return nil
}

func Close() {
	if DB != nil {
		DB.Close()
	}
}
