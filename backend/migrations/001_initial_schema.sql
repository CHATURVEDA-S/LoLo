-- Lo Ride Database Schema
-- Intra-city ride sharing for Indian metro cities

-- ===== EXTENSIONS =====
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    is_driver BOOLEAN NOT NULL DEFAULT false,
    is_verified_driver BOOLEAN NOT NULL DEFAULT false,
    avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    total_rides INTEGER NOT NULL DEFAULT 0,
    push_token TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== DRIVER VERIFICATIONS =====
CREATE TABLE IF NOT EXISTS driver_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dl_number TEXT NOT NULL DEFAULT '',
    dl_image_url TEXT DEFAULT '',
    dl_status TEXT NOT NULL DEFAULT 'pending',  -- pending, verified, rejected
    dl_verified_at TIMESTAMPTZ,
    rc_number TEXT NOT NULL DEFAULT '',
    rc_image_url TEXT DEFAULT '',
    rc_status TEXT NOT NULL DEFAULT 'pending',  -- pending, verified, rejected
    rc_verified_at TIMESTAMPTZ,
    vehicle_make TEXT DEFAULT '',
    vehicle_model TEXT DEFAULT '',
    vehicle_year TEXT DEFAULT '',
    vehicle_color TEXT DEFAULT '',
    vehicle_plate TEXT DEFAULT '',
    rejection_reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ===== SUPPORTED CITIES =====
CREATE TABLE IF NOT EXISTS supported_cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius_km DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed metro cities
INSERT INTO supported_cities (name, state, lat, lng, radius_km) VALUES
    ('Mumbai', 'Maharashtra', 19.0760, 72.8777, 60),
    ('Delhi NCR', 'Delhi', 28.7041, 77.1025, 70),
    ('Bengaluru', 'Karnataka', 12.9716, 77.5946, 50),
    ('Hyderabad', 'Telangana', 17.3850, 78.4867, 50),
    ('Chennai', 'Tamil Nadu', 13.0827, 80.2707, 50),
    ('Kolkata', 'West Bengal', 22.5726, 88.3639, 50),
    ('Pune', 'Maharashtra', 18.5204, 73.8567, 45),
    ('Ahmedabad', 'Gujarat', 23.0225, 72.5714, 45),
    ('Jaipur', 'Rajasthan', 26.9124, 75.7873, 40),
    ('Lucknow', 'Uttar Pradesh', 26.8467, 80.9462, 40),
    ('Chandigarh', 'Chandigarh', 30.7333, 76.7794, 35),
    ('Kochi', 'Kerala', 9.9312, 76.2673, 35),
    ('Indore', 'Madhya Pradesh', 22.7196, 75.8577, 35)
ON CONFLICT (name) DO NOTHING;

-- ===== RIDES =====
CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    seats_total INTEGER NOT NULL DEFAULT 1,
    seats_available INTEGER NOT NULL DEFAULT 1,
    price_per_seat NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    vehicle_info TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',  -- open, confirmed, in_progress, completed, cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== RIDE REQUESTS =====
CREATE TABLE IF NOT EXISTS ride_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seats_requested INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected, cancelled
    pickup_point TEXT DEFAULT '',
    pickup_lat DOUBLE PRECISION,
    pickup_lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ride_id, passenger_id)
);

-- ===== PAYMENT RECORDS =====
CREATE TABLE IF NOT EXISTS payment_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',  -- cash, upi
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, paid, disputed
    paid_at TIMESTAMPTZ,
    confirmed_by_driver BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ride_id, passenger_id)
);

-- ===== RATINGS =====
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
    comment TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ride_id, rater_id, ratee_id)
);

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',  -- ride_request, request_accepted, request_rejected, ride_started, ride_completed, payment_reminder
    ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_city ON rides(city);
CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departure_time);
CREATE INDEX IF NOT EXISTS idx_ride_requests_ride ON ride_requests(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON ride_requests(passenger_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_payment_records_ride ON payment_records(ride_id);
CREATE INDEX IF NOT EXISTS idx_driver_verifications_user ON driver_verifications(user_id);
