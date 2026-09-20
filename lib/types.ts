export type RideStatus = 'open' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type VerificationStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';
export type VehicleType = 'car' | 'bike';

export interface User {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  avatar_url: string;
  city: string;
  bio?: string;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  is_driver: boolean;
  is_verified_driver: boolean;
  avg_rating: number;
  total_rides: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  full_name: string;
  avatar_url: string;
  city: string;
  bio?: string;
  gender?: string;
  is_driver: boolean;
  is_verified_driver: boolean;
  avg_rating: number;
  total_rides: number;
}

export interface Ride {
  id: string;
  driver_id: string;
  origin: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_place_id?: string;
  destination: string;
  dest_lat?: number;
  dest_lng?: number;
  dest_place_id?: string;
  city: string;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  price_per_seat: number;
  vehicle_type?: VehicleType;
  vehicle_info: string;
  notes: string;
  is_daily?: boolean;
  recurring_days?: string;
  status: RideStatus;
  driver_live_lat?: number;
  driver_live_lng?: number;
  created_at: string;
  updated_at: string;
  driver?: UserPublic;
}

export interface RideRequest {
  id: string;
  ride_id: string;
  passenger_id: string;
  seats_requested: number;
  status: RequestStatus;
  pickup_point: string;
  pickup_lat?: number;
  pickup_lng?: number;
  created_at: string;
  updated_at: string;
  passenger?: UserPublic;
  ride?: Ride;
}

export interface PaymentRecord {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  amount: number;
  payment_method: string;
  status: string;
  paid_at?: string;
  confirmed_by_driver: boolean;
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: string;
  ride_id: string;
  rater_id: string;
  ratee_id: string;
  score: number;
  comment: string;
  created_at: string;
  rater?: UserPublic;
}

export interface DriverVerification {
  id: string;
  user_id: string;
  dl_number: string;
  dl_image_url: string;
  dl_status: VerificationStatus;
  dl_verified_at?: string;
  rc_number: string;
  rc_image_url: string;
  rc_status: VerificationStatus;
  rc_verified_at?: string;
  vehicle_type?: VehicleType;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_color: string;
  vehicle_plate: string;
  secondary_rc_number?: string;
  secondary_rc_image_url?: string;
  secondary_rc_status?: VerificationStatus;
  secondary_vehicle_type?: VehicleType;
  secondary_vehicle_make?: string;
  secondary_vehicle_model?: string;
  secondary_vehicle_year?: string;
  secondary_vehicle_color?: string;
  secondary_vehicle_plate?: string;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface SupportedCity {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  radius_km: number;
  is_active: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  ride_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface Trip {
  ride: Ride;
  role: 'driver' | 'passenger';
  request_status?: string;
}

export interface ReviewDetail {
  id: string;
  ride_id: string;
  rater_id: string;
  rater_name: string;
  rater_avatar: string;
  ratee_id: string;
  score: number;
  comment: string;
  created_at: string;
  origin: string;
  destination: string;
  rater_role: 'Passenger' | 'Driver';
}

export interface ProfileReviewsResponse {
  reviews: ReviewDetail[];
  avg_rating: number;
  total_reviews: number;
  total_rides: number;
  rides_as_driver: number;
  rides_as_passenger: number;
  active_rides?: number;
  completed_rides?: number;
}

export type PassengerPostStatus = 'open' | 'accepted' | 'completed' | 'cancelled';

export interface PassengerPost {
  id: string;
  passenger_id: string;
  passenger?: UserPublic;
  origin: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_place_id?: string;
  destination: string;
  dest_lat?: number;
  dest_lng?: number;
  dest_place_id?: string;
  city: string;
  departure_time: string;
  seats_needed: number;
  vehicle_preference: 'car' | 'bike';
  distance_km: number;
  suggested_fare: number;
  notes?: string;
  is_daily?: boolean;
  recurring_days?: string;
  status: PassengerPostStatus;
  accepted_driver_id?: string;
  accepted_driver?: UserPublic;
  created_at: string;
  updated_at: string;
}

export interface CreatePassengerPostRequest {
  origin: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_place_id?: string;
  destination: string;
  dest_lat?: number;
  dest_lng?: number;
  dest_place_id?: string;
  city: string;
  departure_time: string;
  seats_needed: number;
  vehicle_preference: 'car' | 'bike';
  distance_km: number;
  suggested_fare: number;
  notes?: string;
  is_daily?: boolean;
  recurring_days?: string;
}

export type CallStatus = 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed';

export interface RideCall {
  id: string;
  ride_id: string;
  caller_id: string;
  receiver_id: string;
  status: CallStatus;
  started_at: string;
  connected_at?: string;
  ended_at?: string;
  duration_seconds: number;
  created_at: string;
  caller?: UserPublic;
  receiver?: UserPublic;
}


