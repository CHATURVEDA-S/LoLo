-- Migration 010: Relax foreign key constraints on ride_id for ride_messages and ride_calls
-- This allows both carpool rides and passenger drop requests to support chat and calling seamlessly.

ALTER TABLE ride_messages DROP CONSTRAINT IF EXISTS ride_messages_ride_id_fkey;
ALTER TABLE ride_calls DROP CONSTRAINT IF EXISTS ride_calls_ride_id_fkey;
