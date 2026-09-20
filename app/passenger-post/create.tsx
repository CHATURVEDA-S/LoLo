import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Car,
  Bike,
  Navigation,
  Sparkles,
  Info,
  CheckCircle2,
  MapPin,
  Coins,
  RefreshCw,
} from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LocationPicker from '@/components/LocationPicker';
import { calculateFare, type FareCalculationResult } from '@/lib/fare-calculator';
import type { SupportedCity } from '@/lib/types';

interface LocationResult {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export default function CreatePassengerPostScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Route
  const [origin, setOrigin] = useState<LocationResult | null>(null);
  const [destination, setDestination] = useState<LocationResult | null>(null);
  const [cityData, setCityData] = useState<SupportedCity | null>(null);

  // Schedule
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

  const allWeekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function toggleDay(day: string) {
    if (selectedDays.includes(day)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== day));
      }
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  }

  // Preferences
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [vehiclePref, setVehiclePref] = useState<'car' | 'bike'>('car');
  const [notes, setNotes] = useState<string>('');

  // Auto-calculated fare state
  const [fareDetails, setFareDetails] = useState<FareCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Dynamic automatic fare calculation when route coordinates, vehicle, or time changes
  useEffect(() => {
    if (origin?.lat && origin?.lng && destination?.lat && destination?.lng) {
      const calc = calculateFare({
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
        vehicleType: vehiclePref,
        departureTime: departureDate,
        city: user?.city,
      });
      setFareDetails(calc);
    } else {
      setFareDetails(null);
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, vehiclePref, departureDate, user?.city]);

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

    if (!origin) {
      setError('Please select your pickup location.');
      return;
    }
    if (!destination) {
      setError('Please select your drop-off destination.');
      return;
    }
    if (!fareDetails || fareDetails.suggestedFare <= 0) {
      setError('Please select valid pickup and destination points to calculate the fare.');
      return;
    }

    setLoading(true);

    const { data, error: apiError } = await api.createPassengerPost({
      origin: origin.name,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      origin_place_id: origin.placeId,
      destination: destination.name,
      dest_lat: destination.lat,
      dest_lng: destination.lng,
      dest_place_id: destination.placeId,
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

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.neutral[800]} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Request a Drop</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomAutoPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >


        {/* SECTION 1: PICKUP & DROP */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Your Route</Text>
          <LocationPicker
            label="Pickup Location"
            value={origin?.name || ''}
            onSelect={setOrigin}
            markerColor={Colors.primary[600]}
            city={user?.city}
            cityLat={cityData?.lat}
            cityLng={cityData?.lng}
          />
          <View style={{ height: Spacing.sm }} />
          <LocationPicker
            label="Drop-off Destination"
            value={destination?.name || ''}
            onSelect={setDestination}
            markerColor="#f59e0b"
            city={user?.city}
            cityLat={cityData?.lat}
            cityLng={cityData?.lng}
          />

          {/* Main Road Pickup Reminder */}
          <View style={styles.mainRoadNotice}>
            <Navigation size={15} color={Colors.primary[600]} strokeWidth={2.2} />
            <Text style={styles.mainRoadNoticeText}>
              Main Road Pickup: Please select a main road, bus stop, or metro station along your route. Drivers do not take interior colony detours to your home.
            </Text>
          </View>
        </View>

        {/* SECTION 2: AUTO-CALCULATED FARE (FIXED & AUTOMATIC) */}
        <View style={styles.section}>
          <View style={styles.fareSectionHeader}>
            <Coins size={20} color="#16a34a" />
            <Text style={styles.sectionHeadingNoMargin}>Auto Calculated Fare</Text>
          </View>

          {fareDetails ? (
            <View style={styles.fareResultCard}>
              <View style={styles.fareMainRow}>
                <View>
                  <Text style={styles.fareAmountLabel}>Trip Fare</Text>
                  <Text style={styles.fareAmountValue}>₹{fareDetails.suggestedFare}</Text>
                </View>
                <View style={styles.fareBadgeWrap}>
                  <View style={styles.fareDistanceBadge}>
                    <Text style={styles.fareDistanceText}>{fareDetails.distanceKm} km</Text>
                  </View>
                </View>
              </View>

              <View style={styles.fareCardDivider} />

              <View style={styles.fareTrafficRow}>
                <View style={styles.trafficDot} />
                <Text style={styles.trafficText}>
                  {fareDetails.trafficDescription}
                </Text>
              </View>

              <Text style={styles.fareNotice}>
                💰 Calculated automatically from road distance. Pay directly to driver via Cash or UPI after drop.
              </Text>
            </View>
          ) : (
            <View style={styles.farePlaceholderCard}>
              <MapPin size={22} color={Colors.neutral[400]} />
              <Text style={styles.farePlaceholderText}>
                Select pickup and drop-off points above to automatically calculate your fare.
              </Text>
            </View>
          )}
        </View>

        {/* SECTION 3: SCHEDULE & DROP FREQUENCY */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Schedule & Drop Frequency</Text>

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
                Daily / Repeat Drop
              </Text>
            </TouchableOpacity>
          </View>

          {/* One-Time Date & Time */}
          {!isDaily ? (
            <View style={styles.dateTimeRow}>
              <TouchableOpacity
                style={styles.dateTimeBtn}
                onPress={handleOpenDatePicker}
                activeOpacity={0.8}
              >
                <Calendar size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                <View style={styles.dateTimeTextWrap}>
                  <Text style={styles.dateTimeLabel}>Departure Date</Text>
                  <Text style={styles.dateTimeValue}>
                    {departureDate.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateTimeBtn}
                onPress={handleOpenTimePicker}
                activeOpacity={0.8}
              >
                <Clock size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                <View style={styles.dateTimeTextWrap}>
                  <Text style={styles.dateTimeLabel}>Departure Time</Text>
                  <Text style={styles.dateTimeValue}>
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
              {/* Daily Departure Time */}
              <TouchableOpacity
                style={[styles.dateTimeBtn, { marginBottom: Spacing.sm }]}
                onPress={handleOpenTimePicker}
                activeOpacity={0.8}
              >
                <Clock size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                <View style={styles.dateTimeTextWrap}>
                  <Text style={styles.dateTimeLabel}>Daily Pickup Time</Text>
                  <Text style={styles.dateTimeValue}>
                    Every day at {departureDate.toLocaleTimeString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Quick Presets */}
              <Text style={styles.fieldLabel}>Select Commute Days</Text>
              <View style={styles.presetRow}>
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
                    Mon – Fri (Weekdays)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetBtn, selectedDays.length === 7 && styles.presetBtnActive]}
                  onPress={() => setSelectedDays(allWeekDays)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      selectedDays.length === 7 && styles.presetBtnTextActive,
                    ]}
                  >
                    All 7 Days (Daily)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Individual Days Pills */}
              <View style={styles.dayPillRow}>
                {allWeekDays.map((day) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayPill, isSelected && styles.dayPillActive]}
                      onPress={() => toggleDay(day)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dayPillText, isSelected && styles.dayPillTextActive]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dailyNoticeBox}>
                <Info size={14} color="#15803d" />
                <Text style={styles.dailyNoticeText}>
                  Drop will recur on {selectedDays.join(', ')}. If you don't need a drop on any day, you can cancel or pause it anytime.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* SECTION 4: VEHICLE & SEATS */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Vehicle Preference & Seats</Text>

          <Text style={styles.fieldLabel}>Preferred Vehicle</Text>
          <View style={styles.vehiclePrefRow}>
            <TouchableOpacity
              style={[styles.vehiclePrefBtn, vehiclePref === 'car' && styles.vehiclePrefBtnActive]}
              onPress={() => setVehiclePref('car')}
              activeOpacity={0.8}
            >
              <Car size={18} color={vehiclePref === 'car' ? '#ffffff' : Colors.neutral[700]} />
              <Text style={[styles.vehiclePrefText, vehiclePref === 'car' && styles.vehiclePrefTextActive]}>
                Car
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vehiclePrefBtn, vehiclePref === 'bike' && styles.vehiclePrefBtnActive]}
              onPress={() => {
                setVehiclePref('bike');
                if (seatsNeeded > 1) setSeatsNeeded(1);
              }}
              activeOpacity={0.8}
            >
              <Bike size={18} color={vehiclePref === 'bike' ? '#ffffff' : Colors.neutral[700]} />
              <Text style={[styles.vehiclePrefText, vehiclePref === 'bike' && styles.vehiclePrefTextActive]}>
                Bike
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Passengers / Seats Needed</Text>
          <View style={styles.seatsRow}>
            {(vehiclePref === 'bike' ? [1] : [1, 2, 3, 4]).map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.seatBtn, seatsNeeded === num && styles.seatBtnActive]}
                onPress={() => setSeatsNeeded(num)}
                activeOpacity={0.8}
              >
                <Text style={[styles.seatBtnText, seatsNeeded === num && styles.seatBtnTextActive]}>
                  {num} {num === 1 ? 'Seat' : 'Seats'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SECTION 5: NOTES */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Notes for Driver (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="e.g., Waiting near Metro exit gate 2, holding a small laptop bag..."
            placeholderTextColor={Colors.neutral[400]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
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
      </ScrollView>

      {/* iOS Native Date Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="fade"
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalContainer}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>Select Departure Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.pickerModalDoneBtn}>
                  <Text style={styles.pickerModalDoneText}>Done</Text>
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

      {/* iOS Native Time Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="fade"
          visible={showTimePicker}
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalContainer}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>Select Departure Time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)} style={styles.pickerModalDoneBtn}>
                  <Text style={styles.pickerModalDoneText}>Done</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[100],
  },
  topBarTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: Spacing.sm,
  },
  infoBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: '#1e40af',
  },
  infoBannerSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 2,
    lineHeight: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  sectionHeading: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
    marginBottom: Spacing.sm,
  },
  mainRoadNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  mainRoadNoticeText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#0284c7',
    lineHeight: 15,
  },
  sectionHeadingNoMargin: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
  },
  fareSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  fareResultCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#86efac',
    padding: Spacing.md,
  },
  fareMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareAmountLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#15803d',
    textTransform: 'uppercase',
  },
  fareAmountValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: '#166534',
    marginTop: 1,
  },
  fareBadgeWrap: {
    alignItems: 'flex-end',
    gap: 3,
  },
  fareDistanceBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  fareDistanceText: {
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    color: '#ffffff',
  },
  fareRateText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#15803d',
  },
  fareCardDivider: {
    height: 1,
    backgroundColor: '#bbf7d0',
    marginVertical: Spacing.sm,
  },
  fareTrafficRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  trafficDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  trafficText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#166534',
  },
  fareNotice: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#15803d',
    lineHeight: 15,
  },
  farePlaceholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.neutral[50],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderStyle: 'dashed',
    gap: Spacing.xs,
  },
  farePlaceholderText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.neutral[500],
    textAlign: 'center',
    maxWidth: 260,
  },
  fieldLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[700],
    marginTop: Spacing.sm,
    marginBottom: 6,
  },
  // Frequency & Daily Drop Styles
  frequencyRow: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.lg,
    padding: 3,
    marginBottom: Spacing.sm,
  },
  frequencyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  frequencyBtnActive: {
    backgroundColor: Colors.primary[600],
    ...Shadow.sm,
  },
  frequencyBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[600],
  },
  frequencyBtnTextActive: {
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  dailyScheduleWrap: {
    gap: Spacing.xs,
  },
  presetRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  presetBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  presetBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[700],
  },
  presetBtnTextActive: {
    fontFamily: 'Inter-Bold',
    color: '#1d4ed8',
  },
  dayPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
    flexWrap: 'wrap',
  },
  dayPill: {
    flex: 1,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  dayPillActive: {
    backgroundColor: Colors.primary[600],
    borderColor: Colors.primary[600],
  },
  dayPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[700],
  },
  dayPillTextActive: {
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  dailyNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  dailyNoticeText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#15803d',
    lineHeight: 15,
  },

  dateTimeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dateTimeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  dateTimeTextWrap: {
    flex: 1,
  },
  dateTimeLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: Colors.neutral[500],
    textTransform: 'uppercase',
  },
  dateTimeValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: Colors.neutral[900],
    marginTop: 1,
  },
  vehiclePrefRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  vehiclePrefBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.md,
    paddingVertical: 10,
    gap: 6,
  },
  vehiclePrefBtnActive: {
    backgroundColor: Colors.primary[600],
  },
  vehiclePrefText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[700],
  },
  vehiclePrefTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  seatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  seatBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.md,
    paddingVertical: 10,
  },
  seatBtnActive: {
    backgroundColor: Colors.primary[600],
  },
  seatBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.neutral[800],
  },
  seatBtnTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  notesInput: {
    backgroundColor: Colors.neutral[50],
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.neutral[900],
    minHeight: 70,
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  errorText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#b91c1c',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary[600],
    borderRadius: Radius.xl,
    paddingVertical: 14,
    gap: 8,
    ...Shadow.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  pickerModalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
    backgroundColor: Colors.primary[50],
  },
  pickerModalTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.primary[800],
  },
  pickerModalDoneBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  pickerModalDoneText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: Colors.primary[600],
  },
});
