import type { ProfileReviewsResponse, PassengerPost, CreatePassengerPostRequest } from '@/lib/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const json = await response.json();

    if (!response.ok) {
      return { data: null, error: json.error || json.message || 'Something went wrong' };
    }

    return { data: json.data ?? json, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}

export const api = {
  // 2Factor OTP Auth Gateway
  sendOtp: (phone: string) =>
    request<{ session_id: string; message: string }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (body: { phone: string; session_id: string; otp: string; full_name?: string; city?: string }) =>
    request<{ token?: string; user?: any; is_new_user?: boolean; session_id?: string; phone?: string; message?: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  registerOtp: (body: { phone: string; session_id: string; full_name: string; city: string }) =>
    request<{ token: string; user: any; is_new_user: boolean }>('/auth/register-otp', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Legacy fallback
  signup: (body: { email?: string; phone: string; password?: string; full_name: string; city: string }) =>
    request<{ token: string; user: any }>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { identifier?: string; email?: string; phone?: string; password?: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  refreshToken: () =>
    request<{ token: string; user: any }>('/auth/refresh', { method: 'POST' }),

  // Profile
  getProfile: () => request<any>('/profile'),

  updateProfile: (body: {
    full_name?: string;
    phone?: string;
    city?: string;
    avatar_url?: string;
    bio?: string;
    gender?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    is_driver?: boolean;
  }) => request<any>('/profile', { method: 'PUT', body: JSON.stringify(body) }),

  // Verification
  submitDL: (body: { dl_number: string; dl_image_url?: string }) =>
    request<any>('/profile/verify-dl', { method: 'POST', body: JSON.stringify(body) }),

  submitRC: (body: {
    rc_number: string;
    rc_image_url?: string;
    vehicle_type?: string;
    vehicle_make: string;
    vehicle_model: string;
    vehicle_year: string;
    vehicle_color: string;
    vehicle_plate: string;
  }) => request<any>('/profile/verify-rc', { method: 'POST', body: JSON.stringify(body) }),

  getVerificationStatus: () => request<any>('/profile/verification-status'),

  // Rides
  searchRides: (params: { city?: string; origin?: string; destination?: string; vehicle_type?: string }) => {
    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v) cleanParams[k] = v;
    }
    const qs = new URLSearchParams(cleanParams).toString();
    return request<any[]>(`/rides?${qs}`);
  },

  createRide: (body: any) =>
    request<any>('/rides', { method: 'POST', body: JSON.stringify(body) }),

  getRide: (id: string) => request<any>(`/rides/${id}`),

  updateRideStatus: (id: string, status: string) =>
    request<any>(`/rides/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  updateDriverLocation: (id: string, lat: number, lng: number) =>
    request<any>(`/rides/${id}/location`, { method: 'PUT', body: JSON.stringify({ lat, lng }) }),

  // Ride Requests
  createRideRequest: (
    rideId: string,
    body: {
      seats_requested: number;
      pickup_point: string;
      pickup_lat?: number;
      pickup_lng?: number;
    }
  ) =>
    request<any>(`/rides/${rideId}/request`, { method: 'POST', body: JSON.stringify(body) }),

  updateRequestStatus: (requestId: string, status: string) =>
    request<any>(`/requests/${requestId}`, { method: 'PUT', body: JSON.stringify({ status }) }),

  deleteRequest: (requestId: string) =>
    request<any>(`/requests/${requestId}`, { method: 'DELETE' }),

  // Chat Messages
  getChatMessages: (rideId: string) =>
    request<any[]>(`/rides/${rideId}/messages`),

  sendChatMessage: (rideId: string, content: string) =>
    request<any>(`/rides/${rideId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // In-App Calling (Rider <-> Passenger Only, Strictly Closed Post-Ride)
  initiateRideCall: (rideId: string, receiverId?: string) =>
    request<any>(`/rides/${rideId}/call/initiate`, { method: 'POST', body: JSON.stringify({ receiver_id: receiverId }) }),

  getActiveRideCall: (rideId: string) =>
    request<{ active: boolean; call: any }>(`/rides/${rideId}/call/active`),

  getActiveIncomingCall: () =>
    request<{ active: boolean; call: any }>('/calls/active-incoming'),

  updateRideCallStatus: (rideId: string, callId: string, status: 'connected' | 'ended' | 'rejected') =>
    request<any>(`/rides/${rideId}/call/${callId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  sendCallSignal: (rideId: string, callId: string, type: 'offer' | 'answer' | 'candidate', payload: string) =>
    request<any>(`/rides/${rideId}/call/${callId}/signal`, { method: 'POST', body: JSON.stringify({ type, payload }) }),

  getCallSignals: (rideId: string, callId: string, afterId?: string) =>
    request<any[]>(`/rides/${rideId}/call/${callId}/signals${afterId ? `?after=${afterId}` : ''}`),

  // Payment
  confirmPayment: (rideId: string, body: { passenger_id: string; payment_method: string }) =>
    request<any>(`/rides/${rideId}/complete-payment`, { method: 'POST', body: JSON.stringify(body) }),

  // Trips
  getMyTrips: () => request<any[]>('/trips'),

  // Ratings & Reviews
  createRating: (body: { ride_id: string; ratee_id: string; score: number; comment: string }) =>
    request<any>('/ratings', { method: 'POST', body: JSON.stringify(body) }),

  getProfileReviews: (userId?: string) =>
    request<ProfileReviewsResponse>(`/profile/reviews${userId ? `?user_id=${userId}` : ''}`),

  // Cities
  getCities: () => request<any[]>('/cities'),

  // Notifications
  registerPushToken: (token: string) =>
    request<any>('/notifications/register', { method: 'POST', body: JSON.stringify({ token }) }),

  getNotifications: (limit?: number) =>
    request<any>(`/notifications${limit ? `?limit=${limit}` : ''}`),

  markNotificationRead: (id: string) =>
    request<any>(`/notifications/${id}/read`, { method: 'PUT' }),

  markAllNotificationsRead: () =>
    request<any>('/notifications/read-all', { method: 'PUT' }),

  getUnreadCount: () => request<{ unread_count: number }>('/notifications/unread-count'),

  // Passenger Posts (Need a Drop / Travel Requests)
  createPassengerPost: (body: CreatePassengerPostRequest) =>
    request<PassengerPost>('/passenger-posts', { method: 'POST', body: JSON.stringify(body) }),

  getPassengerPosts: (params?: { city?: string; origin?: string; destination?: string; vehicle_preference?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) cleanParams[k] = v;
      }
    }
    const qs = new URLSearchParams(cleanParams).toString();
    return request<PassengerPost[]>(`/passenger-posts${qs ? `?${qs}` : ''}`);
  },

  getMyPassengerPosts: () => request<PassengerPost[]>('/passenger-posts/my'),

  getPassengerPost: (id: string) => request<PassengerPost>(`/passenger-posts/${id}`),

  acceptPassengerPost: (id: string) =>
    request<PassengerPost>(`/passenger-posts/${id}/accept`, { method: 'POST' }),

  completePassengerPost: (id: string) =>
    request<{ message: string }>(`/passenger-posts/${id}/complete`, { method: 'PUT' }),

  cancelPassengerPost: (id: string) =>
    request<{ message: string }>(`/passenger-posts/${id}/cancel`, { method: 'PUT' }),
};
