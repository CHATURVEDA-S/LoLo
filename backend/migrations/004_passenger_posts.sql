-- Migration 004: Passenger travel request posts ("Need a Drop / Travel Request")
CREATE TABLE IF NOT EXISTS passenger_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    origin_lat DOUBLE PRECISION,
    origin_lng DOUBLE PRECISION,
    origin_place_id TEXT DEFAULT '',
    destination TEXT NOT NULL,
    dest_lat DOUBLE PRECISION,
    dest_lng DOUBLE PRECISION,
    dest_place_id TEXT DEFAULT '',
    city TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    seats_needed INT NOT NULL DEFAULT 1,
    vehicle_preference TEXT NOT NULL DEFAULT 'any', -- 'car', 'bike', 'any'
    distance_km DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    suggested_fare NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT DEFAULT '',
    is_daily BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_days TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'accepted', 'completed', 'cancelled'
    accepted_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_posts_city ON passenger_posts(city);
CREATE INDEX IF NOT EXISTS idx_passenger_posts_passenger ON passenger_posts(passenger_id);
CREATE INDEX IF NOT EXISTS idx_passenger_posts_status ON passenger_posts(status);
CREATE INDEX IF NOT EXISTS idx_passenger_posts_departure ON passenger_posts(departure_time);
