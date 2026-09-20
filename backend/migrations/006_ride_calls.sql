CREATE TABLE IF NOT EXISTS ride_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'ringing', -- 'ringing', 'connected', 'ended', 'rejected', 'missed'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_calls_ride_id ON ride_calls(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_calls_caller ON ride_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_ride_calls_receiver ON ride_calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_ride_calls_status ON ride_calls(status);
