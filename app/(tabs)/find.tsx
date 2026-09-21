import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  Clock,
  Search,
  Car,
  Bike,
  Users,
  Star,
  X,
  RefreshCw,
  Crosshair,
  Sparkles,
  ChevronRight,
  Navigation,
  MapPin,
  Calendar,
  Share2,
} from 'lucide-react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Ride, VehicleType, PassengerPost, DriverVerification } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RoutePreviewMap from '@/components/RoutePreviewMap';
import LocationPicker, { type LocationResult } from '@/components/LocationPicker';
import { calculateFare, calculateDistanceKm } from '@/lib/fare-calculator';

export default function FindRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Mode: Available Rides vs Passenger Drop Requests
  const [activeTab, setActiveTab] = useState<'rides' | 'requests'>(
    params.tab === 'requests' ? 'requests' : 'rides'
  );

  useEffect(() => {
    if (params.tab === 'requests' || params.tab === 'rides') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  const [verification, setVerification] = useState<DriverVerification | null>(null);

  // Driver vehicle capability checks
  const primaryType = verification?.vehicle_type;
  const secondaryType = verification?.secondary_vehicle_type;
  const hasPrimary = Boolean(verification?.rc_status === 'verified' || verification?.rc_number);
  const hasSecondary = Boolean(verification?.secondary_rc_status === 'verified' || verification?.secondary_rc_number);

  const hasBike = (hasPrimary && primaryType === 'bike') || (hasSecondary && secondaryType === 'bike');
  const hasCar = (hasPrimary && primaryType === 'car') || (hasSecondary && secondaryType === 'car');
  const defaultVehicleType: VehicleType = hasBike && !hasCar ? 'bike' : 'car';

  // Search & Route State
  const [origin, setOrigin] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);

  // LocationPicker modal toggles
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);

  // Vehicle Selection: 'car' or 'bike'
  const [selectedVehicle, setSelectedVehicle] = useState<'car' | 'bike'>('car');

  // Schedule Departure Date & Time
  const [departureDate, setDepartureDate] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d;
  });

  // Database rides & passenger requests state
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [passengerPosts, setPassengerPosts] = useState<PassengerPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [acceptingPostId, setAcceptingPostId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showMatchesList, setShowMatchesList] = useState(false);

  // Load driver verification details
  useEffect(() => {
    async function loadDriverVerification() {
      try {
        const { data } = await api.getVerificationStatus();
        if (data) {
          const v = data as DriverVerification;
          setVerification(v);
          const pType = v.vehicle_type;
          const sType = v.secondary_vehicle_type;
          const pValid = Boolean(v.rc_status === 'verified' || v.rc_number);
          const sValid = Boolean(v.secondary_rc_status === 'verified' || v.secondary_rc_number);
          const isB = (pValid && pType === 'bike') || (sValid && sType === 'bike');
          const isC = (pValid && pType === 'car') || (sValid && sType === 'car');
          if (isB && !isC) {
            setSelectedVehicle('bike');
          } else if (isC && !isB) {
            setSelectedVehicle('car');
          }
        }
      } catch {}
    }
    loadDriverVerification();
  }, []);

  // Auto-detect GPS location on mount for origin
  useEffect(() => {
    useCurrentLocationForOrigin(false);
  }, []);

  async function useCurrentLocationForOrigin(forceAlert = true) {
    setDetectingGps(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') {
        if (forceAlert) {
          Alert.alert('Permission Denied', 'Please enable location permissions to auto-detect your pickup point.');
        }
        setDetectingGps(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setOriginCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo) {
        const parts = [geo.name, geo.street, geo.subregion || geo.district, geo.city].filter(Boolean);
        setOrigin(parts.length > 0 ? parts.join(', ') : `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      }
    } catch (e) {
      console.log('GPS error:', e);
    } finally {
      setDetectingGps(false);
    }
  }

  // Geocode destination when typed
  async function resolveDestinationCoords(text: string) {
    if (!text.trim()) {
      setDestCoords(null);
      return;
    }
    try {
      const results = await Location.geocodeAsync(text.trim());
      if (results && results.length > 0) {
        setDestCoords({ lat: results[0].latitude, lng: results[0].longitude });
      }
    } catch {}
  }

  // Fetch real database rides
  async function fetchRides() {
    setLoadingRides(true);
    try {
      const { data } = await api.searchRides({
        city: user?.city,
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
      });
      setAllRides((data as Ride[]) ?? []);
    } catch (e) {
      console.log('Error searching rides:', e);
    } finally {
      setLoadingRides(false);
    }
  }

  // Fetch passenger posts
  async function fetchPassengerPosts() {
    setLoadingPosts(true);
    try {
      const pref = hasBike && !hasCar ? 'bike' : hasCar && !hasBike ? 'car' : selectedVehicle;
      const { data } = await api.getPassengerPosts({
        city: user?.city,
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
        vehicle_preference: pref,
      });
      const filtered = (data || []).filter((p) => p.vehicle_preference === pref);
      setPassengerPosts(filtered);
    } catch (e) {
      console.log('Error loading passenger posts:', e);
    } finally {
      setLoadingPosts(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'rides') {
        fetchRides();
      } else {
        fetchPassengerPosts();
      }
    }, [activeTab, user?.city, origin, destination, selectedVehicle])
  );

  // Dynamic Carpool vs Bikepool counts & fare calculation
  const carpoolRides = useMemo(
    () => allRides.filter((r) => r.vehicle_type === 'car'),
    [allRides]
  );
  const bikepoolRides = useMemo(
    () => allRides.filter((r) => r.vehicle_type === 'bike'),
    [allRides]
  );

  const carpoolCount = carpoolRides.length;
  const bikepoolCount = bikepoolRides.length;

  // Real distance calculation
  const routeDistanceKm = useMemo(() => {
    if (originCoords && destCoords) {
      return calculateDistanceKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
    }
    return 8.5; // fallback average city commute distance
  }, [originCoords, destCoords]);

  // Dynamic Fare estimates without hardcoding
  const carpoolFare = useMemo(() => {
    if (carpoolRides.length > 0) {
      const min = Math.min(...carpoolRides.map((r) => r.price_per_seat));
      if (min > 0) return min;
    }
    return calculateFare({ distanceKm: routeDistanceKm, vehicleType: 'car' }).suggestedFare;
  }, [carpoolRides, routeDistanceKm]);

  const bikepoolFare = useMemo(() => {
    if (bikepoolRides.length > 0) {
      const min = Math.min(...bikepoolRides.map((r) => r.price_per_seat));
      if (min > 0) return min;
    }
    return calculateFare({ distanceKm: routeDistanceKm, vehicleType: 'bike' }).suggestedFare;
  }, [bikepoolRides, routeDistanceKm]);

  // Format schedule text (e.g., "10:00 AM, Tomorrow")
  function formatSchedule(d: Date) {
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    if (isToday) return `${timeStr}, Today`;
    if (isTomorrow) return `${timeStr}, Tomorrow`;
    return `${timeStr}, ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
  }

  // Open native Android date & time picker
  function handleOpenDateTimePicker() {
    if (Platform.OS === 'android') {
      const today = new Date();
      DateTimePickerAndroid.open({
        value: departureDate,
        minimumDate: today,
        mode: 'date',
        onChange: (e, date) => {
          if (e.type === 'set' && date) {
            DateTimePickerAndroid.open({
              value: date,
              mode: 'time',
              is24Hour: false,
              onChange: (e2, time) => {
                if (e2.type === 'set' && time) {
                  const combined = new Date(date);
                  combined.setHours(time.getHours(), time.getMinutes());
                  setDepartureDate(combined);
                }
              },
            });
          }
        },
      });
    } else {
      Alert.alert('Departure Time', `Selected: ${formatSchedule(departureDate)}`);
    }
  }

  // Handle View Matches button tap
  function handleViewMatchesPress() {
    setShowMatchesList(true);
    fetchRides();
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }

  // Handle accepting a passenger post
  async function handleAcceptPost(post: PassengerPost) {
    Alert.alert(
      'Accept Drop Request',
      `Offer a drop to ${post.passenger?.full_name || 'the passenger'} for ₹${post.suggested_fare}?\n\nRoute: ${post.origin} ➔ ${post.destination}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Drop',
          style: 'default',
          onPress: async () => {
            setAcceptingPostId(post.id);
            const { error } = await api.acceptPassengerPost(post.id);
            setAcceptingPostId(null);
            if (error) {
              Alert.alert('Unable to Accept', error);
              return;
            }
            Alert.alert(
              'Drop Accepted! 🎉',
              `You have accepted the drop request. A live push notification has been sent to the passenger!`,
              [{ text: 'OK', onPress: () => fetchPassengerPosts() }]
            );
          },
        },
      ]
    );
  }

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 72;
  const activeMatches = selectedVehicle === 'car' ? carpoolRides : bikepoolRides;
  const activeMatchCount = selectedVehicle === 'car' ? carpoolCount : bikepoolCount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. TOP ROUTE INPUT BAR */}
      <View style={styles.topRouteBar}>
        <View style={styles.headerTopRow}>
          <Text style={styles.cityBadgeText}>📍 {user?.city || 'Your City'}</Text>

          {/* Mode Switcher: Available Rides vs Drop Requests */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'rides' && styles.modeTabActive]}
              onPress={() => setActiveTab('rides')}
              activeOpacity={0.8}
            >
              <Car size={13} color={activeTab === 'rides' ? '#ffffff' : Colors.neutral[600]} />
              <Text style={[styles.modeTabText, activeTab === 'rides' && styles.modeTabTextActive]}>
                Find Ride
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'requests' && styles.modeTabActive]}
              onPress={() => {
                setActiveTab('requests');
                fetchPassengerPosts();
              }}
              activeOpacity={0.8}
            >
              <Navigation size={13} color={activeTab === 'requests' ? '#ffffff' : Colors.neutral[600]} />
              <Text style={[styles.modeTabText, activeTab === 'requests' && styles.modeTabTextActive]}>
                Drop Requests
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Origin & Destination Inputs Card */}
        <View style={styles.inputsCard}>
          {/* Origin Row */}
          <View style={styles.inputRow}>
            <View style={styles.originRing} />
            <TextInput
              style={styles.inputField}
              placeholder="Enter pickup point (or tap GPS)"
              placeholderTextColor="#94a3b8"
              value={origin}
              onChangeText={(text) => {
                setOrigin(text);
                if (!text.trim()) setOriginCoords(null);
              }}
              onBlur={() => {
                if (origin.trim() && !originCoords) {
                  Location.geocodeAsync(origin.trim()).then((res) => {
                    if (res && res[0]) setOriginCoords({ lat: res[0].latitude, lng: res[0].longitude });
                  }).catch(() => {});
                }
              }}
            />
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={() => useCurrentLocationForOrigin(true)}
              disabled={detectingGps}
              activeOpacity={0.7}
            >
              {detectingGps ? (
                <ActivityIndicator size="small" color="#0284c7" />
              ) : (
                <Crosshair size={15} color="#0284c7" strokeWidth={2.4} />
              )}
              <Text style={styles.gpsBtnText}>GPS</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputDivider} />

          {/* Destination Row */}
          <View style={styles.inputRow}>
            <View style={styles.destPinDot} />
            <TextInput
              style={styles.inputField}
              placeholder="Where are you going?"
              placeholderTextColor="#94a3b8"
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                resolveDestinationCoords(text);
              }}
              onBlur={() => resolveDestinationCoords(destination)}
            />
            {destination.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setDestination('');
                  setDestCoords(null);
                }}
              >
                <X size={15} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: bottomAutoPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (activeTab === 'rides') {
                fetchRides().finally(() => setRefreshing(false));
              } else {
                fetchPassengerPosts().finally(() => setRefreshing(false));
              }
            }}
          />
        }
      >
        {/* ========================================================== */}
        {/* MODE 1: ROUTE MAP & VEHICLE MATCHING (MATCHING SCREENSHOT) */}
        {/* ========================================================== */}
        {activeTab === 'rides' ? (
          <>
            {/* 2. LIGHT MINIMAL SKY BLUE ROUTE MAP */}
            <View style={styles.mapContainer}>
              <RoutePreviewMap
                originLat={originCoords?.lat}
                originLng={originCoords?.lng}
                originName={origin || 'Pickup'}
                destLat={destCoords?.lat}
                destLng={destCoords?.lng}
                destName={destination || 'Destination'}
                height={260}
                onPlusPress={() => router.push('/passenger-post/create')}
              />
            </View>

            {/* 3. SCHEDULE STRIP (TIME & DATE) */}
            <TouchableOpacity
              style={styles.scheduleStrip}
              onPress={handleOpenDateTimePicker}
              activeOpacity={0.8}
            >
              <Clock size={16} color="#0f172a" strokeWidth={2.4} />
              <Text style={styles.scheduleText}>{formatSchedule(departureDate)}</Text>
            </TouchableOpacity>

            {/* 4. VEHICLE SELECTION CARDS */}
            <View style={styles.vehicleOptionsContainer}>
              {/* CARPOOL CARD */}
              <TouchableOpacity
                style={[
                  styles.vehicleCard,
                  selectedVehicle === 'car' && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedVehicle('car')}
                activeOpacity={0.88}
              >
                {/* Visual Vehicle Graphic */}
                <View style={styles.vehicleGraphicWrap}>
                  <View style={styles.carGraphicCircle}>
                    <Car size={26} color="#0284c7" strokeWidth={2.2} />
                    <View style={styles.miniCommuterDot}>
                      <Users size={11} color="#ffffff" strokeWidth={2.5} />
                    </View>
                  </View>
                </View>

                {/* Info Text */}
                <View style={styles.vehicleInfoWrap}>
                  <Text style={styles.vehicleTitle}>Carpool</Text>
                  <Text style={styles.vehicleSubtitle} numberOfLines={1}>
                    {carpoolCount > 0
                      ? `${carpoolCount} other ${carpoolCount === 1 ? 'sRider' : 'sRiders'} on the way`
                      : 'Looking for riders'}
                  </Text>
                </View>

                {/* Real Dynamic Price */}
                <View style={styles.vehiclePriceWrap}>
                  <Text style={styles.vehiclePriceText}>₹{carpoolFare}</Text>
                </View>
              </TouchableOpacity>

              {/* BIKEPOOL CARD */}
              <TouchableOpacity
                style={[
                  styles.vehicleCard,
                  selectedVehicle === 'bike' && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedVehicle('bike')}
                activeOpacity={0.88}
              >
                {/* Visual Vehicle Graphic */}
                <View style={styles.vehicleGraphicWrap}>
                  <View style={[styles.carGraphicCircle, { backgroundColor: '#f0fdf4' }]}>
                    <Bike size={26} color="#16a34a" strokeWidth={2.2} />
                  </View>
                </View>

                {/* Info Text */}
                <View style={styles.vehicleInfoWrap}>
                  <Text style={styles.vehicleTitle}>Bikepool</Text>
                  <Text style={styles.vehicleSubtitle} numberOfLines={1}>
                    {bikepoolCount > 0
                      ? `${bikepoolCount} other ${bikepoolCount === 1 ? 'sRider' : 'sRiders'} on the way`
                      : 'Looking for riders'}
                  </Text>
                </View>

                {/* Real Dynamic Price */}
                <View style={styles.vehiclePriceWrap}>
                  <Text style={styles.vehiclePriceText}>₹{bikepoolFare}</Text>
                </View>
              </TouchableOpacity>

              {/* TAXIPOOL CARD */}
              <View style={[styles.vehicleCard, styles.vehicleCardDisabled]}>
                <View style={styles.vehicleGraphicWrap}>
                  <View style={[styles.carGraphicCircle, { backgroundColor: '#fefce8' }]}>
                    <Car size={26} color="#ca8a04" strokeWidth={2.2} />
                  </View>
                </View>
                <View style={styles.vehicleInfoWrap}>
                  <Text style={[styles.vehicleTitle, { color: '#64748b' }]}>Taxipool</Text>
                  <Text style={styles.noMatchesText}>No Matches Found</Text>
                </View>
                <View style={styles.vehiclePriceWrap}>
                  <Text style={[styles.vehiclePriceText, { color: '#94a3b8' }]}>—</Text>
                </View>
              </View>
            </View>

            {/* 5. PRIMARY CTA BUTTON (MATCHING REFERENCE DESIGN) */}
            <View style={styles.ctaButtonWrapper}>
              <TouchableOpacity
                style={styles.primaryCtaButton}
                onPress={handleViewMatchesPress}
                activeOpacity={0.88}
              >
                <Text style={styles.primaryCtaButtonText}>
                  View {selectedVehicle === 'car' ? 'Carpool' : 'Bikepool'} Matches
                </Text>
                {activeMatchCount > 0 && (
                  <View style={styles.ctaMatchBadge}>
                    <Text style={styles.ctaMatchBadgeText}>{activeMatchCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* 6. LIVE MATCHING RIDES LIST (EXPANDED ON BUTTON PRESS OR WHEN SEARCHED) */}
            {showMatchesList && (
              <View style={styles.matchesSection}>
                <View style={styles.matchesSectionHeader}>
                  <Text style={styles.matchesSectionTitle}>
                    Available {selectedVehicle === 'car' ? 'Carpool' : 'Bikepool'} Rides
                  </Text>
                  <Text style={styles.matchesSectionCount}>
                    {activeMatchCount} {activeMatchCount === 1 ? 'driver' : 'drivers'} active
                  </Text>
                </View>

                {loadingRides ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color="#0284c7" />
                    <Text style={styles.loadingText}>Searching verified commuters...</Text>
                  </View>
                ) : activeMatches.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>
                      No direct {selectedVehicle === 'car' ? 'carpool' : 'bikepool'} scheduled yet
                    </Text>
                    <Text style={styles.emptyDesc}>
                      You can post a "Need a Drop" request so nearby verified drivers commuting on this route can offer you a drop!
                    </Text>
                    <TouchableOpacity
                      style={styles.postDropButton}
                      onPress={() => router.push('/passenger-post/create')}
                      activeOpacity={0.85}
                    >
                      <Sparkles size={16} color="#ffffff" />
                      <Text style={styles.postDropButtonText}>+ Need a Drop? Post Request</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  activeMatches.map((ride) => (
                    <TouchableOpacity
                      key={ride.id}
                      style={styles.matchCard}
                      onPress={() =>
                        router.push(
                          `/ride/${ride.id}${origin.trim() ? `?pickup=${encodeURIComponent(origin.trim())}` : ''}`
                        )
                      }
                      activeOpacity={0.88}
                    >
                      {/* Top: Route & Price */}
                      <View style={styles.matchCardTop}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.matchRouteRow}>
                            <View style={styles.dotGreenMini} />
                            <Text style={styles.matchRouteText} numberOfLines={1}>
                              {ride.origin}
                            </Text>
                          </View>
                          <View style={styles.matchRouteRow}>
                            <View style={styles.dotRedMini} />
                            <Text style={styles.matchRouteText} numberOfLines={1}>
                              {ride.destination}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.matchPriceText}>₹{ride.price_per_seat}</Text>
                      </View>

                      {/* Middle: Driver Info & Time */}
                      <View style={styles.matchCardMiddle}>
                        <View style={styles.driverMetaRow}>
                          {ride.driver?.avatar_url ? (
                            <Image source={{ uri: ride.driver.avatar_url }} style={styles.driverAvatarMini} />
                          ) : (
                            <View style={styles.driverAvatarFallbackMini}>
                              <Text style={styles.driverAvatarFallbackMiniText}>
                                {(ride.driver?.full_name || 'D').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View>
                            <Text style={styles.driverNameText}>{ride.driver?.full_name || 'Driver'}</Text>
                            {ride.driver && ride.driver.avg_rating > 0 && (
                              <View style={styles.starRow}>
                                <Star size={10} color="#f59e0b" fill="#f59e0b" />
                                <Text style={styles.starText}>{ride.driver.avg_rating.toFixed(1)}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={styles.timePill}>
                          <Clock size={12} color="#0284c7" />
                          <Text style={styles.timePillText}>
                            {new Date(ride.departure_time).toLocaleTimeString('en-IN', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>

                        <View style={styles.seatsPill}>
                          <Users size={12} color="#16a34a" />
                          <Text style={styles.seatsPillText}>
                            {ride.seats_available} {ride.vehicle_type === 'bike' ? 'pillion' : 'seat'} left
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </>
        ) : (
          /* ========================================================== */
          /* MODE 2: PASSENGER DROP REQUESTS                            */
          /* ========================================================== */
          <View style={styles.passengerRequestsSection}>
            <TouchableOpacity
              style={styles.postRequestBanner}
              onPress={() => router.push('/passenger-post/create')}
              activeOpacity={0.85}
            >
              <View style={styles.postRequestIcon}>
                <Sparkles size={18} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postRequestTitle}>Need a Drop? Post Your Route</Text>
                <Text style={styles.postRequestSub}>
                  Post your pickup & drop-off points so verified drivers commuting along your route can offer you a drop!
                </Text>
              </View>
              <ChevronRight size={18} color="#0284c7" />
            </TouchableOpacity>

            {loadingPosts ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#0284c7" />
                <Text style={styles.loadingText}>Loading live drop requests...</Text>
              </View>
            ) : passengerPosts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Navigation size={42} color="#94a3b8" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>No Drop Requests Found</Text>
                <Text style={styles.emptyDesc}>
                  No passenger travel requests open right now in {user?.city || 'your city'}.
                </Text>
                <TouchableOpacity
                  style={styles.postDropButton}
                  onPress={() => router.push('/passenger-post/create')}
                  activeOpacity={0.85}
                >
                  <Sparkles size={16} color="#ffffff" />
                  <Text style={styles.postDropButtonText}>Post First Drop Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              passengerPosts.map((post) => (
                <TouchableOpacity
                  key={post.id}
                  style={styles.matchCard}
                  onPress={() => router.push(`/passenger-post/${post.id}`)}
                  activeOpacity={0.88}
                >
                  <View style={styles.matchCardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.matchRouteRow}>
                        <View style={styles.dotGreenMini} />
                        <Text style={styles.matchRouteText} numberOfLines={1}>
                          {post.origin}
                        </Text>
                      </View>
                      <View style={styles.matchRouteRow}>
                        <View style={styles.dotRedMini} />
                        <Text style={styles.matchRouteText} numberOfLines={1}>
                          {post.destination}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.matchPriceText}>₹{post.suggested_fare}</Text>
                  </View>

                  <View style={styles.matchCardMiddle}>
                    <View style={styles.driverMetaRow}>
                      <View style={[styles.driverAvatarFallbackMini, { backgroundColor: '#e0f2fe' }]}>
                        <Text style={[styles.driverAvatarFallbackMiniText, { color: '#0284c7' }]}>
                          {(post.passenger?.full_name || 'P').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.driverNameText}>{post.passenger?.full_name || 'Passenger'}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>
                          {post.vehicle_preference === 'bike' ? '🏍️ Prefers Bike' : '🚗 Prefers Car'}
                        </Text>
                      </View>
                    </View>

                    {post.status === 'open' && post.passenger_id !== user?.id && (
                      <TouchableOpacity
                        style={styles.acceptDropMiniBtn}
                        onPress={() => handleAcceptPost(post)}
                        disabled={acceptingPostId === post.id}
                        activeOpacity={0.8}
                      >
                        {acceptingPostId === post.id ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.acceptDropMiniBtnText}>Offer Drop</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topRouteBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...Shadow.sm,
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cityBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    padding: 3,
    gap: 4,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  modeTabActive: {
    backgroundColor: '#0284c7',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  modeTabTextActive: {
    color: '#ffffff',
  },
  inputsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
  },
  originRing: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.5,
    borderColor: '#0284c7',
    marginRight: 10,
  },
  destPinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 0,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gpsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  clearBtn: {
    padding: 4,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 2,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapContainer: {
    width: '100%',
    height: 260,
  },
  scheduleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  scheduleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  vehicleOptionsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  vehicleCardSelected: {
    borderColor: '#0f172a', // Clean black border matching screenshot
    borderWidth: 2,
    backgroundColor: '#ffffff',
  },
  vehicleCardDisabled: {
    opacity: 0.7,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  vehicleGraphicWrap: {
    marginRight: 14,
  },
  carGraphicCircle: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  miniCommuterDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfoWrap: {
    flex: 1,
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  vehicleSubtitle: {
    fontSize: 12,
    color: '#e11d48', // Soft reddish/coral matching screenshot
    fontWeight: '500',
  },
  noMatchesText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  vehiclePriceWrap: {
    paddingLeft: 8,
  },
  vehiclePriceText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  ctaButtonWrapper: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  primaryCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626', // Red CTA matching reference screenshot
    borderRadius: 10,
    height: 50,
    gap: 8,
    ...Shadow.sm,
  },
  primaryCtaButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  ctaMatchBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ctaMatchBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },
  matchesSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  matchesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchesSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  matchesSectionCount: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  postDropButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  postDropButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  matchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    ...Shadow.sm,
  },
  matchCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },
  dotGreenMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
    marginRight: 6,
  },
  dotRedMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  matchRouteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  matchPriceText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0284c7',
    marginLeft: 10,
  },
  matchCardMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  driverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  driverAvatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  driverAvatarFallbackMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarFallbackMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  driverNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  starText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
  },
  seatsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seatsPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16a34a',
  },
  passengerRequestsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  postRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 10,
  },
  postRequestIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postRequestTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 2,
  },
  postRequestSub: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  acceptDropMiniBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acceptDropMiniBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
