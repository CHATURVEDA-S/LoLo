import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  Dimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Car,
  Bike,
  Navigation,
  Info,
  CheckCircle2,
  MapPin,
  Coins,
  RefreshCw,
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
import { calculateFare, type FareCalculationResult } from '@/lib/fare-calculator';
import type { SupportedCity } from '@/lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALL_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CreatePassengerPostScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = Dimensions.get('window');

  // Route State
  const [origin, setOrigin] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);
  const [cityData, setCityData] = useState<SupportedCity | null>(null);

  // Address search autocomplete state
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Schedule & Recurrence
  const [departureDate, setDepartureDate] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isDaily, setIsDaily] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  // Preferences
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [vehiclePref, setVehiclePref] = useState<'car' | 'bike'>('car');
  const [notes, setNotes] = useState<string>('');

  // Auto-calculated fare state
  const [fareDetails, setFareDetails] = useState<FareCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRoute = Boolean(originCoords && destCoords && destination.trim());

  // Auto-adjust layout on route selection
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hasRoute]);

  // Load city metadata
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

  // Handle selecting location directly by tapping on map
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

  // Dynamic automatic fare calculation when route coordinates, vehicle, or time changes
  useEffect(() => {
    if (originCoords?.lat && originCoords?.lng && destCoords?.lat && destCoords?.lng) {
      const calc = calculateFare({
        originLat: originCoords.lat,
        originLng: originCoords.lng,
        destLat: destCoords.lat,
        destLng: destCoords.lng,
        vehicleType: vehiclePref,
        departureTime: departureDate,
        city: user?.city,
      });
      setFareDetails(calc);
    } else {
      setFareDetails(null);
    }
  }, [originCoords?.lat, originCoords?.lng, destCoords?.lat, destCoords?.lng, vehiclePref, departureDate, user?.city]);

  function toggleDay(day: string) {
    if (selectedDays.includes(day)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== day));
      }
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  }

  // Date and Time picker handlers
  function handleOpenDatePicker() {
    if (Platform.OS === 'android') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const safeVal = departureDate.getTime() < today.getTime() ? today : departureDate;

      DateTimePickerAndroid.open({
        value: safeVal,
        minimumDate: today,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
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
        onChange: (event, selectedTime) => {
          if (event.type === 'set' && selectedTime) {
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

  async function handleSubmit() {
    setError(null);

    if (!origin.trim() || !originCoords) {
      setError('Please select your pickup location.');
      return;
    }
    if (!destination.trim() || !destCoords) {
      setError('Please select your drop-off destination.');
      return;
    }
    if (!fareDetails || fareDetails.suggestedFare <= 0) {
      setError('Please select valid pickup and destination points to calculate the fare.');
      return;
    }

    setLoading(true);

    const { error: apiError } = await api.createPassengerPost({
      origin: origin.trim(),
      origin_lat: originCoords.lat,
      origin_lng: originCoords.lng,
      destination: destination.trim(),
      dest_lat: destCoords.lat,
      dest_lng: destCoords.lng,
      city: user?.city || cityData?.name || 'City',
      departure_time: departureDate.toISOString(),
      seats_needed: seatsNeeded,
      vehicle_preference: vehiclePref,
      distance_km: fareDetails.distanceKm,
      suggested_fare: fareDetails.suggestedFare,
      notes: notes.trim(),
      is_daily: isDaily,
      recurring_days: isDaily ? selectedDays.join(',') : '',
    });

    setLoading(false);

    if (apiError) {
      setError(apiError);
      return;
    }

    Alert.alert(
      'Drop Request Posted! 🚀',
      `Your drop request for ₹${fareDetails.suggestedFare} (${fareDetails.distanceKm} km) is now live. Commuters traveling that way can accept and pick you up.`,
      [
        {
          text: 'View Requests',
          onPress: () => router.replace('/(tabs)/find'),
        },
      ]
    );
  }

  const mapHeight = hasRoute ? 230 : Math.max(380, windowHeight - insets.top - insets.bottom - 175);
  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. TOP BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={Colors.neutral[800]} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarTitle}>Request a Drop</Text>
          <Text style={styles.topBarSub}>Post your route • Drivers offer drop</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* 2. FROM / TO SEARCH BAR */}
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

              {/* One-Time vs Daily Selector */}
              <View style={styles.frequencyRow}>
                <TouchableOpacity
                  style={[styles.frequencyBtn, !isDaily && styles.frequencyBtnActive]}
                  onPress={() => setIsDaily(false)}
                  activeOpacity={0.8}
                >
                  <Calendar size={15} color={!isDaily ? '#ffffff' : Colors.neutral[600]} />
                  <Text style={[styles.frequencyBtnText, !isDaily && styles.frequencyBtnTextActive]}>
                    One-Time Drop
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.frequencyBtn, isDaily && styles.frequencyBtnActive]}
                  onPress={() => setIsDaily(true)}
                  activeOpacity={0.8}
                >
                  <RefreshCw size={14} color={isDaily ? '#ffffff' : Colors.neutral[600]} />
                  <Text style={[styles.frequencyBtnText, isDaily && styles.frequencyBtnTextActive]}>
                    Daily Commute
                  </Text>
                </TouchableOpacity>
              </View>

              {/* One-Time Date & Time */}
              {!isDaily ? (
                <View style={styles.dateTimeGrid}>
                  <TouchableOpacity
                    style={styles.dateTimeTile}
                    onPress={handleOpenDatePicker}
                    activeOpacity={0.8}
                  >
                    <Calendar size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                    <View style={styles.dateTimeTileTexts}>
                      <Text style={styles.dateTimeTileLabel}>Date</Text>
                      <Text style={styles.dateTimeTileValue}>
                        {departureDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
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
                      <Text style={styles.dateTimeTileValue}>
                        {departureDate.toLocaleTimeString('en-IN', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Daily Recurring Days & Time */
                <View style={styles.dailyScheduleWrap}>
                  <TouchableOpacity
                    style={styles.dateTimeTile}
                    onPress={handleOpenTimePicker}
                    activeOpacity={0.8}
                  >
                    <Clock size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                    <View style={styles.dateTimeTileTexts}>
                      <Text style={styles.dateTimeTileLabel}>Daily Pickup Time</Text>
                      <Text style={styles.dateTimeTileValue}>
                        Every day at {departureDate.toLocaleTimeString('en-IN', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Quick Presets */}
                  <View style={styles.presetButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.presetBtn,
                        selectedDays.length === 5 &&
                          !selectedDays.includes('Sat') &&
                          !selectedDays.includes('Sun') &&
                          styles.presetBtnActive,
                      ]}
                      onPress={() => setSelectedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.presetBtnText,
                          selectedDays.length === 5 &&
                            !selectedDays.includes('Sat') &&
                            !selectedDays.includes('Sun') &&
                            styles.presetBtnTextActive,
                        ]}
                      >
                        Weekdays (Mon–Fri)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.presetBtn, selectedDays.length === 7 && styles.presetBtnActive]}
                      onPress={() => setSelectedDays(ALL_WEEK_DAYS)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.presetBtnText,
                          selectedDays.length === 7 && styles.presetBtnTextActive,
                        ]}
                      >
                        All 7 Days
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Days Chips */}
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

            {/* STEP 2: VEHICLE PREFERENCE & FARE */}
            <View style={styles.stepSection}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Vehicle Preference & Fare</Text>
              </View>

              {/* Vehicle Selection Segment */}
              <View style={styles.vehicleSegment}>
                <TouchableOpacity
                  style={[styles.vehicleTab, vehiclePref === 'car' && styles.vehicleTabActive]}
                  onPress={() => setVehiclePref('car')}
                  activeOpacity={0.85}
                >
                  <Car
                    size={18}
                    color={vehiclePref === 'car' ? '#ffffff' : Colors.neutral[600]}
                    strokeWidth={2.2}
                  />
                  <Text style={[styles.vehicleTabText, vehiclePref === 'car' && styles.vehicleTabTextActive]}>
                    Car
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.vehicleTab, vehiclePref === 'bike' && styles.vehicleTabActive]}
                  onPress={() => {
                    setVehiclePref('bike');
                    if (seatsNeeded > 1) setSeatsNeeded(1);
                  }}
                  activeOpacity={0.85}
                >
                  <Bike
                    size={18}
                    color={vehiclePref === 'bike' ? '#ffffff' : Colors.neutral[600]}
                    strokeWidth={2.2}
                  />
                  <Text style={[styles.vehicleTabText, vehiclePref === 'bike' && styles.vehicleTabTextActive]}>
                    Bike
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Passengers / Seats Needed */}
              <View style={styles.seatSection}>
                <Text style={styles.inputLabel}>Passengers / Seats Needed</Text>
                <View style={styles.seatPillRow}>
                  {(vehiclePref === 'bike' ? [1] : [1, 2, 3, 4]).map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[styles.seatPill, seatsNeeded === num && styles.seatPillActive]}
                      onPress={() => setSeatsNeeded(num)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.seatPillText, seatsNeeded === num && styles.seatPillTextActive]}>
                        {num} {num === 1 ? 'Seat' : 'Seats'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Live Auto-Calculated Fare Card */}
              {fareDetails && (
                <View style={styles.fareCard}>
                  <View style={styles.fareTopRow}>
                    <View>
                      <Text style={styles.fareTitle}>Calculated Commute Fare</Text>
                      <Text style={styles.fareSub}>
                        {fareDetails.distanceKm} km · ~{Math.max(5, Math.round(fareDetails.distanceKm * 2.5))} mins
                      </Text>
                    </View>
                    <View style={styles.fareBadge}>
                      <Text style={styles.farePrice}>₹{fareDetails.suggestedFare}</Text>
                      <Text style={styles.fareUnit}>{vehiclePref === 'bike' ? 'Bike Drop' : 'Car Drop'}</Text>
                    </View>
                  </View>

                  <View style={styles.fareDivider} />

                  <View style={styles.fareFooterRow}>
                    <Coins size={15} color="#166534" />
                    <Text style={styles.fareFooterText}>
                      Calculated from road distance • Pay driver via Cash or UPI after drop
                    </Text>
                  </View>
                </View>
              )}

              {/* Main Road Pickup Reminder */}
              <View style={styles.policyTag}>
                <Info size={13} color={Colors.primary[700]} strokeWidth={2.2} />
                <Text style={styles.policyTagText}>
                  Main road pickup: Please select a main road, bus stop, or metro station along your route. Drivers do not take interior colony detours.
                </Text>
              </View>

              {/* Notes for Driver (Optional) */}
              <View style={styles.notesSection}>
                <Text style={styles.inputLabel}>Notes for Driver (Optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g., Waiting near Metro exit gate 2, holding a laptop bag..."
                  placeholderTextColor={Colors.neutral[400]}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Error Notice */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* STEP 3: SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonLoading]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#ffffff" strokeWidth={2.4} />
                  <Text style={styles.submitButtonText}>
                    Post Drop Request {fareDetails ? `· ₹${fareDetails.suggestedFare}` : ''}
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

  // 1. Top Bar
  topBar: {
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
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  topBarTitleWrap: {
    flex: 1,
    marginLeft: 10,
  },
  topBarTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.neutral[900],
  },
  topBarSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
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

  // Frequency row
  frequencyRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  frequencyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  frequencyBtnActive: {
    backgroundColor: Colors.primary[600],
    ...Shadow.sm,
  },
  frequencyBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.neutral[600],
  },
  frequencyBtnTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
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

  // Daily Schedule
  dailyScheduleWrap: {
    gap: 8,
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
    marginBottom: Spacing.sm,
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

  // Seats
  seatSection: {
    marginBottom: Spacing.xs,
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

  // Notes
  notesSection: {
    marginTop: Spacing.sm,
  },
  notesInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.neutral[800],
    minHeight: 52,
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
