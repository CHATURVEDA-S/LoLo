import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  ArrowRight,
  Navigation,
  Sparkles,
  Users,
  Info,
} from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LocationPicker from '@/components/LocationPicker';
import type { SupportedCity, VehicleType, DriverVerification } from '@/lib/types';
import { calculateFare, type FareCalculationResult } from '@/lib/fare-calculator';

interface LocationResult {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
}

const ALL_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function OfferRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Vehicle Type & Safety
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [helmetProvided, setHelmetProvided] = useState(true);

  // Profile Vehicle Data (Loaded from RC verification)
  const [verification, setVerification] = useState<DriverVerification | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(true);

  // Location
  const [origin, setOrigin] = useState<LocationResult | null>(null);
  const [destination, setDestination] = useState<LocationResult | null>(null);

  // Date & Time
  const [departureDate, setDepartureDate] = useState(new Date());
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

  // Automatically recalculate fare when route coordinates, vehicle, or time changes
  useEffect(() => {
    if (origin?.lat && origin?.lng && destination?.lat && destination?.lng) {
      const calc = calculateFare({
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
        vehicleType,
        departureTime: departureDate,
        city: user?.city,
      });
      setFareDetails(calc);
    } else {
      setFareDetails(null);
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, vehicleType, departureDate, user?.city]);

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

  // Determine verified vehicles from profile settings
  const primaryType = verification?.vehicle_type;
  const secondaryType = verification?.secondary_vehicle_type;

  const hasPrimary = Boolean(verification?.rc_status === 'verified' || verification?.rc_number);
  const hasSecondary = Boolean(verification?.secondary_rc_status === 'verified' || verification?.secondary_rc_number);

  const hasCar = (hasPrimary && primaryType === 'car') || (hasSecondary && secondaryType === 'car');
  const hasBike = (hasPrimary && primaryType === 'bike') || (hasSecondary && secondaryType === 'bike');
  const hasBothVehicles = hasCar && hasBike;

  // Specific vehicle strings from profile
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

    if (!origin) {
      setError('Please select a pickup location.');
      return;
    }
    if (!destination) {
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

    // Auto-generate standard notes
    let autoNotes = '🛣️ Main road pickup only (No home doorstep detour)';
    if (vehicleType === 'bike' && helmetProvided) {
      autoNotes += '\n🪖 Helmet provided for passenger';
    }
    if (isDaily) {
      const daysStr = selectedDays.join(', ');
      autoNotes = `${autoNotes}\n🔁 Daily commute (${daysStr})`;
    }

    const { error: apiError } = await api.createRide({
      origin: origin.name,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination: destination.name,
      dest_lat: destination.lat,
      dest_lng: destination.lng,
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

  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 72;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. MODERN TOP HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.neutral[800]} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Publish Ride</Text>
          <Text style={styles.headerSubtitle}>Share commute • Zero commission</Text>
        </View>

        {/* Driver Verification Pill */}
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

      {/* 2. SCROLLABLE FORM CONTENT */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: bottomSafePadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* CARD 1: UNIFIED ROUTE CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconCircle}>
              <Navigation size={16} color={Colors.primary[600]} strokeWidth={2.4} />
            </View>
            <Text style={styles.cardHeading}>Route Details</Text>
          </View>

          <View style={styles.routeContainer}>
            <LocationPicker
              label="Pickup Location (Main road / Landmark)"
              value={origin?.name || ''}
              onSelect={setOrigin}
              markerColor="#16a34a"
              city={user?.city}
              cityLat={cityData?.lat}
              cityLng={cityData?.lng}
            />

            <View style={styles.routeConnectorWrap}>
              <View style={styles.routeDottedLine} />
            </View>

            <LocationPicker
              label="Drop-off Destination"
              value={destination?.name || ''}
              onSelect={setDestination}
              markerColor="#d97706"
              city={user?.city}
              cityLat={cityData?.lat}
              cityLng={cityData?.lng}
            />
          </View>

          {/* Minimalist Main Road Policy Tag */}
          <View style={styles.policyTag}>
            <Info size={13} color={Colors.primary[700]} strokeWidth={2.2} />
            <Text style={styles.policyTagText}>
              Main road pickup only: Passengers walk to your route. No doorstep detours.
            </Text>
          </View>
        </View>

        {/* CARD 2: VEHICLE & CAPACITY (BASED ON PROFILE SETTINGS) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: vehicleType === 'bike' ? '#fef3c7' : '#e0f2fe' }]}>
              {vehicleType === 'bike' ? (
                <Bike size={16} color="#d97706" strokeWidth={2.4} />
              ) : (
                <Car size={16} color={Colors.primary[600]} strokeWidth={2.4} />
              )}
            </View>
            <Text style={styles.cardHeading}>
              {hasBothVehicles ? 'Select Vehicle & Seats' : vehicleType === 'bike' ? 'Vehicle: Bike Pool' : 'Vehicle: Car Pool'}
            </Text>
          </View>

          {/* 1. Only show both Car Pool and Bike Pool buttons when the user uploaded BOTH RCs */}
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
            /* 2. User uploaded ONLY Bike RC in Profile -> ONLY show Bike Pool */
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
            /* 3. User uploaded ONLY Car RC in Profile -> ONLY show Car Pool */
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
            /* 4. No Vehicle RC registered yet */
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

          {/* If Car is active */}
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

          {/* If Bike is active */}
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

          {/* If has both vehicles, display active vehicle name below */}
          {hasBothVehicles && (
            <View style={styles.registeredVehicleNote}>
              <Text style={styles.registeredVehicleText} numberOfLines={1}>
                {vehicleType === 'car' ? `🚗 Active: ${carDetails || 'Personal Car'}` : `🏍️ Active: ${bikeDetails || 'Personal Bike'}`}
              </Text>
            </View>
          )}
        </View>

        {/* CARD 3: SCHEDULE & COMMUTE FREQUENCY */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: '#fef3c7' }]}>
              <Clock size={16} color="#d97706" strokeWidth={2.4} />
            </View>
            <Text style={styles.cardHeading}>Departure Time</Text>
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

        {/* CARD 4: SMART AUTO-FARE CARD */}
        {fareDetails ? (
          <View style={styles.fareCard}>
            <View style={styles.fareTopRow}>
              <View>
                <Text style={styles.fareTitle}>Suggested Shared Fare</Text>
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
              <Sparkles size={14} color="#16a34a" strokeWidth={2.2} />
              <Text style={styles.fareFooterText}>
                Direct Cash / UPI payment to you on drop-off • 0% commission
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.farePendingCard}>
            <MapPin size={18} color={Colors.neutral[400]} />
            <Text style={styles.farePendingText}>
              Select pickup and drop-off points to automatically calculate the fair shared commute fare.
            </Text>
          </View>
        )}

        {/* ERROR NOTICE */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* PUBLISH BUTTON */}
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
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  scrollView: {
    flex: 1,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
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

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  cardIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeading: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.neutral[900],
  },

  // Route Section
  routeContainer: {
    gap: 2,
  },
  routeConnectorWrap: {
    paddingLeft: 19,
    height: 12,
    justifyContent: 'center',
  },
  routeDottedLine: {
    width: 2,
    height: 12,
    backgroundColor: '#cbd5e1',
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

  // Vehicle Section
  singleVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  vehicleSegment: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
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

  // Bike & Helmet Section
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
  registeredVehicleNote: {
    marginTop: Spacing.xs,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  registeredVehicleText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[500],
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

  // Smart Auto-Fare Card
  fareCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
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
  farePendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  farePendingText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
    lineHeight: 16,
  },

  // Error Notice
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    marginBottom: Spacing.sm,
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
    marginTop: 4,
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
