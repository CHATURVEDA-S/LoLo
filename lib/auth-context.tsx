import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken } from './api';
import type { User } from './types';
import { registerPushNotifications } from './notifications';
import { triggerNotificationSoundAlert } from './sound-alert';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  unreadNotificationsCount: number;
  setUnreadNotificationsCount: (count: number) => void;
  sendOtp: (phone: string) => Promise<{ session_id?: string; error?: string }>;
  verifyOtp: (
    phone: string,
    sessionId: string,
    otp: string,
    profileData?: { full_name: string; city: string }
  ) => Promise<{ success: boolean; is_new_user?: boolean; error?: string }>;
  completeOtpRegistration: (
    phone: string,
    sessionId: string,
    fullName: string,
    city: string
  ) => Promise<{ success: boolean; error?: string }>;
  login: (identifier: string, password?: string) => Promise<string | null>;
  signup: (data: { email?: string; phone: string; password?: string; full_name: string; city: string }) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  unreadNotificationsCount: 0,
  setUnreadNotificationsCount: () => {},
  sendOtp: async () => ({ error: 'Not initialized' }),
  verifyOtp: async () => ({ success: false, error: 'Not initialized' }),
  completeOtpRegistration: async () => ({ success: false, error: 'Not initialized' }),
  login: async () => null,
  signup: async () => null,
  logout: async () => {},
  refreshProfile: async () => {},
});

const TOKEN_KEY = 'lo_ride_auth_token_v1';
const USER_KEY = 'lo_ride_user_data_v1';

async function saveToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(TOKEN_KEY, token);
      }
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  } catch (err) {
    console.warn('Failed to save auth token:', err);
  }
}

async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(TOKEN_KEY);
      }
      return null;
    } else {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    }
  } catch (err) {
    console.warn('Failed to load auth token:', err);
    return null;
  }
}

async function deleteToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch (err) {
    console.warn('Failed to delete auth token:', err);
  }
}

async function saveUser(userData: User): Promise<void> {
  try {
    const serialized = JSON.stringify(userData);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(USER_KEY, serialized);
      }
    } else {
      await SecureStore.setItemAsync(USER_KEY, serialized);
    }
  } catch (err) {
    console.warn('Failed to save user data:', err);
  }
}

async function loadUser(): Promise<User | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(USER_KEY);
      }
    } else {
      raw = await SecureStore.getItemAsync(USER_KEY);
    }
    return raw ? (JSON.parse(raw) as User) : null;
  } catch (err) {
    console.warn('Failed to load user data:', err);
    return null;
  }
}

