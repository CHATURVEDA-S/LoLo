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
  useWindowDimensions,
  LayoutAnimation,
  UIManager,
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
import LocationPicker, { type LocationResult, METRO_PLACES } from '@/components/LocationPicker';
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

  // Address search autocomplete state
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

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

  // Fast address search with instant local metro places + debounced Nominatim
  function handleSearchAddress(query: string, target: 'origin' | 'dest') {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      setSearchingAddress(false);
      return;
    }

    setActiveInput(target);
    const activeCity = user?.city || 'Hyderabad';
    const cityPlaces = (METRO_PLACES as any)[activeCity] || (METRO_PLACES as any)['Hyderabad'] || [];

    // 1. Instant local matching (0ms)
    const localMatches = cityPlaces
      .filter((p: any) => {
        const q = trimmed.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
      })
      .map((p: any) => ({
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
      }));

    setSuggestions(localMatches);

    // 2. Debounced online Nominatim & geocoding (200ms)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    const controller = new AbortController();
    searchAbortRef.current = controller;

    searchTimerRef.current = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const nomQuery = trimmed.toLowerCase().includes(activeCity.toLowerCase())
          ? trimmed
          : `${trimmed}, ${activeCity}`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nomQuery)}&format=json&addressdetails=1&limit=8&countrycodes=in`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'LoRideApp/1.0' },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const onlineList: Array<{ name: string; address: string; lat: number; lng: number }> = [];
            data.forEach((item: any) => {
              const lat = parseFloat(item.lat);
              const lng = parseFloat(item.lon);
              if (isNaN(lat) || isNaN(lng)) return;
              const rawName = item.name || item.display_name?.split(',')[0] || trimmed;
              const addr = item.address || {};
              const locality = addr.suburb || addr.neighbourhood || addr.city_district;
              const displayName = locality && !rawName.toLowerCase().includes(locality.toLowerCase())
                ? `${rawName}, ${locality}`
                : rawName;

              onlineList.push({
                name: displayName,
                address: item.display_name || `${activeCity}, India`,
                lat,
                lng,
              });
            });

            // Combine without duplicate coordinates
            const combined = [...localMatches];
            onlineList.forEach((item) => {
              const exists = combined.some(
                (c) => Math.abs(c.lat - item.lat) < 0.002 && Math.abs(c.lng - item.lng) < 0.002
              );
              if (!exists) combined.push(item);
            });
            setSuggestions(combined);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      } finally {
        setSearchingAddress(false);
      }
    }, 200);
  }

  function handleSelectSuggestion(item: { name: string; address: string; lat: number; lng: number }) {
    if (activeInput === 'origin') {
      setOrigin(item.name);
      setOriginCoords({ lat: item.lat, lng: item.lng });
    } else {
      setDestination(item.name);
      setDestCoords({ lat: item.lat, lng: item.lng });
    }
    setSuggestions([]);
    setActiveInput(null);
  }

  function handleClearOrigin() {
    setOrigin('');
    setOriginCoords(null);
    setSuggestions([]);
    if (activeInput === 'origin') setActiveInput(null);
  }

  function handleClearDest() {
    setDestination('');
    setDestCoords(null);
    setSuggestions([]);
    setShowMatchesList(false);
    if (activeInput === 'dest') setActiveInput(null);
  }

  // Geocode destination when typed and blurred
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

  // Check if route has both origin and destination set
  const hasRoute = Boolean(origin.trim() && destination.trim());

  // Real distance calculation (0 if no route is entered)
  const routeDistanceKm = useMemo(() => {
    if (originCoords && destCoords) {
      const dist = calculateDistanceKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
      return Math.max(0.5, Math.round(dist * 10) / 10);
    }
    return 0;
  }, [originCoords, destCoords]);

  // Dynamic Fare estimates without hardcoding (0 if no route is set)
  const carpoolFare = useMemo(() => {
    if (!hasRoute || routeDistanceKm <= 0) return 0;
    if (carpoolRides.length > 0) {
      const min = Math.min(...carpoolRides.map((r) => r.price_per_seat));
      if (min > 0) return min;
    }
    return calculateFare({ distanceKm: routeDistanceKm, vehicleType: 'car' }).suggestedFare;
  }, [hasRoute, carpoolRides, routeDistanceKm]);

  const bikepoolFare = useMemo(() => {
    if (!hasRoute || routeDistanceKm <= 0) return 0;
    if (bikepoolRides.length > 0) {
      const min = Math.min(...bikepoolRides.map((r) => r.price_per_seat));
      if (min > 0) return min;
    }
    return calculateFare({ distanceKm: routeDistanceKm, vehicleType: 'bike' }).suggestedFare;
  }, [hasRoute, bikepoolRides, routeDistanceKm]);

  // Full page map height before address selection, auto-adjusting compact height when address is selected
  const { height: windowHeight } = useWindowDimensions();
  const fullMapHeight = Math.max(380, windowHeight - insets.top - insets.bottom - 175);
  const mapHeight = hasRoute ? 230 : fullMapHeight;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hasRoute]);

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
                handleSearchAddress(text, 'origin');
              }}
              onFocus={() => {
                setActiveInput('origin');
                if (origin.trim().length >= 2) handleSearchAddress(origin, 'origin');
              }}
              onBlur={() => {
                if (origin.trim() && !originCoords) {
                  Location.geocodeAsync(origin.trim()).then((res) => {
                    if (res && res[0]) setOriginCoords({ lat: res[0].latitude, lng: res[0].longitude });
                  }).catch(() => {});
                }
              }}
            />
            {origin.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearOrigin}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color="#94a3b8" />
              </TouchableOpacity>
            )}
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
              placeholder="Enter destination"
              placeholderTextColor="#94a3b8"
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                if (!text.trim()) setDestCoords(null);
                handleSearchAddress(text, 'dest');
              }}
              onFocus={() => {
                setActiveInput('dest');
                if (destination.trim().length >= 2) handleSearchAddress(destination, 'dest');
              }}
              onBlur={() => resolveDestinationCoords(destination)}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (destination.trim()) {
                  resolveDestinationCoords(destination);
                  setSuggestions([]);
                  setActiveInput(null);
                }
              }}
            />
            {destination.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearDest}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Live Address Suggestions Dropdown */}
        {suggestions.length > 0 && activeInput && (
          <View style={styles.suggestionsCard}>
            <View style={styles.suggestionsHeaderRow}>
              <Text style={styles.suggestionsHeaderTitle}>
                {searchingAddress ? 'Searching Addresses...' : 'Select Address'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSuggestions([]);
                  setActiveInput(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.suggestionsList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  key={`${item.name}-${idx}`}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.suggestionPinCircle}>
                    <MapPin size={15} color="#0284c7" strokeWidth={2.2} />
                  </View>
                  <View style={styles.suggestionTextWrap}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                  <ChevronRight size={14} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: hasRoute ? bottomAutoPadding : 0,
        }}
        scrollEnabled={hasRoute}
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
            {/* 2. LIGHT MINIMAL SKY BLUE ROUTE MAP (FULL PAGE WHEN NO ROUTE, AUTO-ADJUSTS ON ADDRESS SELECTION) */}
            <View style={[styles.mapContainer, { height: mapHeight }]}>
              <RoutePreviewMap
                originLat={originCoords?.lat}
                originLng={originCoords?.lng}
                originName={origin || 'Pickup'}
                destLat={destCoords?.lat}
                destLng={destCoords?.lng}
                destName={destination || 'Destination'}
                height={mapHeight}
              />
            </View>

            {/* ONCE DESTINATION ADDRESS IS SELECTED: SHOW STEP-BY-STEP FLOW */}
            {hasRoute && (
              <>
                {/* STEP 1: DEPARTURE TIME & DATE */}
                <View style={styles.stepSection}>
                  <View style={styles.stepHeaderRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>1</Text>
                    </View>
                    <Text style={styles.stepTitle}>Select Time & Date</Text>
                    {routeDistanceKm > 0 && (
                      <View style={styles.routeDistanceBadge}>
                        <Text style={styles.routeDistanceText}>~{routeDistanceKm} km</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.scheduleCard}
                    onPress={handleOpenDateTimePicker}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scheduleLeft}>
                      <View style={styles.scheduleIconWrap}>
                        <Clock size={18} color="#0284c7" strokeWidth={2.4} />
                      </View>
                      <View>
                        <Text style={styles.scheduleLabel}>Departure Schedule</Text>
                        <Text style={styles.scheduleValue}>{formatSchedule(departureDate)}</Text>
                      </View>
                    </View>
                    <View style={styles.scheduleChangePill}>
                      <Calendar size={13} color="#0284c7" />
                      <Text style={styles.scheduleChangeText}>Change ⏰</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* STEP 2: CHOOSE VEHICLE: BIKE OR CAR */}
                <View style={styles.stepSection}>
                  <View style={styles.stepHeaderRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>2</Text>
                    </View>
                    <Text style={styles.stepTitle}>Choose Vehicle: Bike or Car</Text>
                  </View>

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
                      <View style={styles.vehicleGraphicWrap}>
                        <View style={styles.carGraphicCircle}>
                          <Car size={26} color="#0284c7" strokeWidth={2.2} />
                          <View style={styles.miniCommuterDot}>
                            <Users size={11} color="#ffffff" strokeWidth={2.5} />
                          </View>
                        </View>
                      </View>

                      <View style={styles.vehicleInfoWrap}>
                        <View style={styles.vehicleTitleRow}>
                          <Text style={styles.vehicleTitle}>Carpool</Text>
                          {selectedVehicle === 'car' && (
                            <View style={styles.selectedCheckDot}>
                              <View style={styles.selectedCheckInner} />
                            </View>
                          )}
                        </View>
                        <Text style={styles.vehicleSubtitle} numberOfLines={1}>
                          {carpoolCount > 0
                            ? `${carpoolCount} ${carpoolCount === 1 ? 'driver' : 'drivers'} on route`
                            : 'Comfortable ride with AC'}
                        </Text>
                      </View>

                      {/* Real Dynamic Price */}
                      <View style={styles.vehiclePriceWrap}>
                        <Text style={styles.vehiclePriceText}>₹{carpoolFare}</Text>
                        <Text style={styles.vehiclePriceUnit}>per seat</Text>
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
                      <View style={styles.vehicleGraphicWrap}>
                        <View style={[styles.carGraphicCircle, { backgroundColor: '#f0fdf4' }]}>
                          <Bike size={26} color="#16a34a" strokeWidth={2.2} />
                        </View>
                      </View>

                      <View style={styles.vehicleInfoWrap}>
                        <View style={styles.vehicleTitleRow}>
                          <Text style={styles.vehicleTitle}>Bikepool</Text>
                          {selectedVehicle === 'bike' && (
                            <View style={styles.selectedCheckDot}>
                              <View style={styles.selectedCheckInner} />
                            </View>
                          )}
                        </View>
                        <Text style={styles.vehicleSubtitle} numberOfLines={1}>
                          {bikepoolCount > 0
                            ? `${bikepoolCount} ${bikepoolCount === 1 ? 'rider' : 'riders'} on route`
                            : 'Fastest & most affordable'}
                        </Text>
                      </View>

                      {/* Real Dynamic Price */}
                      <View style={styles.vehiclePriceWrap}>
                        <Text style={styles.vehiclePriceText}>₹{bikepoolFare}</Text>
                        <Text style={styles.vehiclePriceUnit}>per pillion</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* STEP 3: PRIMARY CTA BUTTON */}
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
  stepSection: {
    marginTop: 14,
    paddingHorizontal: 16,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  routeDistanceBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  routeDistanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scheduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  scheduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  scheduleLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  scheduleValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
    marginTop: 1,
  },
  scheduleChangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scheduleChangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
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
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedCheckDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  selectedCheckInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0284c7',
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  vehicleSubtitle: {
    fontSize: 12,
    color: '#0284c7', // Lo Ride brand sky blue
    fontWeight: '600',
  },
  noMatchesText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  vehiclePriceWrap: {
    paddingLeft: 8,
    alignItems: 'flex-end',
  },
  vehiclePriceText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  vehiclePriceUnit: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'right',
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
    backgroundColor: '#0284c7', // Lo Ride Signature Sky Blue
    borderRadius: 12,
    height: 52,
    gap: 8,
    ...Shadow.md,
  },
  primaryCtaButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  ctaMatchBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  ctaMatchBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7',
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
  suggestionsCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxHeight: 220,
    ...Shadow.md,
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  suggestionsHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
    textTransform: 'uppercase',
  },
  suggestionsList: {
    maxHeight: 180,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    gap: 10,
  },
  suggestionPinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTextWrap: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  suggestionSub: {
    fontSize: 11,
    color: '#64748b',
  },
});
