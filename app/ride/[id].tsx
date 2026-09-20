import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  Car,
  Bike,
  Star,
  Check,
  X,
  UserCheck,
  UserX,
  Navigation,
  FileText,
  MessageSquare,
  CreditCard,
  RefreshCw,
  Crosshair,
  ShieldCheck,
  PhoneCall,
  PhoneOff,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Ride, RideRequest, UserPublic, Rating, PaymentRecord, RideCall } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import LiveRideMap from '@/components/LiveRideMap';
import RideChatModal from '@/components/RideChatModal';
import InAppCallModal from '@/components/InAppCallModal';
import LocationPicker, { LocationResult } from '@/components/LocationPicker';
import { triggerNotificationSoundAlert } from '@/lib/notifications';

export default function RideDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, pickup } = useLocalSearchParams<{ id: string; pickup?: string }>();
  const { user } = useAuth();
  const [ride, setRide] = useState<Ride | null>(null);
  const [driver, setDriver] = useState<UserPublic | null>(null);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [myRequest, setMyRequest] = useState<RideRequest | null>(null);
  const [existingRating, setExistingRating] = useState<Rating | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [seatsRequested, setSeatsRequested] = useState(1);
  const [pickupPoint, setPickupPoint] = useState('');
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const [showChatModal, setShowChatModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  const isDriver = ride?.driver_id === user?.id;
  const rideId = Array.isArray(id) ? id[0] : id;

  function handleInitiateCall() {
    if (!ride) return;
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      Alert.alert(
        'Ride Completed',
        'In-app calling and chat are permanently closed after ride completion to protect both driver and passenger privacy.'
      );
      return;
    }

    if (isDriver && acceptedPassengers.length === 0 && pendingRequests.length === 0) {
      Alert.alert(
        'No Passengers',
        'You can only call passengers after they have requested or joined your ride.'
      );
      return;
    }

    if (!isDriver && !myRequest && !acceptedPassengers.some((p) => p.passenger_id === user?.id)) {
      Alert.alert(
        'Join Ride First',
        'You can only call the driver after requesting or joining this ride.'
      );
      return;
    }

    setShowCallModal(true);
  }


  // Initialize pickup location if passed via search query param (e.g. from Find Ride screen)
  useEffect(() => {
    if (pickup && !pickupPoint) {
      try {
        setPickupPoint(decodeURIComponent(pickup));
      } catch {
        setPickupPoint(pickup);
      }
    }
  }, [pickup]);

  const fetchRideDetail = useCallback(async () => {
    if (!rideId || !user) return;
    setLoading(true);

    const { data } = await api.getRide(rideId);
    if (data) {
      const d = data as any;
      setRide(d.ride as Ride);
      setDriver(d.ride?.driver ?? null);
      setRequests(d.requests ?? []);
      setMyRequest(d.my_request ?? null);
      setExistingRating(d.my_rating ?? null);
      setPayments(d.payments ?? []);
    }
    setLoading(false);
  }, [rideId, user]);

  useFocusEffect(
    useCallback(() => {
      fetchRideDetail();
    }, [fetchRideDetail])
  );

  async function handleDetectLivePickupLocation() {
    setIsDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please enable location permissions so we can lock your exact pickup point.'
        );
        setIsDetectingLocation(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setPickupLat(pos.coords.latitude);
      setPickupLng(pos.coords.longitude);

      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (geo) {
          const parts = [geo.name, geo.street, geo.subregion || geo.district, geo.city].filter(
            Boolean
          );
          const readable =
            parts.length > 0
              ? parts.join(', ')
              : `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setPickupPoint(readable);
        } else {
          setPickupPoint(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        }
      } catch {
        setPickupPoint(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      }
    } catch {
      Alert.alert('Location Error', 'Unable to detect live location. Please type or select your pickup point on the map.');
    } finally {
      setIsDetectingLocation(false);
    }
  }

  async function submitRequest() {
    if (!user || !rideId) return;
    if (!pickupPoint.trim()) {
      Alert.alert(
        'Pickup Location Required',
        'Please select where the driver can pick you up by tapping "Pickup Point" or using GPS.'
      );
      return;
    }
    setActionLoading(true);
    const { error } = await api.createRideRequest(rideId, {
      seats_requested: seatsRequested,
      pickup_point: pickupPoint.trim(),
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
    });
    setActionLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    triggerNotificationSoundAlert(
      'Request Sent! 🚗',
      'The driver will review your ride request.'
    );
    Alert.alert('Request Sent!', 'The driver will review your request.');
    fetchRideDetail();
  }

  async function handleRequestAction(requestId: string, action: 'accepted' | 'rejected') {
    setActionLoading(true);
    const { error } = await api.updateRequestStatus(requestId, action);
    setActionLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    triggerNotificationSoundAlert(
      action === 'accepted' ? 'Passenger Accepted! ✅' : 'Request Declined',
      action === 'accepted'
        ? 'Passenger has been added to your ride.'
        : 'Passenger request declined.'
    );
    fetchRideDetail();
  }

  async function updateRideStatus(newStatus: string) {
    if (!rideId) return;
    setActionLoading(true);
    const { error } = await api.updateRideStatus(rideId, newStatus);
    setActionLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    triggerNotificationSoundAlert(
      `Trip ${newStatus === 'in_progress' ? 'Started! 🚗' : newStatus === 'completed' ? 'Completed! 🏁' : 'Updated'}`,
      `Ride is now ${newStatus.replace('_', ' ')}`
    );
    fetchRideDetail();
  }

  async function cancelMyRequest() {
    if (!myRequest) return;
    setActionLoading(true);
    const { error } = await api.deleteRequest(myRequest.id);
    setActionLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    fetchRideDetail();
  }

  async function submitRating() {
    if (!user || !ride || !rideId) return;
    const rateeId = isDriver
      ? requests.find((r) => r.status === 'accepted')?.passenger_id
      : ride.driver_id;
    if (!rateeId) return;
    setActionLoading(true);
    const { error } = await api.createRating({
      ride_id: rideId,
      ratee_id: rateeId,
      score: ratingScore,
      comment: ratingComment.trim(),
    });
    setActionLoading(false);
    setShowRatingModal(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    Alert.alert('Rating Submitted!', 'Thank you for your feedback.');
    fetchRideDetail();
  }

  async function confirmPaymentReceived(passengerID: string) {
    if (!rideId) return;
    Alert.alert('Confirm Payment', 'How did the passenger pay?', [
      { text: 'Cash', onPress: () => doConfirmPayment(passengerID, 'cash') },
      { text: 'UPI', onPress: () => doConfirmPayment(passengerID, 'upi') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function doConfirmPayment(passengerID: string, method: string) {
    setActionLoading(true);
    const { error } = await api.confirmPayment(rideId!, {
      passenger_id: passengerID,
      payment_method: method,
    });
    setActionLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    Alert.alert('Payment Confirmed! 💰');
    fetchRideDetail();
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    if (isTomorrow) return `Tomorrow, ${time}`;
    return (
      d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) +
      `, ${time}`
    );
  }

  function formatPrice(price: number) {
    return `₹${price.toFixed(0)}`;
  }

  const statusColors: Record<string, string> = {
    open: Colors.primary[600],
    confirmed: Colors.accent[600],
    in_progress: Colors.warning[600],
    completed: Colors.success[600],
    cancelled: Colors.error[600],
  };
  const statusLabels: Record<string, string> = {
    open: 'Open',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const acceptedPassengers = requests.filter((r) => r.status === 'accepted');
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const canRate = ride?.status === 'completed' && !existingRating;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorTitle}>Ride not found</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = statusColors[ride.status] ?? Colors.neutral[500];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Bar - Responsive layout for larger fonts */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={Colors.neutral[800]} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Ride Details
        </Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[
              styles.topBarActionButton,
              (ride?.status === 'completed' || ride?.status === 'cancelled') && styles.topBarActionDisabled,
            ]}
            onPress={handleInitiateCall}
            activeOpacity={0.7}
          >
            <PhoneCall
              size={14}
              color={
                ride?.status === 'completed' || ride?.status === 'cancelled'
                  ? Colors.neutral[400]
                  : '#16a34a'
              }
              strokeWidth={2.4}
            />
            <Text
              style={[
                styles.topBarActionText,
                (ride?.status === 'completed' || ride?.status === 'cancelled') && { color: Colors.neutral[400] },
              ]}
            >
              Call
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topBarActionButton}
            onPress={() => setShowChatModal(true)}
            activeOpacity={0.7}
          >
            <MessageSquare size={14} color={Colors.primary[600]} strokeWidth={2.4} />
            <Text style={styles.topBarActionText}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Route Header Card - Multi-line responsive */}
        <LinearGradient
          colors={[Colors.primary[600], Colors.primary[400]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.routeHeader}
        >
          <View style={styles.routeBig}>
            <View style={styles.routeBigPoint}>
              <View style={[styles.routeBigDot, { backgroundColor: Colors.neutral[0] }]} />
              <Text style={styles.routeBigText}>{ride.origin}</Text>
            </View>
            <View style={styles.routeBigLine} />
            <View style={styles.routeBigPoint}>
              <View style={[styles.routeBigDot, { backgroundColor: Colors.secondary[300] }]} />
              <Text style={styles.routeBigText}>{ride.destination}</Text>
            </View>
          </View>

          {/* Meta badges - wraps automatically for Medium/Large display fonts */}
          <View style={styles.headerMeta}>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '30' }]}>
              <Text style={[styles.statusPillText, { color: Colors.neutral[0] }]}>
                {statusLabels[ride.status] ?? ride.status}
              </Text>
            </View>

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    ride.vehicle_type === 'bike' ? '#D97706' : 'rgba(255,255,255,0.25)',
                },
              ]}
            >
              <Text style={[styles.statusPillText, { color: Colors.neutral[0] }]}>
                {ride.vehicle_type === 'bike' ? '🏍️ BIKE' : '🚗 CAR'}
              </Text>
            </View>

            {ride.is_daily || ride.notes?.toLowerCase().includes('daily') ? (
              <View style={[styles.statusPill, { backgroundColor: '#0284c7' }]}>
                <Text style={[styles.statusPillText, { color: Colors.neutral[0] }]}>
                  🔁 {ride.recurring_days ? `DAILY (${ride.recurring_days})` : 'DAILY'}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Text style={[styles.statusPillText, { color: Colors.neutral[0] }]}>🗓️ ONCE</Text>
              </View>
            )}

            <View style={[styles.statusPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.cityPillText}>📍 {ride.city}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Live Interactive Leaflet Map for Driver & Passenger */}
        <View style={styles.mapSection}>
          <LiveRideMap
            rideId={rideId!}
            isDriver={isDriver}
            vehicleType={ride.vehicle_type}
            driverLiveLat={ride.driver_live_lat}
            driverLiveLng={ride.driver_live_lng}
            driverName={driver?.full_name ?? 'Driver'}
            originName={ride.origin}
            originLat={ride.origin_lat}
            originLng={ride.origin_lng}
            destName={ride.destination}
            destLat={ride.dest_lat}
            destLng={ride.dest_lng}
            pickupName={myRequest?.pickup_point || acceptedPassengers[0]?.pickup_point || undefined}
            pickupLat={myRequest?.pickup_lat || acceptedPassengers[0]?.pickup_lat || undefined}
            pickupLng={myRequest?.pickup_lng || acceptedPassengers[0]?.pickup_lng || undefined}
            passengerName={
              myRequest?.passenger?.full_name || acceptedPassengers[0]?.passenger?.full_name
            }
            rideStatus={ride.status}
          />
        </View>

        {/* Real-time In-App Calling & Live Chat Section */}
        <View style={styles.commCardsRow}>
          {/* In-App Call Card */}
          <TouchableOpacity
            style={[
              styles.commCard,
              (ride.status === 'completed' || ride.status === 'cancelled') && styles.commCardDisabled,
            ]}
            onPress={handleInitiateCall}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.commCardIcon,
                {
                  backgroundColor:
                    ride.status === 'completed' || ride.status === 'cancelled'
                      ? Colors.neutral[400]
                      : '#16a34a',
                },
              ]}
            >
              {ride.status === 'completed' || ride.status === 'cancelled' ? (
                <PhoneOff size={18} color="#ffffff" strokeWidth={2.2} />
              ) : (
                <PhoneCall size={18} color="#ffffff" strokeWidth={2.2} />
              )}
            </View>
            <View style={styles.commCardBody}>
              <Text style={styles.commCardTitle} numberOfLines={1}>
                {ride.status === 'completed' || ride.status === 'cancelled'
                  ? 'Call Closed'
                  : isDriver
                  ? 'In-App Call'
                  : 'Call Driver'}
              </Text>
              <Text style={styles.commCardSubtitle} numberOfLines={1}>
                {ride.status === 'completed' || ride.status === 'cancelled'
                  ? 'Ride completed'
                  : 'Masked • Secure'}
              </Text>
            </View>
            <View
              style={[
                styles.commCardBadge,
                ride.status === 'completed' || ride.status === 'cancelled'
                  ? { backgroundColor: Colors.neutral[100], borderColor: Colors.neutral[300] }
                  : { backgroundColor: '#dcfce7', borderColor: '#86efac' },
              ]}
            >
              <Text
                style={[
                  styles.commCardBadgeText,
                  ride.status === 'completed' || ride.status === 'cancelled'
                    ? { color: Colors.neutral[500] }
                    : { color: '#15803d' },
                ]}
              >
                {ride.status === 'completed' || ride.status === 'cancelled' ? 'Closed' : 'Call'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Live Chat Card */}
          <TouchableOpacity
            style={[
              styles.commCard,
              (ride.status === 'completed' || ride.status === 'cancelled') && styles.commCardDisabled,
            ]}
            onPress={() => setShowChatModal(true)}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.commCardIcon,
                {
                  backgroundColor:
                    ride.status === 'completed' || ride.status === 'cancelled'
                      ? Colors.neutral[400]
                      : Colors.primary[600],
                },
              ]}
            >
              <MessageSquare size={18} color="#ffffff" strokeWidth={2.2} />
            </View>
            <View style={styles.commCardBody}>
              <Text style={styles.commCardTitle} numberOfLines={1}>
                {ride.status === 'completed' || ride.status === 'cancelled'
                  ? 'Chat Closed'
                  : 'Live Chat'}
              </Text>
              <Text style={styles.commCardSubtitle} numberOfLines={1}>
                {ride.status === 'completed' || ride.status === 'cancelled'
                  ? 'Ride completed'
                  : 'ETA & messages'}
              </Text>
            </View>
            <View
              style={[
                styles.commCardBadge,
                ride.status === 'completed' || ride.status === 'cancelled'
                  ? { backgroundColor: Colors.neutral[100], borderColor: Colors.neutral[300] }
                  : { backgroundColor: Colors.primary[50], borderColor: Colors.primary[200] },
              ]}
            >
              <Text
                style={[
                  styles.commCardBadgeText,
                  ride.status === 'completed' || ride.status === 'cancelled'
                    ? { color: Colors.neutral[500] }
                    : { color: Colors.primary[700] },
                ]}
              >
                {ride.status === 'completed' || ride.status === 'cancelled' ? 'Closed' : 'Chat'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Info Grid - Responsive 2-column flex cards that never truncate on large fonts */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Clock size={18} color={Colors.primary[500]} strokeWidth={2} />
            <Text style={styles.infoCardLabel}>Departure</Text>
            <Text style={styles.infoCardValue}>{formatDate(ride.departure_time)}</Text>
          </View>

          <View style={styles.infoCard}>
            <Users size={18} color={Colors.primary[500]} strokeWidth={2} />
            <Text style={styles.infoCardLabel}>
              {ride.vehicle_type === 'bike' ? 'Pillion Rider' : 'Seats Available'}
            </Text>
            <Text style={styles.infoCardValue}>
              {ride.seats_available} of {ride.seats_total} left
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.rupeeIcon}>₹</Text>
            <Text style={styles.infoCardLabel}>Price / Seat</Text>
            <Text style={styles.infoCardValue}>{formatPrice(ride.price_per_seat)}</Text>
          </View>

          <View style={styles.infoCard}>
            {ride.vehicle_type === 'bike' ? (
              <Bike size={18} color="#D97706" strokeWidth={2} />
            ) : (
              <Car size={18} color={Colors.primary[500]} strokeWidth={2} />
            )}
            <Text style={styles.infoCardLabel}>Vehicle</Text>
            <Text style={styles.infoCardValue}>
              {ride.vehicle_info || (ride.vehicle_type === 'bike' ? 'Two-Wheeler' : 'Car')}
            </Text>
          </View>
        </View>

        {/* Pay after ride notice */}
        <View style={styles.payNotice}>
          <CreditCard size={18} color={Colors.success[700]} strokeWidth={2} />
          <Text style={styles.payNoticeText}>
            Pay {formatPrice(ride.price_per_seat * (myRequest?.seats_requested ?? 1))} directly to
            driver (Cash or UPI) after your trip.
          </Text>
        </View>

        {ride.notes ? (
          <View style={styles.notesCard}>
            <View style={styles.notesHeader}>
              <FileText size={16} color={Colors.neutral[500]} strokeWidth={2} />
              <Text style={styles.notesTitle}>Driver Notes</Text>
            </View>
            <Text style={styles.notesText}>{ride.notes}</Text>
          </View>
        ) : null}

        {/* Driver Profile Card */}
        {driver && !isDriver && (
          <View style={styles.driverCard}>
            <Text style={styles.cardTitle}>Driver</Text>
            <View style={styles.driverRow}>
              {driver.avatar_url ? (
                <Image source={{ uri: driver.avatar_url }} style={styles.driverAvatarImg} />
              ) : (
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>
                    {driver.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.driverInfo}>
                <View style={styles.driverNameRow}>
                  <Text style={styles.driverNameText}>{driver.full_name}</Text>
                  {driver.is_verified_driver && (
                    <View style={styles.verifiedBadge}>
                      <ShieldCheck size={13} color={Colors.success[700]} strokeWidth={2.4} />
                      <Text style={styles.verifiedBadgeText}>Verified</Text>
                    </View>
                  )}
                </View>
                {driver.avg_rating > 0 && (
                  <View style={styles.driverRatingRow}>
                    <Star
                      size={13}
                      color={Colors.secondary[500]}
                      fill={Colors.secondary[500]}
                      strokeWidth={2}
                    />
                    <Text style={styles.driverRatingText}>
                      {driver.avg_rating.toFixed(1)} ({driver.total_rides} completed rides)
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* PASSENGER BOOKING & PICKUP LOCATION SECTION                               */}
        {/* Asks passenger to select pickup location with full interactive map/search */}
        {/* ========================================================================= */}
        {!isDriver && !myRequest && ride.status === 'open' && ride.seats_available > 0 && (
          <View style={styles.bookingCard}>
            <View style={styles.bookingCardHeader}>
              <View style={styles.bookingBadge}>
                <MapPin size={13} color={Colors.primary[700]} strokeWidth={2.4} />
                <Text style={styles.bookingBadgeText}>SELECT PICKUP & SEATS</Text>
              </View>
              <Text style={styles.bookingTitle}>Request to Join This Ride</Text>
              <Text style={styles.bookingSubtitle}>
                Tell the driver exactly where along the route you will wait for pickup.
              </Text>
            </View>

            {ride.is_daily || ride.notes?.toLowerCase().includes('daily') ? (
              <View style={styles.recurrenceBannerDaily}>
                <RefreshCw size={15} color={Colors.primary[700]} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurrenceBannerTitle}>
                    {ride.recurring_days ? `Daily Commute (${ride.recurring_days})` : 'Daily Commute (Mon–Fri)'}
                  </Text>
                  <Text style={styles.recurrenceBannerSub}>
                    Regular commute every {ride.recurring_days || 'Mon–Fri'} at{' '}
                    {new Date(ride.departure_time).toLocaleTimeString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                    . If either driver or passenger cannot make it on any day, you can cancel easily with full live notification.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 1. PICKUP LOCATION PICKER (Interactive Map + Search + Curated Metro Hubs) */}
            <View style={styles.bookingField}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.bookingFieldLabel}>Where should the driver pick you up? *</Text>
                <TouchableOpacity
                  style={styles.detectLocationBtnInline}
                  onPress={handleDetectLivePickupLocation}
                  disabled={isDetectingLocation}
                  activeOpacity={0.7}
                >
                  {isDetectingLocation ? (
                    <ActivityIndicator size="small" color={Colors.primary[600]} />
                  ) : (
                    <Crosshair size={13} color={Colors.primary[600]} strokeWidth={2.4} />
                  )}
                  <Text style={styles.detectLocationBtnInlineText}>Use GPS</Text>
                </TouchableOpacity>
              </View>

              <LocationPicker
                label="Pickup Location"
                value={pickupPoint}
                onSelect={(result: LocationResult) => {
                  setPickupPoint(result.name);
                  setPickupLat(result.lat);
                  setPickupLng(result.lng);
                }}
                markerColor={Colors.primary[600]}
                city={ride.city || user?.city}
                cityLat={ride.origin_lat}
                cityLng={ride.origin_lng}
              />

              {/* Main Road Pickup Rule Reminder for Passenger */}
              <View style={styles.mainRoadPassengerNotice}>
                <Navigation size={14} color={Colors.primary[600]} strokeWidth={2.2} />
                <Text style={styles.mainRoadPassengerNoticeText}>
                  Main Road Pickup: Please meet the driver along their main route. Drivers will not enter interior colony streets or home doorsteps.
                </Text>
              </View>

              {pickupLat && pickupLng ? (
                <View style={styles.gpsLockedRow}>
                  <Check size={13} color={Colors.success[700]} strokeWidth={2.5} />
                  <Text style={styles.gpsDetectedBadge}>
                    GPS Pin Locked ({pickupLat.toFixed(4)}, {pickupLng.toFixed(4)})
                  </Text>
                </View>
              ) : null}
            </View>

            {/* 2. SEATS / PILLION SELECTOR */}
            <View style={styles.bookingField}>
              <Text style={styles.bookingFieldLabel}>
                {ride.vehicle_type === 'bike' ? 'Rider / Pillion' : 'Number of Seats Needed'}
              </Text>
              <View style={styles.seatsSelector}>
                {(ride.vehicle_type === 'bike' ? [1] : [1, 2, 3, 4]).map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.seatOption,
                      seatsRequested === n && styles.seatOptionSelected,
                    ]}
                    onPress={() => setSeatsRequested(n)}
                    disabled={n > ride.seats_available}
                  >
                    <Text
                      style={[
                        styles.seatOptionText,
                        seatsRequested === n && styles.seatOptionTextSelected,
                        n > ride.seats_available && { color: Colors.neutral[300] },
                      ]}
                    >
                      {n} {ride.vehicle_type === 'bike' ? 'Pillion' : n === 1 ? 'Seat' : 'Seats'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 3. PRICE BREAKDOWN */}
            <View style={styles.priceRowSummary}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={styles.priceLabel}>Total Fare to Pay Driver</Text>
                <Text style={styles.priceHelp}>Pay after ride via Cash or UPI</Text>
              </View>
              <Text style={styles.priceValue}>
                {formatPrice(ride.price_per_seat * seatsRequested)}
              </Text>
            </View>

            {/* 4. SUBMIT BUTTON */}
            <TouchableOpacity
              style={[
                styles.primaryAction,
                !pickupPoint.trim() && styles.primaryActionPendingLocation,
              ]}
              onPress={submitRequest}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.neutral[0]} />
              ) : (
                <Text style={styles.primaryActionText}>
                  {pickupPoint.trim() ? 'Send Ride Request 🚗' : 'Select Pickup Location Above'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Passenger's already submitted request status */}
        {!isDriver && myRequest && (
          <View style={styles.myRequestCard}>
            <Text style={styles.cardTitle}>Your Ride Request</Text>
            <View style={styles.requestStatusRow}>
              <View
                style={[
                  styles.requestStatusBadge,
                  {
                    backgroundColor:
                      myRequest.status === 'accepted'
                        ? Colors.success[50]
                        : myRequest.status === 'rejected'
                        ? Colors.error[50]
                        : Colors.warning[50],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.requestStatusText,
                    {
                      color:
                        myRequest.status === 'accepted'
                          ? Colors.success[700]
                          : myRequest.status === 'rejected'
                          ? Colors.error[700]
                          : Colors.warning[700],
                    },
                  ]}
                >
                  {myRequest.status === 'accepted'
                    ? 'Accepted by Driver ✅'
                    : myRequest.status === 'rejected'
                    ? 'Request Declined ❌'
                    : 'Pending Driver Review ⏳'}
                </Text>
              </View>
              <Text style={styles.requestSeatsText}>
                {myRequest.seats_requested} seat{myRequest.seats_requested !== 1 ? 's' : ''}
              </Text>
            </View>

            {myRequest.pickup_point ? (
              <View style={styles.confirmedPickupRow}>
                <MapPin size={15} color={Colors.primary[600]} strokeWidth={2} />
                <Text style={styles.confirmedPickupText}>
                  Pickup: {myRequest.pickup_point}
                </Text>
              </View>
            ) : null}

            {myRequest.status === 'pending' && (
              <TouchableOpacity
                style={styles.cancelRequestButton}
                onPress={cancelMyRequest}
                disabled={actionLoading}
              >
                <X size={16} color={Colors.error[600]} strokeWidth={2} />
                <Text style={styles.cancelRequestText}>Cancel Request</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Driver: Passenger Requests Management */}
        {isDriver && (
          <View style={styles.requestsCard}>
            <Text style={styles.cardTitle}>Passenger Requests</Text>
            {pendingRequests.length > 0 && (
              <View style={styles.requestGroup}>
                <Text style={styles.requestGroupLabel}>
                  Pending Approval ({pendingRequests.length})
                </Text>
                {pendingRequests.map((req) => (
                  <View key={req.id} style={styles.requestItem}>
                    <View style={styles.requestItemInfo}>
                      <View style={styles.requestAvatar}>
                        <Text style={styles.requestAvatarText}>
                          {(req.passenger?.full_name ?? '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.requestTextCol}>
                        <Text style={styles.requestName}>
                          {req.passenger?.full_name ?? 'Passenger'}
                        </Text>
                        <Text style={styles.requestDetails}>
                          {req.seats_requested} seat{req.seats_requested !== 1 ? 's' : ''}
                          {req.pickup_point ? ` • Pickup: ${req.pickup_point}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={() => handleRequestAction(req.id, 'accepted')}
                        disabled={actionLoading}
                        activeOpacity={0.8}
                      >
                        <Check size={14} color="#ffffff" strokeWidth={2.5} />
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => handleRequestAction(req.id, 'rejected')}
                        disabled={actionLoading}
                        activeOpacity={0.8}
                      >
                        <X size={14} color={Colors.error[600]} strokeWidth={2.5} />
                        <Text style={styles.rejectButtonText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {acceptedPassengers.length > 0 && (
              <View style={styles.requestGroup}>
                <Text style={styles.requestGroupLabel}>
                  Confirmed Passengers ({acceptedPassengers.length})
                </Text>
                {acceptedPassengers.map((req) => (
                  <View key={req.id} style={styles.requestItem}>
                    <View style={styles.requestItemInfo}>
                      <View style={styles.requestAvatar}>
                        <Text style={styles.requestAvatarText}>
                          {(req.passenger?.full_name ?? '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.requestTextCol}>
                        <Text style={styles.requestName}>
                          {req.passenger?.full_name ?? 'Passenger'}
                        </Text>
                        <Text style={styles.requestDetails}>
                          {req.seats_requested} seat{req.seats_requested !== 1 ? 's' : ''}
                          {req.pickup_point ? ` • Pickup: ${req.pickup_point}` : ''}
                        </Text>
                      </View>
                    </View>
                    <Check size={18} color={Colors.success[600]} strokeWidth={2.5} />
                  </View>
                ))}
              </View>
            )}

            {requests.length === 0 && (
              <Text style={styles.noRequestsText}>No passenger requests yet.</Text>
            )}
          </View>
        )}

        {/* Payment Status for completed rides */}
        {isDriver && ride.status === 'completed' && payments.length > 0 && (
          <View style={styles.paymentsCard}>
            <Text style={styles.cardTitle}>Passenger Payments</Text>
            {payments.map((p) => {
              const passenger = acceptedPassengers.find((r) => r.passenger_id === p.passenger_id);
              return (
                <View key={p.id} style={styles.paymentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentName}>
                      {passenger?.passenger?.full_name ?? 'Passenger'}
                    </Text>
                    <Text style={styles.paymentAmount}>{formatPrice(p.amount)}</Text>
                  </View>
                  {p.status === 'paid' ? (
                    <View style={styles.paidBadge}>
                      <Check size={14} color={Colors.success[600]} strokeWidth={2} />
                      <Text style={styles.paidText}>Paid ({p.payment_method})</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.confirmPayButton}
                      onPress={() => confirmPaymentReceived(p.passenger_id)}
                    >
                      <Text style={styles.confirmPayText}>Confirm Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Driver Status Actions & Rating */}
        <View style={styles.actionsContainer}>
          {isDriver && ride.status === 'open' && acceptedPassengers.length > 0 && (
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => updateRideStatus('confirmed')}
              disabled={actionLoading}
            >
              <Check size={18} color={Colors.neutral[0]} strokeWidth={2} />
              <Text style={styles.primaryActionText}>Confirm Ride</Text>
            </TouchableOpacity>
          )}

          {isDriver && ride.status === 'confirmed' && (
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: Colors.warning[600] }]}
              onPress={() => updateRideStatus('in_progress')}
              disabled={actionLoading}
            >
              <Navigation size={18} color={Colors.neutral[0]} strokeWidth={2} />
              <Text style={styles.primaryActionText}>Start Trip</Text>
            </TouchableOpacity>
          )}

          {isDriver && ride.status === 'in_progress' && (
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: Colors.success[600] }]}
              onPress={() => updateRideStatus('completed')}
              disabled={actionLoading}
            >
              <Check size={18} color={Colors.neutral[0]} strokeWidth={2} />
              <Text style={styles.primaryActionText}>Complete Trip</Text>
            </TouchableOpacity>
          )}

          {isDriver && (ride.status === 'open' || ride.status === 'confirmed') && (
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() =>
                Alert.alert(
                  'Cancel Ride?',
                  'If you do not need to drive today or your plans changed, you can cancel. Passengers will be notified immediately.',
                  [
                    { text: 'Keep Ride', style: 'cancel' },
                    {
                      text: 'Yes, Cancel Ride',
                      style: 'destructive',
                      onPress: () => updateRideStatus('cancelled'),
                    },
                  ]
                )
              }
              disabled={actionLoading}
            >
              <Text style={styles.secondaryActionText}>Cancel Ride</Text>
            </TouchableOpacity>
          )}

          {canRate && (
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => setShowRatingModal(true)}
            >
              <Star size={18} color={Colors.neutral[0]} fill={Colors.neutral[0]} strokeWidth={2} />
              <Text style={styles.primaryActionText}>
                Rate {isDriver ? 'Passenger' : 'Driver'}
              </Text>
            </TouchableOpacity>
          )}

          {existingRating && ride.status === 'completed' && (
            <View style={styles.ratedBanner}>
              <Check size={18} color={Colors.success[600]} strokeWidth={2} />
              <Text style={styles.ratedText}>
                You've rated this {isDriver ? 'passenger' : 'driver'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rate {isDriver ? 'Passenger' : 'Driver'}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setRatingScore(n)}>
                  <Star
                    size={40}
                    color={Colors.secondary[500]}
                    fill={n <= ratingScore ? Colors.secondary[500] : 'transparent'}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Comment (optional)</Text>
            <View style={styles.modalInput}>
              <MessageSquare
                size={18}
                color={Colors.neutral[400]}
                strokeWidth={2}
                style={{ marginTop: 4 }}
              />
              <TextInput
                style={[styles.modalInputText, { minHeight: 60 }]}
                placeholder="Share your commute experience..."
                placeholderTextColor={Colors.neutral[400]}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={submitRating}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={Colors.neutral[0]} />
                ) : (
                  <Text style={styles.modalConfirmText}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Real-time In-Ride Live Chat Modal */}
      <RideChatModal
        visible={showChatModal}
        onClose={() => setShowChatModal(false)}
        rideId={rideId!}
        rideStatus={ride?.status || 'open'}
        otherPartyName={
          isDriver
            ? acceptedPassengers[0]?.passenger?.full_name ||
              pendingRequests[0]?.passenger?.full_name ||
              'Passenger'
            : driver?.full_name || 'Driver'
        }
        isDriver={isDriver}
        onStartCall={() => {
          setShowChatModal(false);
          handleInitiateCall();
        }}
      />

      {/* App-to-App Secure Audio Calling Modal (Outgoing Call) */}
      <InAppCallModal
        visible={showCallModal}
        onClose={() => setShowCallModal(false)}
        rideId={rideId!}
        rideStatus={ride?.status || 'open'}
        vehicleType={ride?.vehicle_type}
        originName={ride?.origin}
        destinationName={ride?.destination}
        otherPartyName={
          isDriver
            ? acceptedPassengers[0]?.passenger?.full_name ||
              pendingRequests[0]?.passenger?.full_name ||
              'Passenger'
            : driver?.full_name || 'Driver'
        }
        otherPartyRole={isDriver ? 'Passenger' : 'Driver'}
        otherPartyAvatar={
          isDriver
            ? acceptedPassengers[0]?.passenger?.avatar_url ||
              pendingRequests[0]?.passenger?.avatar_url
            : driver?.avatar_url
        }
        targetReceiverId={
          isDriver
            ? acceptedPassengers[0]?.passenger?.id || pendingRequests[0]?.passenger?.id
            : driver?.id
        }
        isIncoming={false}
        existingCall={null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[50],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
    minHeight: 52,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
    flexShrink: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[700],
  },
  backLink: {
    marginTop: Spacing.md,
  },
  backLinkText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.md,
    color: Colors.primary[600],
  },
  scrollView: {
    flex: 1,
  },

  // Route Header Card - Multi-line responsive for large accessibility fonts
  routeHeader: {
    margin: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadow.lg,
  },
  routeBig: {
    marginBottom: Spacing.md,
  },
  routeBigPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm + 2,
  },
  routeBigDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
  },
  routeBigText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[0],
    flex: 1,
    flexShrink: 1,
    lineHeight: 24,
  },
  routeBigLine: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginLeft: 5,
    marginVertical: 2,
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  statusPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
  },
  cityPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: Colors.neutral[0],
  },

  // Info Grid - Flexible 2-column cards that expand with font scaling
  infoGrid: {
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minWidth: '47%',
    flex: 1,
    ...Shadow.sm,
  },
  infoCardLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[400],
    marginTop: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[800],
    marginTop: 3,
    lineHeight: 20,
  },
  rupeeIcon: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.primary[500],
  },

  payNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.success[50],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.success[100],
  },
  payNoticeText: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.success[700],
    flex: 1,
    lineHeight: 18,
  },

  notesCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  notesTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[600],
  },
  notesText: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.neutral[700],
    lineHeight: 20,
  },

  // Driver Card
  driverCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
    marginBottom: Spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  driverAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.xl,
    color: Colors.primary[700],
  },
  driverInfo: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  driverNameText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[800],
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.success[50],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  verifiedBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.success[700],
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  driverRatingText: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
  },

  // =========================================================================
  // PASSENGER BOOKING CARD STYLES
  // =========================================================================
  bookingCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary[300],
    ...Shadow.md,
  },
  bookingCardHeader: {
    marginBottom: Spacing.sm,
  },
  mainRoadPassengerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  mainRoadPassengerNoticeText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#0284c7',
    lineHeight: 15,
  },
  bookingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  bookingBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.primary[700],
    letterSpacing: 0.5,
  },
  bookingTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
  },
  bookingSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    marginTop: 3,
    lineHeight: 17,
  },
  bookingField: {
    marginTop: Spacing.md,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  bookingFieldLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[800],
  },
  detectLocationBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  detectLocationBtnInlineText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: Colors.primary[700],
  },
  gpsLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginLeft: 2,
  },
  gpsDetectedBadge: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.success[700],
  },

  // Seats selector
  seatsSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 4,
  },
  seatOption: {
    minWidth: 54,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
  },
  seatOptionSelected: {
    borderColor: Colors.primary[500],
    backgroundColor: Colors.primary[50],
  },
  seatOptionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[600],
  },
  seatOptionTextSelected: {
    color: Colors.primary[700],
    fontFamily: 'Inter-Bold',
  },

  priceRowSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
    marginBottom: Spacing.md,
  },
  priceLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[800],
  },
  priceHelp: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  priceValue: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.xl,
    color: Colors.primary[600],
  },

  primaryActionPendingLocation: {
    backgroundColor: Colors.neutral[400],
  },

  // My Request Card
  myRequestCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  requestStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  requestStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  requestStatusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
  },
  requestSeatsText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.sm,
    color: Colors.neutral[600],
  },
  confirmedPickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingHorizontal: 2,
  },
  confirmedPickupText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: Colors.neutral[700],
    flex: 1,
  },
  cancelRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cancelRequestText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.sm,
    color: Colors.error[600],
  },

  // Driver: Requests card
  requestsCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  requestGroup: {
    marginBottom: Spacing.md,
  },
  requestGroupLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[500],
    marginBottom: Spacing.sm,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  requestItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 180,
  },
  requestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.primary[700],
  },
  requestTextCol: {
    flex: 1,
  },
  requestName: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.sm,
    color: Colors.neutral[800],
  },
  requestDetails: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    marginTop: 2,
    lineHeight: 16,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success[600],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  acceptButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: '#ffffff',
  },
  rejectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.error[50],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.error[200],
  },
  rejectButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.error[600],
  },
  noRequestsText: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.neutral[400],
  },

  // Payments Card
  paymentsCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
    gap: Spacing.sm,
  },
  paymentName: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.sm,
    color: Colors.neutral[800],
  },
  paymentAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: Colors.primary[600],
    marginTop: 2,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  paidText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.success[700],
  },
  confirmPayButton: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  confirmPayText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.neutral[0],
  },

  // Actions Container - Responsive flexible buttons
  actionsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  primaryAction: {
    backgroundColor: Colors.primary[500],
    borderRadius: Radius.md,
    minHeight: 52,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadow.md,
  },
  primaryActionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[0],
    textAlign: 'center',
  },
  secondaryAction: {
    borderRadius: Radius.md,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.error[200],
  },
  secondaryActionText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.md,
    color: Colors.error[600],
  },
  ratedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.success[50],
    borderRadius: Radius.md,
  },
  ratedText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.md,
    color: Colors.success[700],
  },

  // Top Bar Actions
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topBarActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  topBarActionDisabled: {
    opacity: 0.6,
  },
  topBarActionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.neutral[800],
  },

  // Dual Communication Section (Calling & Chatting)
  commCardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  commCard: {
    flex: 1,
    backgroundColor: Colors.neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 3,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  commCardDisabled: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[200],
    opacity: 0.85,
  },
  commCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commCardBody: {
    flex: 1,
  },
  commCardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.neutral[900],
  },
  commCardSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: Colors.neutral[500],
    marginTop: 1,
  },
  commCardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  commCardBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },
  mapSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },

  // Rating Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.neutral[0],
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.xl,
    color: Colors.neutral[900],
  },
  modalLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[600],
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalInput: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  modalInputText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
    paddingVertical: Spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  modalCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  modalCancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[600],
  },
  modalConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary[500],
    ...Shadow.md,
  },
  modalConfirmText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[0],
  },
  starsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },

  // Recurrence banners
  recurrenceBannerDaily: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  recurrenceBannerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.primary[800],
  },
  recurrenceBannerSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.primary[700],
    marginTop: 2,
    lineHeight: 15,
  },
  recurrenceBannerOnce: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.neutral[100],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  recurrenceBannerTitleOnce: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.neutral[800],
  },
  recurrenceBannerSubOnce: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[600],
    marginTop: 2,
  },
});