async function deleteUser(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(USER_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  } catch (err) {
    console.warn('Failed to delete user data:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const lastUnreadCountRef = useRef(-1);

  // Restore session on app launch / mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const [savedToken, savedUser] = await Promise.all([loadToken(), loadUser()]);
        if (savedToken) {
          setAuthToken(savedToken);
          setToken(savedToken);
          if (savedUser && isMounted) {
            setUser(savedUser);
          }

          const { data, error } = await api.getProfile();
          if (data && isMounted) {
            const profile = data as User;
            setUser(profile);
            saveUser(profile).catch(() => {});
          } else if (error && isMounted) {
            const errStr = error.toLowerCase();
            // ONLY log out if the server explicitly rejects the token as invalid or expired
            const isAuthRejection =
              errStr.includes('unauthorized') ||
              errStr.includes('invalid token') ||
              errStr.includes('token expired');

            if (isAuthRejection) {
              await Promise.all([deleteToken(), deleteUser()]);
              setAuthToken(null);
              setUser(null);
              setToken(null);
            } else {
              // Network error or server offline: preserve cached user and token!
              console.log('Preserving session during network glitch/offline:', error);
            }
          }
        }
      } catch (e) {
        console.warn('Session restore error:', e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Automatically request permission and register mobile push token when logged in
  useEffect(() => {
    if (user && token) {
      registerPushNotifications().catch(() => {});
    }
  }, [user?.id, token]);

  // Periodic in-app notifications poller: updates unread count & plays chime on new alerts
  useEffect(() => {
    if (!user || !token) {
      setUnreadNotificationsCount(0);
      lastUnreadCountRef.current = -1;
      return;
    }

    let isSubscribed = true;

    async function pollNotifications() {
      try {
        const { data } = await api.getUnreadCount();
        if (data && isSubscribed) {
          const count = (data as any).unread_count ?? 0;
          // If unread notifications increased while user is in app, play audible chime!
          if (count > lastUnreadCountRef.current && lastUnreadCountRef.current >= 0) {
            const notifRes = await api.getNotifications(1);
            const latest = (notifRes.data as any)?.notifications?.[0];
            if (latest) {
              triggerNotificationSoundAlert(latest.title, latest.body, {
                id: latest.id,
                ride_id: latest.ride_id,
              });
            }
          }
          lastUnreadCountRef.current = count;
          setUnreadNotificationsCount(count);
        }
      } catch (_) {}
    }

    pollNotifications();
    const interval = setInterval(pollNotifications, 6000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [user?.id, token]);

  const sendOtp = useCallback(async (phone: string): Promise<{ session_id?: string; error?: string }> => {
    const { data, error } = await api.sendOtp(phone);
    if (error || !data) {
      return { error: error || 'Failed to send OTP' };
    }
    return { session_id: (data as any).session_id };
  }, []);

  const verifyOtp = useCallback(async (
    phone: string,
    sessionId: string,
    otp: string,
    profileData?: { full_name: string; city: string }
  ): Promise<{ success: boolean; is_new_user?: boolean; error?: string }> => {
    const { data, error } = await api.verifyOtp({
      phone,
      session_id: sessionId,
      otp,
      full_name: profileData?.full_name,
      city: profileData?.city,
    });

    if (error || !data) {
      return { success: false, error: error || 'Invalid OTP' };
    }

    const res = data as any;
    if (res.is_new_user && !res.token) {
      return { success: true, is_new_user: true };
    }

    if (res.token && res.user) {
      await Promise.all([saveToken(res.token), saveUser(res.user)]);
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
      return { success: true, is_new_user: res.is_new_user ?? false };
    }

    return { success: false, error: 'Unexpected response from server' };
  }, []);

  const completeOtpRegistration = useCallback(async (
    phone: string,
    sessionId: string,
    fullName: string,
    city: string
  ): Promise<{ success: boolean; error?: string }> => {
    const { data, error } = await api.registerOtp({
      phone,
      session_id: sessionId,
      full_name: fullName,
      city,
    });

    if (error || !data) {
      return { success: false, error: error || 'Failed to create profile' };
    }

    const res = data as any;
    if (res.token && res.user) {
      await Promise.all([saveToken(res.token), saveUser(res.user)]);
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
      return { success: true };
    }

    return { success: false, error: 'Failed to complete registration' };
  }, []);

  const login = useCallback(async (identifier: string, password?: string): Promise<string | null> => {
    const { data, error } = await api.login({ identifier, password });
    if (error || !data) return error || 'Login failed';

    const authData = data as any;
    await Promise.all([saveToken(authData.token), saveUser(authData.user)]);
    setAuthToken(authData.token);
    setToken(authData.token);
    setUser(authData.user);
    return null;
  }, []);

  const signup = useCallback(async (signupData: { email?: string; phone: string; password?: string; full_name: string; city: string }): Promise<string | null> => {
    const { data, error } = await api.signup(signupData);
    if (error || !data) return error || 'Signup failed';

    const authData = data as any;
    await Promise.all([saveToken(authData.token), saveUser(authData.user)]);
    setAuthToken(authData.token);
    setToken(authData.token);
    setUser(authData.user);
    return null;
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([deleteToken(), deleteUser()]);
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.getProfile();
    if (data) {
      const profile = data as User;
      setUser(profile);
      saveUser(profile).catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        unreadNotificationsCount,
        setUnreadNotificationsCount,
        sendOtp,
        verifyOtp,
        completeOtpRegistration,
        login,
        signup,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
