-- Add vehicle_type to rides and driver_verifications, plus bio and emergency details to users
ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'car';
ALTER TABLE driver_verifications ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'car';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT '';
