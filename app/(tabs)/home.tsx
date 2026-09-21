import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import {
  Car,
  Bike,
  PlusCircle,
  Search,
  Star,
  Clock,
  ArrowRight,
  MapPin,
  ShieldCheck,
  Shield,
  ChevronRight,
  Zap,
  Navigation,
  Users,
  Plus,
} from 'lucide-react-native';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Ride, VehicleType, PassengerPost, DriverVerification } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppLogo from '@/components/AppLogo';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatPrice(price: number): string {
  return `₹${price.toFixed(0)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  type FeedMode = 'offered' | 'requested';
  const [feedMode, setFeedMode] = useState<FeedMode>('offered');
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [passengerPosts, setPassengerPosts] = useState<PassengerPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingPostId, setAcceptingPostId] = useState<string | null>(null);
  const [liveLocationName, setLiveLocationName] = useState<string | null>(null);
  const [detectingLoc, setDetectingLoc] = useState(false);

  // Auto-detect real live GPS location with permission request & fast cache
  const detectLiveLocation = useCallback(async (forcePrompt = false) => {
    setDetectingLoc(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status === 'granted') {
        // 1. Fast last-known position for instant UI display
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
          });
          if (geo) {
            const area = geo.subregion || geo.district || geo.name || geo.city;
            const city = geo.city || geo.region;
            const display = area && city && area !== city ? `${area}, ${city}` : area || city || 'Live GPS';
            setLiveLocationName(display);
          }
        }
        // 2. Accurate current GPS coordinates
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (geo) {
          const area = geo.subregion || geo.district || geo.name || geo.city;
          const city = geo.city || geo.region;
          const display = area && city && area !== city ? `${area}, ${city}` : area || city || 'Live GPS';
          setLiveLocationName(display);
        }
      } else if (forcePrompt) {
        Alert.alert(
          'Location Permission Required',
          'Please enable location services in your phone settings to detect your current location.',
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.log('Error detecting live location:', e);
    } finally {
      setDetectingLoc(false);
    }
  }, []);

  useEffect(() => {
    detectLiveLocation(false);
  }, [detectLiveLocation]);

  const [verification, setVerification] = useState<DriverVerification | null>(null);

  useEffect(() => {
    async function loadDriverVerification() {
      try {
        const { data } = await api.getVerificationStatus();
        if (data) setVerification(data as DriverVerification);
      } catch {}
    }
    loadDriverVerification();
  }, []);

  // Driver vehicle capabilities from verified RC documents
  const primaryType = verification?.vehicle_type;
  const secondaryType = verification?.secondary_vehicle_type;
  const hasPrimary = Boolean(verification?.rc_status === 'verified' || verification?.rc_number);
  const hasSecondary = Boolean(verification?.secondary_rc_status === 'verified' || verification?.secondary_rc_number);

  const hasBike = (hasPrimary && primaryType === 'bike') || (hasSecondary && secondaryType === 'bike');
  const hasCar = (hasPrimary && primaryType === 'car') || (hasSecondary && secondaryType === 'car');

  // Fetch real database rides & passenger requests on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchFeedData();
    }, [user?.city, hasBike, hasCar])
  );

  async function fetchFeedData() {
    setRefreshing(true);
    try {
      const vehiclePref = hasBike && !hasCar ? 'bike' : hasCar && !hasBike ? 'car' : undefined;
      const [ridesRes, postsRes] = await Promise.all([
        api.searchRides({}),
        api.getPassengerPosts({ city: user?.city, vehicle_preference: vehiclePref }),
      ]);
      setRecentRides((ridesRes.data as Ride[]) ?? []);
      let posts = (postsRes.data as PassengerPost[]) ?? [];
      if (hasBike && !hasCar) {
        posts = posts.filter((p) => p.vehicle_preference === 'bike');
      } else if (hasCar && !hasBike) {
        posts = posts.filter((p) => p.vehicle_preference === 'car');
      }
      setPassengerPosts(posts);
    } catch (e) {
      console.log('Error fetching home feed data:', e);
    } finally {
      setRefreshing(false);
    }
  }

  // Handle polite drop request acceptance by driver
  async function handleAcceptPost(post: PassengerPost) {
    Alert.alert(
      'Offer Drop to Passenger',
      `Would you like to offer a drop to ${post.passenger?.full_name || 'the passenger'} for ₹${post.suggested_fare}?\n\nRoute: ${post.origin} ➔ ${post.destination}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Offer Drop',
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
              `You have accepted ${post.passenger?.full_name || 'the passenger'}'s drop request. A live notification has been sent to them!`,
              [{ text: 'OK', onPress: () => fetchFeedData() }]
            );
          },
        },
      ]
    );
  }

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 72;
  const firstName = user?.full_name ? user.full_name.trim().split(' ')[0] : 'Commuter';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ================================================================= */}
      {/* FIXED TOP HEADER: BRAND, LOCATION, AVATAR, GREETING & SEARCH BAR  */}
      {/* ================================================================= */}
      <View style={styles.fixedHeader}>
        {/* 1. TOP BRAND & LIVE PRESENCE BAR */}
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <AppLogo height={28} />
          </View>

          {/* Real Live GPS Location Pill with tap-to-refresh */}
          <TouchableOpacity
            style={styles.cityPill}
            onPress={() => detectLiveLocation(true)}
            activeOpacity={0.82}
          >
            {detectingLoc ? (
              <ActivityIndicator size="small" color={Colors.primary[600]} style={{ transform: [{ scale: 0.65 }] }} />
            ) : (
              <>
                <View style={styles.livePulseDot} />
                <MapPin size={13} color={Colors.primary[600]} strokeWidth={2.4} />
              </>
            )}
            <Text style={styles.cityPillText} numberOfLines={1}>
              {detectingLoc ? 'Locating...' : (liveLocationName || user?.city || 'Detect GPS')}
            </Text>
          </TouchableOpacity>

          {/* Real User Profile Avatar with Verified Badge */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.82}
            style={styles.avatarButton}
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarText}>
                  {firstName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {user?.is_verified_driver && (
              <View style={styles.verifiedDot}>
                <ShieldCheck size={9} color="#ffffff" strokeWidth={3} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 2. MODERN HERO GREETING & DESTINATION SEARCH CARD */}
        <View style={styles.heroSection}>
          <View style={styles.heroGreetingWrap}>
            <Text style={styles.greetingTitle}>
              {getGreeting()}, {firstName}
            </Text>
          </View>

          {/* Clean Modern Destination Search Input */}
          <TouchableOpacity
            style={styles.searchBar}
            onPress={() => router.push('/(tabs)/find')}
            activeOpacity={0.88}
          >
            <View style={styles.searchIconCircle}>
              <Search size={18} color={Colors.primary[600]} strokeWidth={2.4} />
            </View>
            <Text style={styles.searchPlaceholder} numberOfLines={1}>
              Search destination, tech park, metro...
            </Text>
            <View style={styles.searchArrowBtn}>
              <ArrowRight size={15} color="#ffffff" strokeWidth={2.4} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. THREE ACTION BUTTONS: FIND, PUBLISH & REQUEST (SIDE BY SIDE) */}
        <View style={styles.actionButtonsRow}>
          {/* Find a Ride Button */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnFind]}
            onPress={() => router.push('/(tabs)/find')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionBtnIconWrap, { backgroundColor: '#e0f2fe' }]}>
              <Search size={20} color={Colors.primary[600]} strokeWidth={2.4} />
            </View>
            <Text style={styles.actionBtnLabel} numberOfLines={2}>
              Find a Ride
            </Text>
          </TouchableOpacity>

          {/* Publish a Ride Button */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPublish]}
            onPress={() => router.push('/(tabs)/offer')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionBtnIconWrap, { backgroundColor: '#f0fdf4' }]}>
              <PlusCircle size={20} color="#16a34a" strokeWidth={2.4} />
            </View>
            <Text style={styles.actionBtnLabel} numberOfLines={2}>
              Publish Ride
            </Text>
          </TouchableOpacity>

          {/* Request a Ride Button */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnRequest]}
            onPress={() => router.push('/passenger-post/create')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionBtnIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Navigation size={20} color="#d97706" strokeWidth={2.4} />
            </View>
            <Text style={styles.actionBtnLabel} numberOfLines={2}>
              Request Ride
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. AVAILABLE RIDES & PASSENGER REQUESTS - POLITE SWITCHER */}
        <View style={styles.fixedFilterSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                {feedMode === 'offered' ? 'Available Rides' : 'Passenger Requests'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(feedMode === 'offered' ? '/(tabs)/find' : '/(tabs)/find?tab=requests')}
              style={styles.seeAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>
                See all ({feedMode === 'offered' ? recentRides.length : passengerPosts.length})
              </Text>
              <ChevronRight size={14} color={Colors.primary[600]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Polite Dual Switcher: Offered Rides & Passenger Requests */}
          <View style={styles.feedModeToggleWrap}>
            <TouchableOpacity
              style={[
                styles.feedModeTab,
                feedMode === 'offered' && styles.feedModeTabActive,
              ]}
              onPress={() => setFeedMode('offered')}
              activeOpacity={0.85}
            >
              <Car
                size={15}
                color={feedMode === 'offered' ? '#ffffff' : Colors.neutral[600]}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.feedModeTabText,
                  feedMode === 'offered' && styles.feedModeTabTextActive,
                ]}
              >
                Offered Rides
              </Text>
              <View
                style={[
                  styles.feedCountBadge,
                  feedMode === 'offered' && styles.feedCountBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.feedCountText,
                    feedMode === 'offered' && styles.feedCountTextActive,
                  ]}
                >
                  {recentRides.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.feedModeTab,
                feedMode === 'requested' && styles.feedModeTabActive,
              ]}
              onPress={() => setFeedMode('requested')}
              activeOpacity={0.85}
            >
              <Users
                size={15}
                color={feedMode === 'requested' ? '#ffffff' : Colors.neutral[600]}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.feedModeTabText,
                  feedMode === 'requested' && styles.feedModeTabTextActive,
                ]}
              >
                Passenger Requests
              </Text>
              <View
                style={[
                  styles.feedCountBadge,
                  feedMode === 'requested' && styles.feedCountBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.feedCountText,
                    feedMode === 'requested' && styles.feedCountTextActive,
                  ]}
                >
                  {passengerPosts.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ================================================================= */}
      {/* SCROLLABLE FEED: OFFERED RIDES OR PASSENGER REQUESTS              */}
      {/* ================================================================= */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: Spacing.sm, paddingBottom: bottomAutoPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={fetchFeedData}
            tintColor={Colors.primary[500]}
            colors={[Colors.primary[600]]}
          />
        }
      >
        <View style={styles.section}>
          {feedMode === 'offered' ? (
            /* ======================================================== */
            /* TAB 1: OFFERED RIDES (PUBLISHED BY DRIVERS)               */
            /* ======================================================== */
            recentRides.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Car size={26} color={Colors.primary[400]} strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>No offered rides right now</Text>
                <Text style={styles.emptySub}>
                  {user?.city
                    ? `No upcoming shared rides listed in ${user.city} yet.`
                    : 'Be the first commuter to offer a ride!'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/(tabs)/offer')}
                  activeOpacity={0.85}
                >
                  <PlusCircle size={15} color="#ffffff" strokeWidth={2.2} />
                  <Text style={styles.emptyBtnText}>Publish an Offered Ride</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rideList}>
                {recentRides.slice(0, 10).map((ride) => (
                  <TouchableOpacity
                    key={ride.id}
                    style={styles.rideCard}
                    onPress={() => router.push(`/ride/${ride.id}`)}
                    activeOpacity={0.85}
                  >
                    {/* Card Header: Type Pill, Time & Price */}
                    <View style={styles.rideCardHeader}>
                      <View
                        style={[
                          styles.vehicleTag,
                          ride.vehicle_type === 'bike'
                            ? styles.vehicleTagBike
                            : styles.vehicleTagCar,
                        ]}
                      >
                        {ride.vehicle_type === 'bike' ? (
                          <>
                            <Bike size={12} color="#b45309" strokeWidth={2.4} />
                            <Text style={styles.vehicleTagTextBike}>BIKE</Text>
                          </>
                        ) : (
                          <>
                            <Car size={12} color={Colors.primary[700]} strokeWidth={2.4} />
                            <Text style={styles.vehicleTagTextCar}>CAR</Text>
                          </>
                        )}
                      </View>

                      <View style={styles.timeBadge}>
                        <Clock size={11} color={Colors.neutral[500]} strokeWidth={2} />
                        <Text style={styles.timeBadgeText}>{formatDate(ride.departure_time)}</Text>
                      </View>

                      {ride.is_daily || ride.notes?.toLowerCase().includes('daily') ? (
                        <View style={styles.dailyBadge}>
                          <Text style={styles.dailyBadgeText}>
                            🔁 {ride.recurring_days ? `DAILY (${ride.recurring_days})` : 'DAILY'}
                          </Text>
                        </View>
                      ) : null}

                      <Text style={styles.priceText}>{formatPrice(ride.price_per_seat)}</Text>
                    </View>

                    {/* Route Timeline */}
                    <View style={styles.routeBox}>
                      <View style={styles.routeDotsCol}>
                        <View style={styles.originCircle} />
                        <View style={styles.routeConnectingLine} />
                        <View style={styles.destCircle} />
                      </View>
                      <View style={styles.routeLabelsCol}>
                        <Text style={styles.routePlaceName} numberOfLines={1}>
                          {ride.origin}
                        </Text>
                        <View style={{ height: 12 }} />
                        <Text style={styles.routePlaceName} numberOfLines={1}>
                          {ride.destination}
                        </Text>
                      </View>
                    </View>

                    {/* Card Footer: Driver & Seats */}
                    <View style={styles.rideFooter}>
                      <View style={styles.driverRow}>
                        {ride.driver?.avatar_url ? (
                          <Image
                            source={{ uri: ride.driver.avatar_url }}
                            style={styles.driverImg}
                          />
                        ) : (
                          <View style={styles.driverImgFallback}>
                            <Text style={styles.driverImgFallbackText}>
                              {(ride.driver?.full_name ?? 'D').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.driverFullName} numberOfLines={1}>
                          {ride.driver?.full_name ?? 'Commuter'}
                        </Text>
                        {ride.driver?.avg_rating !== undefined && ride.driver.avg_rating > 0 && (
                          <View style={styles.ratingPill}>
                            <Star size={10} color="#f59e0b" fill="#f59e0b" />
                            <Text style={styles.ratingPillText}>
                              {ride.driver.avg_rating.toFixed(1)}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.seatPill}>
                        <Users size={11} color={Colors.primary[700]} />
                        <Text style={styles.seatPillText}>
                          {ride.seats_available}{' '}
                          {ride.vehicle_type === 'bike' ? 'pillion left' : 'seats left'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : (
            /* ======================================================== */
            /* TAB 2: PASSENGER REQUESTS (REQUESTED DROPS)               */
            /* ======================================================== */
            passengerPosts.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={[styles.emptyIconCircle, { backgroundColor: '#fef3c7' }]}>
                  <Users size={26} color="#d97706" strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>No passenger requests right now</Text>
                <Text style={styles.emptySub}>
                  {user?.city
                    ? `No commuter drop requests open in ${user.city} yet.`
                    : 'Need a drop? Post your route so a passing commuter can drop you!'}
                </Text>
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: '#d97706' }]}
                  onPress={() => router.push('/passenger-post/create')}
                  activeOpacity={0.85}
                >
                  <Plus size={15} color="#ffffff" strokeWidth={2.4} />
                  <Text style={styles.emptyBtnText}>Post a Drop Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rideList}>
                {passengerPosts.slice(0, 10).map((post) => {
                  const isMyPost = post.passenger_id === user?.id;
                  const isOpen = post.status === 'open';

                  return (
                    <TouchableOpacity
                      key={post.id}
                      style={styles.rideCard}
                      onPress={() => {
                        router.push(`/passenger-post/${post.id}`);
                      }}
                      activeOpacity={0.85}
                    >
                      {/* Card Header: Type Pill, Time & Fare */}
                      <View style={styles.rideCardHeader}>
                        <View
                          style={[
                            styles.vehicleTag,
                            post.vehicle_preference === 'bike'
                              ? styles.vehicleTagBike
                              : styles.vehicleTagCar,
                          ]}
                        >
                          {post.vehicle_preference === 'bike' ? (
                            <>
                              <Bike size={12} color="#b45309" strokeWidth={2.4} />
                              <Text style={styles.vehicleTagTextBike}>BIKE</Text>
                            </>
                          ) : (
                            <>
                              <Car size={12} color={Colors.primary[700]} strokeWidth={2.4} />
                              <Text style={styles.vehicleTagTextCar}>CAR</Text>
                            </>
                          )}
                        </View>

                        <View style={styles.timeBadge}>
                          <Clock size={11} color={Colors.neutral[500]} strokeWidth={2} />
                          <Text style={styles.timeBadgeText}>{formatDate(post.departure_time)}</Text>
                        </View>

                        {post.is_daily ? (
                          <View style={styles.dailyBadge}>
                            <Text style={styles.dailyBadgeText}>
                              🔁 {post.recurring_days ? `DAILY (${post.recurring_days})` : 'DAILY'}
                            </Text>
                          </View>
                        ) : null}

                        <Text style={styles.priceText}>{formatPrice(post.suggested_fare)}</Text>
                      </View>

                      {/* Route Timeline */}
                      <View style={styles.routeBox}>
                        <View style={styles.routeDotsCol}>
                          <View style={styles.originCircle} />
                          <View style={styles.routeConnectingLine} />
                          <View style={styles.destCircle} />
                        </View>
                        <View style={styles.routeLabelsCol}>
                          <Text style={styles.routePlaceName} numberOfLines={1}>
                            {post.origin}
                          </Text>
                          <View style={{ height: 12 }} />
                          <Text style={styles.routePlaceName} numberOfLines={1}>
                            {post.destination}
                          </Text>
                        </View>
                      </View>

                      {/* Optional Note Preview */}
                      {Boolean(post.notes) && (
                        <View style={styles.postNoteWrap}>
                          <Text style={styles.postNoteText} numberOfLines={1}>
                            💬 {post.notes}
                          </Text>
                        </View>
                      )}

                      {/* Card Footer: Passenger Profile & Action */}
                      <View style={styles.rideFooter}>
                        <View style={styles.driverRow}>
                          {post.passenger?.avatar_url ? (
                            <Image
                              source={{ uri: post.passenger.avatar_url }}
                              style={styles.driverImg}
                            />
                          ) : (
                            <View style={[styles.driverImgFallback, { backgroundColor: '#fef3c7' }]}>
                              <Text style={[styles.driverImgFallbackText, { color: '#b45309' }]}>
                                {(post.passenger?.full_name ?? 'P').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.driverFullName} numberOfLines={1}>
                            {post.passenger?.full_name ?? 'Passenger'}
                            {isMyPost && ' (You)'}
                          </Text>
                          {post.passenger?.avg_rating !== undefined && post.passenger.avg_rating > 0 && (
                            <View style={styles.ratingPill}>
                              <Star size={10} color="#f59e0b" fill="#f59e0b" />
                              <Text style={styles.ratingPillText}>
                                {post.passenger.avg_rating.toFixed(1)}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Status / Action Button */}
                        {isMyPost ? (
                          <View style={styles.myPostBadge}>
                            <Text style={styles.myPostBadgeText}>Your Request</Text>
                          </View>
                        ) : isOpen ? (
                          <TouchableOpacity
                            style={styles.offerDropBtn}
                            onPress={() => handleAcceptPost(post)}
                            activeOpacity={0.8}
                            disabled={acceptingPostId === post.id}
                          >
                            {acceptingPostId === post.id ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <>
                                <Text style={styles.offerDropBtnText}>Offer Drop</Text>
                                <ArrowRight size={11} color="#ffffff" strokeWidth={2.4} />
                              </>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.acceptedBadge}>
                            <Text style={styles.acceptedBadgeText}>Accepted</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}
        </View>

        {/* ================================================================= */}
        {/* 7. MINIMALIST PAYMENT & SAFETY FOOTER                             */}
        {/* ================================================================= */}
        <View style={styles.trustBanner}>
          <View style={styles.trustBannerIcon}>
            <Zap size={18} color={Colors.primary[600]} strokeWidth={2.4} />
          </View>
          <View style={styles.trustBannerTextWrap}>
            <Text style={styles.trustBannerTitle}>
              Direct UPI / Cash payment to driver on drop-off • Zero commission
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // Modern soft slate canvas
  },
  scrollView: {
    flex: 1,
  },

  // Fixed Top Header
  fixedHeader: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    zIndex: 20,
    ...Shadow.sm,
  },

  // Modern Clean Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
  },
  logoWrap: {
    alignItems: 'flex-start',
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#bae6fd',
    maxWidth: 200,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e', // live pulse dot
  },
  cityPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.primary[700],
  },
  avatarButton: {
    position: 'relative',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f9ff',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: Colors.primary[700],
  },
  verifiedDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: Colors.primary[600],
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },

  // Hero Section
  heroSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.md,
    paddingTop: 2,
    paddingBottom: 8,
  },
  heroGreetingWrap: {
    marginBottom: 6,
  },
  greetingTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.neutral[900],
    letterSpacing: -0.3,
  },
  greetingSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.neutral[500],
    marginTop: 2,
  },

  // Clean Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  searchIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.sm,
    color: Colors.neutral[400],
  },
  searchArrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Driver Verification Banners
  driverVerifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  driverVerifiedText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.primary[700],
  },
  driverPromptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  driverPromptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  driverPromptText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[700],
  },

  // Three Action Buttons Side-by-Side Row
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  actionBtnFind: {
    backgroundColor: '#f8fafc',
    borderColor: '#bae6fd',
  },
  actionBtnPublish: {
    backgroundColor: '#f8fafc',
    borderColor: '#bbf7d0',
  },
  actionBtnRequest: {
    backgroundColor: '#f8fafc',
    borderColor: '#fde68a',
  },
  actionBtnIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionBtnLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: Colors.neutral[800],
    textAlign: 'center',
    lineHeight: 14,
  },

  // Fixed Filter Section (Available Rides Header + All, Cars, Bikes chips)
  fixedFilterSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
  },

  // Available Rides Section in ScrollView
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.neutral[900],
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    marginTop: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  seeAllText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: Colors.primary[600],
  },

  // Polite Switcher Tabs (Offered Rides & Passenger Requests)
  feedModeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  feedModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  feedModeTabActive: {
    backgroundColor: Colors.primary[600],
    ...Shadow.sm,
  },
  feedModeTabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[600],
  },
  feedModeTabTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  feedCountBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  feedCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  feedCountText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.neutral[600],
  },
  feedCountTextActive: {
    color: '#ffffff',
  },

  // Note preview & Action buttons for passenger requests
  postNoteWrap: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  postNoteText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[600],
    fontStyle: 'italic',
  },
  offerDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  offerDropBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#ffffff',
  },
  myPostBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  myPostBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: '#b45309',
  },
  acceptedBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  acceptedBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: Colors.primary[700],
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[800],
  },
  emptySub: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginTop: 4,
    maxWidth: '90%',
    lineHeight: 18,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary[600],
    paddingHorizontal: Spacing.lg,
    paddingVertical: 9,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  emptyBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.xs,
    color: '#ffffff',
  },

  // Modern Ride Cards
  rideList: {
    gap: Spacing.sm,
  },
  rideCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  rideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  vehicleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  vehicleTagCar: {
    backgroundColor: '#e0f2fe',
  },
  vehicleTagBike: {
    backgroundColor: '#fef3c7',
  },
  vehicleTagTextCar: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    color: Colors.primary[700],
    letterSpacing: 0.3,
  },
  vehicleTagTextBike: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    color: '#92400e',
    letterSpacing: 0.3,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginLeft: 8,
  },
  timeBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  dailyBadge: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 6,
  },
  dailyBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    color: Colors.primary[700],
  },
  priceText: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: Colors.primary[700],
  },

  // Route Box
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  routeDotsCol: {
    width: 16,
    alignItems: 'center',
  },
  originCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary[600],
  },
  routeConnectingLine: {
    width: 1.5,
    height: 16,
    backgroundColor: '#cbd5e1',
    marginVertical: 2,
  },
  destCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  routeLabelsCol: {
    flex: 1,
    paddingLeft: 8,
  },
  routePlaceName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[900],
  },

  // Ride Footer
  rideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  driverImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  driverImgFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverImgFallbackText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.primary[700],
  },
  driverFullName: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: Colors.neutral[800],
    maxWidth: 120,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ratingPillText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: '#b45309',
  },
  seatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: Radius.full,
  },
  seatPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: Colors.primary[700],
  },

  // Trust Banner
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  trustBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustBannerTextWrap: {
    flex: 1,
  },
  trustBannerTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[600],
    lineHeight: 16,
  },
});
