package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Connect(databaseURL string) error {
	var err error
	DB, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)

	log.Println("✅ Connected to PostgreSQL")
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
