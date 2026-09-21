import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
  Dimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import {
  Calendar,
  Clock,
  Car,
  Bike,
  Check,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  RefreshCw,
  Navigation,
  Users,
  Info,
  X,
  ChevronRight,
  Crosshair,
} from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RoutePreviewMap from '@/components/RoutePreviewMap';
import { METRO_PLACES } from '@/components/LocationPicker';
import type { SupportedCity, VehicleType, DriverVerification } from '@/lib/types';
import { calculateFare, type FareCalculationResult } from '@/lib/fare-calculator';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALL_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function OfferRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = Dimensions.get('window');

  // Vehicle Type & Safety
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [helmetProvided, setHelmetProvided] = useState(true);

  // Profile Vehicle Data (Loaded from RC verification)
  const [verification, setVerification] = useState<DriverVerification | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(true);

  // Search & Route State
  const [origin, setOrigin] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);

  // Autocomplete suggestions
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Date & Time
  const [departureDate, setDepartureDate] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Details
  const [seats, setSeats] = useState(1);
  const [isDaily, setIsDaily] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [fareDetails, setFareDetails] = useState<FareCalculationResult | null>(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<SupportedCity | null>(null);

  const isVerified = Boolean(user?.is_verified_driver);
  const hasRoute = Boolean(originCoords && destCoords && destination.trim());

  // Auto-adjust layout on route selection
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hasRoute]);

  // Load verification and vehicle details from profile
  const loadDriverData = useCallback(async () => {
    setLoadingVerification(true);
    const { data } = await api.getVerificationStatus();
    if (data) {
      const v = data as DriverVerification;
      setVerification(v);

      const pType = v.vehicle_type;
      const sType = v.secondary_vehicle_type;
      const pValid = Boolean(v.rc_status === 'verified' || v.rc_number);
      const sValid = Boolean(v.secondary_rc_status === 'verified' || v.secondary_rc_number);

      const isCar = (pValid && pType === 'car') || (sValid && sType === 'car');
      const isBike = (pValid && pType === 'bike') || (sValid && sType === 'bike');

      if (isBike && !isCar) {
        setVehicleType('bike');
        setSeats(1);
      } else if (isCar && !isBike) {
        setVehicleType('car');
      } else if (pType === 'bike') {
        setVehicleType('bike');
        setSeats(1);
      } else {
        setVehicleType('car');
      }
    }
    setLoadingVerification(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDriverData();
    }, [loadDriverData])
  );

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

    // 1. Instant local matching
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

            // Combine without duplicates
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
    if (activeInput === 'dest') setActiveInput(null);
  }

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

  // Handle selecting location directly by tapping anywhere on map
  async function handleMapLocationSelect(coords: { lat: number; lng: number }) {
    const isOrigin = activeInput === 'origin';
    const cleanLat = Math.round(coords.lat * 100000) / 100000;
    const cleanLng = Math.round(coords.lng * 100000) / 100000;

    if (isOrigin) {
      setOriginCoords({ lat: cleanLat, lng: cleanLng });
      setOrigin(`${cleanLat}, ${cleanLng}`);
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: cleanLat,
          longitude: cleanLng,
        });
        if (geo) {
          const parts = [geo.name, geo.street, geo.subregion || geo.district || geo.city].filter(Boolean);
          if (parts.length > 0) setOrigin(parts.join(', '));
        }
      } catch {}
    } else {
      setDestCoords({ lat: cleanLat, lng: cleanLng });
      setDestination(`${cleanLat}, ${cleanLng}`);
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: cleanLat,
          longitude: cleanLng,
        });
        if (geo) {
          const parts = [geo.name, geo.street, geo.subregion || geo.district || geo.city].filter(Boolean);
          if (parts.length > 0) setDestination(parts.join(', '));
        }
      } catch {}
    }
  }

  useEffect(() => {
    async function loadCityData() {
      const { data } = await api.getCities();
      if (data) {
        const cities = data as SupportedCity[];
        const myCity = cities.find((c) => c.name === user?.city);
        if (myCity) setCityData(myCity);
      }
    }
    loadCityData();
  }, [user?.city]);

  // Recalculate fare when coordinates, vehicle, or time changes
  useEffect(() => {
    if (originCoords?.lat && originCoords?.lng && destCoords?.lat && destCoords?.lng) {
      const calc = calculateFare({
        originLat: originCoords.lat,
        originLng: originCoords.lng,
        destLat: destCoords.lat,
        destLng: destCoords.lng,
        vehicleType,
        departureTime: departureDate,
        city: user?.city,
      });
      setFareDetails(calc);
    } else {
      setFareDetails(null);
    }
  }, [originCoords?.lat, originCoords?.lng, destCoords?.lat, destCoords?.lng, vehicleType, departureDate, user?.city]);

  function handleVehicleTypeChange(type: VehicleType) {
    setVehicleType(type);
    if (type === 'bike') {
      setSeats(1);
    } else if (seats < 1) {
      setSeats(1);
    }
  }

  function toggleDay(day: string) {
    if (selectedDays.includes(day)) {
      if (selectedDays.length === 1) {
        Alert.alert('Required', 'Please select at least one commute day.');
        return;
      }
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  }

  function handleOpenDatePicker() {
    if (Platform.OS === 'android') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const safeVal = departureDate.getTime() < today.getTime() ? today : departureDate;

      DateTimePickerAndroid.open({
        value: safeVal,
        mode: 'date',
        minimumDate: today,
        onValueChange: (_event, selectedDate) => {
          if (selectedDate) {
            const updated = new Date(departureDate);
            updated.setFullYear(selectedDate.getFullYear());
            updated.setMonth(selectedDate.getMonth());
            updated.setDate(selectedDate.getDate());
            setDepartureDate(updated);
          }
        },
      });
    } else {
      setShowDatePicker(true);
    }
  }

  function handleOpenTimePicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: departureDate,
        mode: 'time',
        is24Hour: false,
        onValueChange: (_event, selectedTime) => {
          if (selectedTime) {
            const updated = new Date(departureDate);
            updated.setHours(selectedTime.getHours());
            updated.setMinutes(selectedTime.getMinutes());
            setDepartureDate(updated);
          }
        },
      });
    } else {
      setShowTimePicker(true);
    }
  }

  function formatDate(date: Date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tmrw = new Date(now);
    tmrw.setDate(now.getDate() + 1);
    const isTomorrow = date.toDateString() === tmrw.toDateString();

    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Vehicle capabilities from profile
  const primaryType = verification?.vehicle_type;
  const secondaryType = verification?.secondary_vehicle_type;

  const hasPrimary = Boolean(verification?.rc_status === 'verified' || verification?.rc_number);
  const hasSecondary = Boolean(verification?.secondary_rc_status === 'verified' || verification?.secondary_rc_number);

  const hasCar = (hasPrimary && primaryType === 'car') || (hasSecondary && secondaryType === 'car');
  const hasBike = (hasPrimary && primaryType === 'bike') || (hasSecondary && secondaryType === 'bike');
  const hasBothVehicles = hasCar && hasBike;

  const carDetails = primaryType === 'car'
    ? [verification?.vehicle_make, verification?.vehicle_model, verification?.vehicle_plate].filter(Boolean).join(' • ')
    : secondaryType === 'car'
    ? [verification?.secondary_vehicle_make, verification?.secondary_vehicle_model, verification?.secondary_vehicle_plate].filter(Boolean).join(' • ')
    : '';

  const bikeDetails = primaryType === 'bike'
    ? [verification?.vehicle_make, verification?.vehicle_model, verification?.vehicle_plate].filter(Boolean).join(' • ')
    : secondaryType === 'bike'
    ? [verification?.secondary_vehicle_make, verification?.secondary_vehicle_model, verification?.secondary_vehicle_plate].filter(Boolean).join(' • ')
    : '';

  const finalVehicleInfo = vehicleType === 'bike'
    ? (bikeDetails || 'Two-Wheeler / Bike')
    : (carDetails || 'Personal Car');

  async function publishRide() {
    setError(null);

    if (!isVerified) {
      Alert.alert(
        'Driver Verification Required',
        'Please verify your Driving Licence and Vehicle RC in Profile before publishing rides.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Go to Profile', onPress: () => router.push('/(tabs)/profile') },
        ]
      );
      return;
    }

    if (!origin.trim() || !originCoords) {
      setError('Please select a pickup location.');
      return;
    }
    if (!destination.trim() || !destCoords) {
      setError('Please select a drop-off destination.');
      return;
    }

    let adjustedDeparture = new Date(departureDate);
    if (isDaily && adjustedDeparture.getTime() < Date.now()) {
      adjustedDeparture.setDate(adjustedDeparture.getDate() + 1);
    } else if (!isDaily && adjustedDeparture.getTime() < Date.now()) {
      setError('Departure time must be in the future.');
      return;
    }

    if (isDaily && selectedDays.length === 0) {
      setError('Please select at least one day for your daily commute.');
      return;
    }

    const calculatedFare = fareDetails?.suggestedFare ?? (vehicleType === 'bike' ? 50 : 70);
    if (isNaN(calculatedFare) || calculatedFare <= 0) {
      setError('Please select pickup and drop locations to calculate fare.');
      return;
    }

    setLoading(true);

    let autoNotes = '🛣️ Main road pickup only (No home doorstep detour)';
    if (vehicleType === 'bike' && helmetProvided) {
      autoNotes += '\n🪖 Helmet provided for passenger';
    }
    if (isDaily) {
      const daysStr = selectedDays.join(', ');
      autoNotes = `${autoNotes}\n🔁 Daily commute (${daysStr})`;
    }

    const { error: apiError } = await api.createRide({
      origin: origin.trim(),
      origin_lat: originCoords.lat,
      origin_lng: originCoords.lng,
      destination: destination.trim(),
      dest_lat: destCoords.lat,
      dest_lng: destCoords.lng,
      departure_time: adjustedDeparture.toISOString(),
      seats_total: vehicleType === 'bike' ? 1 : seats,
      price_per_seat: calculatedFare,
      vehicle_type: vehicleType,
      vehicle_info: finalVehicleInfo,
      notes: autoNotes,
      is_daily: isDaily,
      recurring_days: isDaily ? selectedDays.join(',') : '',
    });

    setLoading(false);

    if (apiError) {
      setError(apiError);
      return;
    }

    Alert.alert(
      'Ride Published! 🎉',
      isDaily
        ? `Your daily ${vehicleType === 'bike' ? 'bike' : 'car'} commute (${selectedDays.join(', ')}) is now live.`
        : `Your ${vehicleType === 'bike' ? 'bike' : 'car'} ride is live. Commuters can now book seats along your route!`,
      [{ text: 'View in My Trips', onPress: () => router.replace('/(tabs)/trips') }]
    );
  }

  const mapHeight = hasRoute ? 230 : Math.max(380, windowHeight - insets.top - insets.bottom - 175);
  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. TOP HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={Colors.neutral[800]} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Publish Ride</Text>
          <Text style={styles.headerSubtitle}>Share commute • Zero commission</Text>
        </View>

        {/* Driver Verification Status */}
        <TouchableOpacity
          style={[styles.statusPill, isVerified ? styles.statusPillVerified : styles.statusPillUnverified]}
          onPress={() => {
            if (!isVerified) router.push('/(tabs)/profile');
          }}
          activeOpacity={0.8}
        >
          {isVerified ? (
            <>
              <ShieldCheck size={13} color="#16a34a" strokeWidth={2.4} />
              <Text style={styles.statusPillTextVerified}>Verified</Text>
            </>
          ) : (
            <>
              <ShieldAlert size={13} color="#d97706" strokeWidth={2.4} />
              <Text style={styles.statusPillTextUnverified}>Verify DL</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 2. TOP FROM / TO SEARCH BAR */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchCard}>
          {/* Pickup (From) Row */}
          <View style={styles.inputRow}>
            <View style={[styles.routeDot, { backgroundColor: '#16a34a' }]} />
            <TextInput
              style={styles.textInput}
              placeholder={detectingGps ? 'Locating via GPS...' : 'From (Current Location / Landmark)'}
              placeholderTextColor="#94a3b8"
              value={origin}
              onChangeText={(text) => {
                setOrigin(text);
                handleSearchAddress(text, 'origin');
              }}
              onFocus={() => {
                setActiveInput('origin');
                if (origin.trim().length >= 2) handleSearchAddress(origin, 'origin');
              }}
              returnKeyType="next"
            />
            {origin.length > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearOrigin}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color="#94a3b8" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.gpsBtn}
                onPress={() => useCurrentLocationForOrigin(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {detectingGps ? (
                  <ActivityIndicator size="small" color="#0284c7" />
                ) : (
                  <Crosshair size={16} color="#0284c7" />
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputDivider} />

          {/* Drop-off (To) Row */}
          <View style={styles.inputRow}>
            <View style={[styles.routeDot, { backgroundColor: '#f59e0b' }]} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter destination"
              placeholderTextColor="#94a3b8"
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                handleSearchAddress(text, 'dest');
              }}
              onFocus={() => {
                setActiveInput('dest');
                if (destination.trim().length >= 2) handleSearchAddress(destination, 'dest');
              }}
              onBlur={() => resolveDestinationCoords(destination)}
              returnKeyType="done"
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

      {/* 3. SCROLLABLE BODY */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: hasRoute ? bottomSafePadding : 0,
        }}
        scrollEnabled={hasRoute}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* INTERACTIVE LEAFLET ROUTE MAP */}
        <View style={[styles.mapContainer, { height: mapHeight }]}>
          <RoutePreviewMap
            originLat={originCoords?.lat}
            originLng={originCoords?.lng}
            originName={origin || 'Pickup'}
            destLat={destCoords?.lat}
            destLng={destCoords?.lng}
            destName={destination || 'Destination'}
            height={mapHeight}
            onMapClick={handleMapLocationSelect}
          />
          {!hasRoute && (
            <View style={styles.mapHintBadge} pointerEvents="none">
              <MapPin size={13} color="#0284c7" strokeWidth={2.4} />
              <Text style={styles.mapHintText}>Tap anywhere on map to select destination</Text>
            </View>
          )}
        </View>

        {/* STEP-BY-STEP FLOW (REVEALED ONLY AFTER DESTINATION ADDRESS IS SELECTED) */}
        {hasRoute && (
          <View style={styles.stepsContainer}>
            {/* STEP 1: COMMUTE SCHEDULE */}
            <View style={styles.stepSection}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <Text style={styles.stepTitle}>Commute Schedule</Text>
              </View>

              {/* Date & Time Selectors */}
              <View style={styles.dateTimeGrid}>
                <TouchableOpacity
                  style={styles.dateTimeTile}
                  onPress={handleOpenDatePicker}
                  activeOpacity={0.8}
                >
                  <Calendar size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                  <View style={styles.dateTimeTileTexts}>
                    <Text style={styles.dateTimeTileLabel}>Date</Text>
                    <Text style={styles.dateTimeTileValue}>{formatDate(departureDate)}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dateTimeTile}
                  onPress={handleOpenTimePicker}
                  activeOpacity={0.8}
                >
                  <Clock size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                  <View style={styles.dateTimeTileTexts}>
                    <Text style={styles.dateTimeTileLabel}>Time</Text>
                    <Text style={styles.dateTimeTileValue}>{formatTime(departureDate)}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Daily Repeat Commute Switch */}
              <View style={styles.repeatToggleRow}>
                <View style={styles.repeatToggleLeft}>
                  <RefreshCw size={16} color={isDaily ? Colors.primary[600] : Colors.neutral[500]} strokeWidth={2.2} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.repeatToggleTitle}>Recurring Daily Commute</Text>
                    <Text style={styles.repeatToggleSub}>Automatically repeat every week</Text>
                  </View>
                </View>
                <Switch
                  value={isDaily}
                  onValueChange={setIsDaily}
                  trackColor={{ false: '#e2e8f0', true: '#bae6fd' }}
                  thumbColor={isDaily ? Colors.primary[600] : '#94a3b8'}
                />
              </View>

              {/* Weekday Selection when Daily is On */}
              {isDaily && (
                <View style={styles.dailyDaysContainer}>
                  <View style={styles.presetButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.presetBtn,
                        selectedDays.length === 5 && !selectedDays.includes('Sat') && !selectedDays.includes('Sun') && styles.presetBtnActive,
                      ]}
                      onPress={() => setSelectedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])}
                      activeOpacity={0.8}
                    >
                      <Text style={[
                        styles.presetBtnText,
                        selectedDays.length === 5 && !selectedDays.includes('Sat') && !selectedDays.includes('Sun') && styles.presetBtnTextActive,
                      ]}>
                        Weekdays (Mon–Fri)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.presetBtn, selectedDays.length === 7 && styles.presetBtnActive]}
                      onPress={() => setSelectedDays(ALL_WEEK_DAYS)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.presetBtnText, selectedDays.length === 7 && styles.presetBtnTextActive]}>
                        All 7 Days
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.daysChipsRow}>
                    {ALL_WEEK_DAYS.map((day) => {
                      const isSelected = selectedDays.includes(day);
                      return (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayChip, isSelected && styles.dayChipActive]}
                          onPress={() => toggleDay(day)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.dayChipText, isSelected && styles.dayChipTextActive]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* STEP 2: VEHICLE & CAPACITY */}
            <View style={styles.stepSection}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Vehicle & Capacity</Text>
              </View>

              {/* Vehicle Options based on verified RC */}
              {hasBothVehicles ? (
                <View style={styles.vehicleSegment}>
                  <TouchableOpacity
                    style={[styles.vehicleTab, vehicleType === 'car' && styles.vehicleTabActive]}
                    onPress={() => handleVehicleTypeChange('car')}
                    activeOpacity={0.85}
                  >
                    <Car
                      size={18}
                      color={vehicleType === 'car' ? '#ffffff' : Colors.neutral[600]}
                      strokeWidth={2.2}
                    />
                    <Text style={[styles.vehicleTabText, vehicleType === 'car' && styles.vehicleTabTextActive]}>
                      Car Pool
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.vehicleTab, vehicleType === 'bike' && styles.vehicleTabActive]}
                    onPress={() => handleVehicleTypeChange('bike')}
                    activeOpacity={0.85}
                  >
                    <Bike
                      size={18}
                      color={vehicleType === 'bike' ? '#ffffff' : Colors.neutral[600]}
                      strokeWidth={2.2}
                    />
                    <Text style={[styles.vehicleTabText, vehicleType === 'bike' && styles.vehicleTabTextActive]}>
                      Bike Pool
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : hasBike && !hasCar ? (
                <View style={styles.singleVehicleCard}>
                  <View style={[styles.singleVehicleIconWrap, { backgroundColor: '#fef3c7' }]}>
                    <Bike size={22} color="#d97706" strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.singleVehicleTitleRow}>
                      <Text style={styles.singleVehicleTitle}>Bike Pool</Text>
                      <View style={styles.singleVehicleVerifiedPill}>
                        <ShieldCheck size={11} color="#15803d" strokeWidth={2.4} />
                        <Text style={styles.singleVehicleVerifiedText}>Registered Bike</Text>
                      </View>
                    </View>
                    <Text style={styles.singleVehicleModelText} numberOfLines={1}>
                      {bikeDetails || 'Personal Two-Wheeler'}
                    </Text>
                  </View>
                </View>
              ) : hasCar && !hasBike ? (
                <View style={styles.singleVehicleCard}>
                  <View style={[styles.singleVehicleIconWrap, { backgroundColor: '#e0f2fe' }]}>
                    <Car size={22} color={Colors.primary[600]} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.singleVehicleTitleRow}>
                      <Text style={styles.singleVehicleTitle}>Car Pool</Text>
                      <View style={styles.singleVehicleVerifiedPill}>
                        <ShieldCheck size={11} color="#15803d" strokeWidth={2.4} />
                        <Text style={styles.singleVehicleVerifiedText}>Registered Car</Text>
                      </View>
                    </View>
                    <Text style={styles.singleVehicleModelText} numberOfLines={1}>
                      {carDetails || 'Personal Car'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.unverifiedVehicleCard}>
                  <Info size={18} color="#b45309" strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unverifiedVehicleTitle}>No Vehicle RC Registered</Text>
                    <Text style={styles.unverifiedVehicleSub}>
                      Upload your Car or Bike RC in Profile Settings to unlock ride publishing.
                    </Text>
                    <TouchableOpacity
                      style={styles.addVehicleBtn}
                      onPress={() => router.push('/(tabs)/profile')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addVehicleBtnText}>Add Vehicle RC in Profile →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Car Passenger Seats */}
              {vehicleType === 'car' && (hasCar || (!hasCar && !hasBike)) && (
                <View style={styles.seatSection}>
                  <Text style={styles.inputLabel}>Available Passenger Seats</Text>
                  <View style={styles.seatPillRow}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[styles.seatPill, seats === n && styles.seatPillActive]}
                        onPress={() => setSeats(n)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.seatPillText, seats === n && styles.seatPillTextActive]}>
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Bike Pillion & Helmet */}
              {vehicleType === 'bike' && (hasBike || (!hasCar && !hasBike)) && (
                <View style={styles.bikeSection}>
                  <View style={styles.bikeInfoRow}>
                    <View style={styles.bikeSeatNotice}>
                      <Users size={14} color="#d97706" strokeWidth={2.4} />
                      <Text style={styles.bikeSeatNoticeText}>1 Pillion Seat Available</Text>
                    </View>
                  </View>

                  <View style={styles.helmetRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helmetTitle}>Spare Helmet for Co-Rider 🪖</Text>
                      <Text style={styles.helmetSubtitle}>Ensure rider safety with a certified helmet</Text>
                    </View>
                    <Switch
                      value={helmetProvided}
                      onValueChange={setHelmetProvided}
                      trackColor={{ false: '#e2e8f0', true: '#bae6fd' }}
                      thumbColor={helmetProvided ? Colors.primary[600] : '#94a3b8'}
                    />
                  </View>
                </View>
              )}

              {/* Suggested Auto-Fare Card */}
              {fareDetails && (
                <View style={styles.fareCard}>
                  <View style={styles.fareTopRow}>
                    <View>
                      <Text style={styles.fareTitle}>Suggested Shared Commute Fare</Text>
                      <Text style={styles.fareSub}>
                        {fareDetails.distanceKm} km · ~{Math.max(5, Math.round(fareDetails.distanceKm * 2.5))} mins
                      </Text>
                    </View>
                    <View style={styles.fareBadge}>
                      <Text style={styles.farePrice}>₹{fareDetails.suggestedFare}</Text>
                      <Text style={styles.fareUnit}>{vehicleType === 'bike' ? '/ pillion' : '/ seat'}</Text>
                    </View>
                  </View>

                  <View style={styles.fareDivider} />

                  <View style={styles.fareFooterRow}>
                    <Check size={14} color="#16a34a" strokeWidth={2.2} />
                    <Text style={styles.fareFooterText}>
                      Direct Cash / UPI payment to you on drop-off • 0% commission
                    </Text>
                  </View>
                </View>
              )}

              {/* Main Road Policy Reminder */}
              <View style={styles.policyTag}>
                <Info size={13} color={Colors.primary[700]} strokeWidth={2.2} />
                <Text style={styles.policyTagText}>
                  Main road pickup only: Passengers walk to your route. No doorstep detours.
                </Text>
              </View>
            </View>

            {/* ERROR NOTICE */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* STEP 3: PUBLISH BUTTON */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonLoading]}
              onPress={publishRide}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Check size={18} color="#ffffff" strokeWidth={2.6} />
                  <Text style={styles.submitButtonText}>
                    Publish {vehicleType === 'bike' ? 'Bike' : 'Car'} Ride
                    {fareDetails ? ` · ₹${fareDetails.suggestedFare}` : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* MODAL: iOS Native Date Picker */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal
          transparent
          animationType="fade"
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Departure Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={departureDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) {
                    const updated = new Date(departureDate);
                    updated.setFullYear(selectedDate.getFullYear());
                    updated.setMonth(selectedDate.getMonth());
                    updated.setDate(selectedDate.getDate());
                    setDepartureDate(updated);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL: iOS Native Time Picker */}
      {Platform.OS === 'ios' && showTimePicker && (
        <Modal
          transparent
          animationType="fade"
          visible={showTimePicker}
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Departure Time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={departureDate}
                mode="time"
                display="spinner"
                onChange={(_event, selectedTime) => {
                  if (selectedTime) {
                    const updated = new Date(departureDate);
                    updated.setHours(selectedTime.getHours());
                    updated.setMinutes(selectedTime.getMinutes());
                    setDepartureDate(updated);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  // 1. Top Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...Shadow.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.neutral[900],
  },
  headerSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  statusPillVerified: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusPillUnverified: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  statusPillTextVerified: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#15803d',
  },
  statusPillTextUnverified: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#b45309',
  },

  // 2. Search Bar
  searchBarWrapper: {
    position: 'relative',
    zIndex: 999,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
  },
  routeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 0,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginLeft: 31,
  },
  clearBtn: {
    padding: 4,
  },
  gpsBtn: {
    padding: 4,
  },

  // Suggestions Dropdown
  suggestionsCard: {
    position: 'absolute',
    top: 102,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    ...Shadow.lg,
    zIndex: 9999,
    maxHeight: 260,
    elevation: 20,
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  suggestionsHeaderTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  suggestionsList: {
    maxHeight: 210,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#0f172a',
  },
  suggestionSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },

  // 3. Map
  scrollArea: {
    flex: 1,
  },
  mapContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#e0f2fe',
    overflow: 'hidden',
  },
  mapHintBadge: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#bae6fd',
    ...Shadow.md,
    elevation: 8,
  },
  mapHintText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#0369a1',
  },

  // 4. Sequential Steps
  stepsContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  stepSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#ffffff',
  },
  stepTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.neutral[900],
  },

  // Schedule Grid
  dateTimeGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dateTimeTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateTimeTileTexts: {
    flex: 1,
  },
  dateTimeTileLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
  },
  dateTimeTileValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: Colors.neutral[900],
    marginTop: 1,
  },

  // Repeat Schedule
  repeatToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  repeatToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  repeatToggleTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.neutral[800],
  },
  repeatToggleSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  dailyDaysContainer: {
    marginTop: Spacing.sm,
    gap: 6,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetBtnActive: {
    backgroundColor: '#e0f2fe',
    borderColor: Colors.primary[500],
  },
  presetBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[600],
  },
  presetBtnTextActive: {
    fontFamily: 'Inter-Bold',
    color: Colors.primary[700],
  },
  daysChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 2,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: Colors.primary[600],
    borderColor: Colors.primary[600],
  },
  dayChipText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: Colors.neutral[600],
  },
  dayChipTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },

  // Vehicle Section
  vehicleSegment: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    marginBottom: Spacing.xs,
  },
  vehicleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  vehicleTabActive: {
    backgroundColor: Colors.primary[600],
    ...Shadow.sm,
  },
  vehicleTabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.neutral[600],
  },
  vehicleTabTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  singleVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: Spacing.xs,
  },
  singleVehicleIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleVehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  singleVehicleTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.neutral[900],
  },
  singleVehicleModelText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[600],
  },
  singleVehicleVerifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  singleVehicleVerifiedText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: '#15803d',
  },
  unverifiedVehicleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: Spacing.xs,
  },
  unverifiedVehicleTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 13,
    color: '#92400e',
    marginBottom: 2,
  },
  unverifiedVehicleSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#b45309',
    lineHeight: 16,
    marginBottom: 8,
  },
  addVehicleBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addVehicleBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#ffffff',
  },

  // Seats for Car
  seatSection: {
    marginTop: Spacing.sm,
  },
  inputLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.neutral[700],
    marginBottom: 6,
  },
  seatPillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  seatPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatPillActive: {
    backgroundColor: Colors.primary[600],
    borderColor: Colors.primary[600],
  },
  seatPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: Colors.neutral[700],
  },
  seatPillTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },

  // Bike Section
  bikeSection: {
    marginTop: Spacing.sm,
    gap: 8,
  },
  bikeInfoRow: {
    flexDirection: 'row',
  },
  bikeSeatNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  bikeSeatNoticeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#b45309',
  },
  helmetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  helmetTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.neutral[800],
  },
  helmetSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
  },

  // Fare Card
  fareCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    ...Shadow.sm,
  },
  fareTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 13,
    color: '#166534',
  },
  fareSub: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#15803d',
    marginTop: 2,
  },
  fareBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  farePrice: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#ffffff',
  },
  fareUnit: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: '#dcfce7',
    textTransform: 'uppercase',
  },
  fareDivider: {
    height: 1,
    backgroundColor: '#dcfce7',
    marginVertical: 8,
  },
  fareFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fareFooterText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#166534',
  },
  policyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  policyTagText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.primary[800],
    lineHeight: 15,
  },

  // Error Notice
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
  },

  // Submit Button
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary[600],
    borderRadius: 14,
    height: 52,
    ...Shadow.md,
  },
  submitButtonLoading: {
    opacity: 0.8,
  },
  submitButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#ffffff',
  },

  // iOS Native Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.neutral[900],
  },
  modalDone: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.primary[600],
  },
});
