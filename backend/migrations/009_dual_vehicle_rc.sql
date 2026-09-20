-- Migration 009: Add support for dual vehicle RC (Car and Bike)
ALTER TABLE driver_verifications
  ADD COLUMN IF NOT EXISTS secondary_rc_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_rc_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_rc_status TEXT DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_make TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_model TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_year TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_color TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_vehicle_plate TEXT DEFAULT '';
