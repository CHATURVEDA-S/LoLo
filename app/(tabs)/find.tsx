import { useState, useCallback, useEffect } from 'react';
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
  CheckCircle2,
  Navigation,
  Check,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Ride, VehicleType, PassengerPost, DriverVerification } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FindRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();

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

  // Driver vehicle capability checks from verification
  const primaryType = verification?.vehicle_type;
  const secondaryType = verification?.secondary_vehicle_type;
  const hasPrimary = Boolean(verification?.rc_status === 'verified' || verification?.rc_number);
  const hasSecondary = Boolean(verification?.secondary_rc_status === 'verified' || verification?.secondary_rc_number);

  const hasBike = (hasPrimary && primaryType === 'bike') || (hasSecondary && secondaryType === 'bike');
  const hasCar = (hasPrimary && primaryType === 'car') || (hasSecondary && secondaryType === 'car');
  const hasBothVehicles = hasCar && hasBike;
  const isDriverUser = Boolean(user?.is_driver || user?.is_verified_driver || hasCar || hasBike);

  const defaultVehicleType: VehicleType = hasBike && !hasCar ? 'bike' : 'car';

  // Common Search filters
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(defaultVehicleType);
  const [detectingGps, setDetectingGps] = useState(false);

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
            setVehicleType('bike');
          } else if (isC && !isB) {
            setVehicleType('car');
          }
        }
      } catch {}
    }
    loadDriverVerification();
  }, []);

  // Rides state
  const [results, setResults] = useState<Ride[]>([]);
  const [searched, setSearched] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  // Passenger Requests state
  const [passengerPosts, setPassengerPosts] = useState<PassengerPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [acceptingPostId, setAcceptingPostId] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  async function useCurrentLocationForOrigin() {
    setDetectingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDetectingGps(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo) {
        const parts = [geo.name, geo.street, geo.subregion || geo.district, geo.city].filter(Boolean);
        setOrigin(parts.length > 0 ? parts.join(', ') : `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      }
    } catch {}
    setDetectingGps(false);
  }

  async function searchRides(overrideType?: VehicleType) {
    setLoadingRides(true);
    setSearched(true);

    const typeToUse = overrideType !== undefined ? overrideType : vehicleType;

    const { data } = await api.searchRides({
      city: user?.city,
      origin: origin.trim(),
      destination: destination.trim(),
      vehicle_type: typeToUse,
    });

    setResults((data as Ride[]) ?? []);
    setLoadingRides(false);
  }

  async function loadPassengerPosts(overrideType?: VehicleType) {
    setLoadingPosts(true);
    const typeToUse = (hasBike && !hasCar) ? 'bike' : (hasCar && !hasBike) ? 'car' : (overrideType !== undefined ? overrideType : vehicleType);

    const { data } = await api.getPassengerPosts({
      city: user?.city,
      origin: origin.trim() || undefined,
      destination: destination.trim() || undefined,
      vehicle_preference: typeToUse,
    });

    // Strictly show only vehicle-matched drop requests
    const filtered = (data || []).filter((p) => p.vehicle_preference === typeToUse);
    setPassengerPosts(filtered);
    setLoadingPosts(false);
  }

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'rides') {
        if (searched) searchRides();
      } else {
        loadPassengerPosts();
      }
    }, [activeTab, vehicleType])
  );

  function handleFilterChange(newType: VehicleType) {
    setVehicleType(newType);
    if (activeTab === 'rides') {
      searchRides(newType);
    } else {
      loadPassengerPosts(newType);
    }
  }

  function clearSearch() {
    setOrigin('');
    setDestination('');
    setVehicleType(defaultVehicleType);
    setSearched(false);
    setResults([]);
    if (activeTab === 'requests') {
      loadPassengerPosts(defaultVehicleType);
    }
  }

  async function handleAcceptPost(post: PassengerPost) {
    Alert.alert(
      'Accept Drop Request',
      `Would you like to drop ${post.passenger?.full_name || 'the passenger'} for ₹${post.suggested_fare}?\n\nRoute: ${post.origin} ➔ ${post.destination}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Drop',
          style: 'default',
          onPress: async () => {
            setAcceptingPostId(post.id);
            const { data, error } = await api.acceptPassengerPost(post.id);
            setAcceptingPostId(null);
            if (error) {
              Alert.alert('Unable to Accept', error);
              return;
            }
            Alert.alert(
              'Drop Accepted! 🎉',
              `You have accepted ${post.passenger?.full_name || 'the passenger'}'s drop request. A live push notification has been sent to them!`,
              [{ text: 'OK', onPress: () => loadPassengerPosts() }]
            );
          },
        },
      ]
    );
  }

  async function handleCancelPost(postId: string) {
    Alert.alert(
      'Cancel Drop Request?',
      'If you do not need a drop today, you can cancel it. Your driver will be notified immediately.',
      [
        { text: 'Keep Drop', style: 'cancel' },
        {
          text: 'Yes, Cancel Drop',
          style: 'destructive',
          onPress: async () => {
            const { error } = await api.cancelPassengerPost(postId);
            if (error) {
              Alert.alert('Could Not Cancel', error);
            } else {
              Alert.alert('Drop Cancelled', 'Your drop request has been cancelled successfully.');
            }
            loadPassengerPosts();
          },
        },
      ]
    );
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
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + `, ${time}`;
  }

  function formatPrice(price: number) {
    return `₹${price.toFixed(0)}`;
  }

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 80;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Header */}
      <View style={styles.searchBar}>
        <View style={styles.headerTopRow}>
          <Text style={styles.cityLabel}>📍 {user?.city || 'Your City'}</Text>
          <TouchableOpacity
            style={styles.postDropHeaderBtn}
            onPress={() => router.push('/passenger-post/create')}
            activeOpacity={0.8}
          >
            <Sparkles size={13} color="#ffffff" />
            <Text style={styles.postDropHeaderBtnText}>+ Need a Drop</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher: Available Rides vs Passenger Requests */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, activeTab === 'rides' && styles.modeTabActive]}
            onPress={() => setActiveTab('rides')}
            activeOpacity={0.8}
          >
            <Car size={15} color={activeTab === 'rides' ? '#ffffff' : Colors.neutral[600]} />
            <Text style={[styles.modeTabText, activeTab === 'rides' && styles.modeTabTextActive]}>
              Available Rides
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, activeTab === 'requests' && styles.modeTabActive]}
            onPress={() => {
              setActiveTab('requests');
              loadPassengerPosts();
            }}
            activeOpacity={0.8}
          >
            <Navigation size={15} color={activeTab === 'requests' ? '#ffffff' : Colors.neutral[600]} />
            <Text style={[styles.modeTabText, activeTab === 'requests' && styles.modeTabTextActive]}>
              Drop Requests
            </Text>
          </TouchableOpacity>
        </View>

        {/* Origin Input */}
        <View style={styles.searchRow}>
          <View style={styles.inputIcon}>
            <View style={styles.dotOrigin} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="From where? (or tap GPS)"
            placeholderTextColor={Colors.neutral[400]}
            value={origin}
            onChangeText={setOrigin}
          />
          <TouchableOpacity
            style={styles.gpsOriginBtn}
            onPress={useCurrentLocationForOrigin}
            disabled={detectingGps}
            activeOpacity={0.7}
          >
            {detectingGps ? (
              <ActivityIndicator size="small" color={Colors.primary[600]} />
            ) : (
              <Crosshair size={15} color={Colors.primary[600]} strokeWidth={2.4} />
            )}
            <Text style={styles.gpsOriginBtnText}>GPS</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchDivider} />

        {/* Destination Input */}
        <View style={styles.searchRow}>
          <View style={styles.inputIcon}>
            <View style={styles.dotDest} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="To where?"
            placeholderTextColor={Colors.neutral[400]}
            value={destination}
            onChangeText={setDestination}
          />
        </View>

        {/* Vehicle Filter Selector: Cars / Bikes based on verified profile */}
        <View style={styles.filterRow}>
          {hasBike && !hasCar ? (
            <View style={[styles.filterChip, styles.filterChipActiveBike, { flex: 1 }]}>
              <Bike size={14} color="#ffffff" strokeWidth={2.4} />
              <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                Bike Requests (Your Registered Vehicle)
              </Text>
            </View>
          ) : hasCar && !hasBike ? (
            <View style={[styles.filterChip, styles.filterChipActiveCar, { flex: 1 }]}>
              <Car size={14} color="#ffffff" strokeWidth={2.4} />
              <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                Car Requests (Your Registered Vehicle)
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.filterChip, vehicleType === 'car' && styles.filterChipActiveCar, { flex: 1 }]}
                onPress={() => handleFilterChange('car')}
                activeOpacity={0.8}
              >
                <Car size={14} color={vehicleType === 'car' ? Colors.neutral[0] : Colors.neutral[600]} strokeWidth={2.2} />
                <Text style={[styles.filterChipText, vehicleType === 'car' && styles.filterChipTextActive]}>
                  Cars
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, vehicleType === 'bike' && styles.filterChipActiveBike, { flex: 1 }]}
                onPress={() => handleFilterChange('bike')}
                activeOpacity={0.8}
              >
                <Bike size={14} color={vehicleType === 'bike' ? Colors.neutral[0] : Colors.neutral[600]} strokeWidth={2.2} />
                <Text style={[styles.filterChipText, vehicleType === 'bike' && styles.filterChipTextActive]}>
                  Bikes
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Action Button */}
        {activeTab === 'rides' ? (
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => searchRides()}
            disabled={loadingRides}
            activeOpacity={0.85}
          >
            {loadingRides ? (
              <ActivityIndicator color={Colors.neutral[0]} size="small" />
            ) : (
              <>
                <Search size={18} color={Colors.neutral[0]} strokeWidth={2} />
                <Text style={styles.searchButtonText}>Search Available Rides</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => loadPassengerPosts()}
            disabled={loadingPosts}
            activeOpacity={0.85}
          >
            {loadingPosts ? (
              <ActivityIndicator color={Colors.neutral[0]} size="small" />
            ) : (
              <>
                <Search size={18} color={Colors.neutral[0]} strokeWidth={2} />
                <Text style={styles.searchButtonText}>Filter Drop Requests</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {(searched || (activeTab === 'requests' && (origin || destination))) && (
          <TouchableOpacity style={styles.clearButton} onPress={clearSearch}>
            <X size={16} color={Colors.neutral[500]} strokeWidth={2} />
            <Text style={styles.clearText}>Clear search</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.results}
        contentContainerStyle={{ paddingBottom: bottomAutoPadding }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (activeTab === 'rides') {
                searchRides().finally(() => setRefreshing(false));
              } else {
                loadPassengerPosts().finally(() => setRefreshing(false));
              }
            }}
          />
        }
      >
        {/* ========================================================== */}
        {/* TAB 1: AVAILABLE RIDES */}
        {/* ========================================================== */}
        {activeTab === 'rides' && (
          <>
            {searched && !loadingRides && results.length === 0 ? (
              <View style={styles.emptyState}>
                {vehicleType === 'bike' ? (
                  <Bike size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
                ) : (
                  <Car size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
                )}
                <Text style={styles.emptyTitle}>
                  No {vehicleType === 'bike' ? 'bike' : vehicleType === 'car' ? 'car' : ''} rides found
                </Text>
                <Text style={styles.emptyDesc}>
                  No driver published this route yet. You can post a drop request instead!
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => router.push('/passenger-post/create')}
                  activeOpacity={0.85}
                >
                  <Sparkles size={16} color="#ffffff" />
                  <Text style={styles.emptyActionBtnText}>Post a Drop Request</Text>
                </TouchableOpacity>
              </View>
            ) : searched && !loadingRides ? (
              <View style={styles.resultList}>
                <Text style={styles.resultCount}>
                  {results.length} {results.length === 1 ? 'ride' : 'rides'} found
                </Text>
                {results.map((ride) => (
                  <TouchableOpacity
                    key={ride.id}
                    style={styles.rideCard}
                    onPress={() =>
                      router.push(
                        `/ride/${ride.id}${origin.trim() ? `?pickup=${encodeURIComponent(origin.trim())}` : ''}`
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.routeContainer}>
                        <View style={styles.routeTop}>
                          <View style={styles.routeDotGreen} />
                          <Text style={styles.routeText} numberOfLines={1}>
                            {ride.origin}
                          </Text>
                        </View>
                        <View style={styles.routeConnector} />
                        <View style={styles.routeTop}>
                          <View style={styles.routeDotOrange} />
                          <Text style={styles.routeText} numberOfLines={1}>
                            {ride.destination}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.priceTag}>{formatPrice(ride.price_per_seat)}</Text>
                    </View>

                    {/* Ride Type & Meta Chips */}
                    <View style={styles.cardMeta}>
                      <View
                        style={[
                          styles.vehicleBadge,
                          ride.vehicle_type === 'bike' ? styles.vehicleBadgeBike : styles.vehicleBadgeCar,
                        ]}
                      >
                        {ride.vehicle_type === 'bike' ? (
                          <>
                            <Bike size={12} color="#92400E" strokeWidth={2.2} />
                            <Text style={styles.vehicleBadgeTextBike}>BIKE</Text>
                          </>
                        ) : (
                          <>
                            <Car size={12} color={Colors.primary[700]} strokeWidth={2.2} />
                            <Text style={styles.vehicleBadgeTextCar}>CAR</Text>
                          </>
                        )}
                      </View>

                      <View style={styles.metaChip}>
                        <Clock size={13} color={Colors.neutral[500]} strokeWidth={2} />
                        <Text style={styles.metaChipText}>{formatDate(ride.departure_time)}</Text>
                      </View>

                      <View style={styles.metaChip}>
                        <Users size={13} color={Colors.neutral[500]} strokeWidth={2} />
                        <Text style={styles.metaChipText}>
                          {ride.seats_available} {ride.vehicle_type === 'bike' ? 'pillion' : 'seat'}
                          {ride.seats_available !== 1 ? 's' : ''} left
                        </Text>
                      </View>

                      {ride.is_daily || ride.notes?.toLowerCase().includes('daily') ? (
                        <View style={styles.recurrenceBadgeDaily}>
                          <RefreshCw size={11} color={Colors.primary[700]} strokeWidth={2.2} />
                          <Text style={styles.recurrenceBadgeDailyText}>
                            {ride.recurring_days ? `DAILY (${ride.recurring_days})` : 'DAILY'}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.recurrenceBadgeOnce}>
                          <Text style={styles.recurrenceBadgeOnceText}>ONCE</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={styles.driverInfo}>
                        {ride.driver?.avatar_url ? (
                          <Image source={{ uri: ride.driver.avatar_url }} style={styles.avatarImg} />
                        ) : (
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {(ride.driver?.full_name ?? 'D').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={styles.driverName}>{ride.driver?.full_name ?? 'Driver'}</Text>
                          {ride.driver && ride.driver.avg_rating > 0 && (
                            <View style={styles.ratingRow}>
                              <Star
                                size={11}
                                color={Colors.secondary[500]}
                                fill={Colors.secondary[500]}
                                strokeWidth={2}
                              />
                              <Text style={styles.ratingText}>{ride.driver.avg_rating.toFixed(1)}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.payBadge}>
                        <Text style={styles.payBadgeText}>Pay after ride</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : !searched ? (
              <View style={styles.emptyState}>
                <Search size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>Search for Car or Bike Rides</Text>
                <Text style={styles.emptyDesc}>
                  Find verified drivers commuting along your route in {user?.city || 'your city'}.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyActionBtn, { backgroundColor: '#10b981' }]}
                  onPress={() => setActiveTab('requests')}
                  activeOpacity={0.85}
                >
                  <Navigation size={16} color="#ffffff" />
                  <Text style={styles.emptyActionBtnText}>See Passenger Drop Requests</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}

        {/* ========================================================== */}
        {/* TAB 2: PASSENGER DROP REQUESTS */}
        {/* ========================================================== */}
        {activeTab === 'requests' && (
          <>
            {/* Quick banner to post a drop request */}
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
                  Heading somewhere? Post your pickup & destination so drivers can accept and drop you!
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.primary[600]} />
            </TouchableOpacity>

            {loadingPosts ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary[600]} />
                <Text style={{ fontFamily: 'Inter-Medium', color: Colors.neutral[500], marginTop: 8 }}>
                  Loading live drop requests...
                </Text>
              </View>
            ) : passengerPosts.length === 0 ? (
              <View style={styles.emptyState}>
                <Navigation size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>No Drop Requests Found</Text>
                <Text style={styles.emptyDesc}>
                  No passenger travel requests open right now in {user?.city || 'your city'}.
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => router.push('/passenger-post/create')}
                  activeOpacity={0.85}
                >
                  <Sparkles size={16} color="#ffffff" />
                  <Text style={styles.emptyActionBtnText}>Post First Drop Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.resultList}>
                <Text style={styles.resultCount}>
                  {passengerPosts.length} {passengerPosts.length === 1 ? 'request' : 'requests'} looking for drops
                </Text>

                {passengerPosts.map((post) => {
                  const isMyPost = post.passenger_id === user?.id;
                  const isAcceptedByMe = post.accepted_driver_id === user?.id;
                  const isOpen = post.status === 'open';

                  return (
                    <TouchableOpacity
                      key={post.id}
                      style={styles.postCard}
                      onPress={() => router.push(`/passenger-post/${post.id}`)}
                      activeOpacity={0.88}
                    >
                      {/* Card Header: Route & Fare */}
                      <View style={styles.cardHeader}>
                        <View style={styles.routeContainer}>
                          <View style={styles.routeTop}>
                            <View style={styles.routeDotGreen} />
                            <Text style={styles.routeText} numberOfLines={1}>
                              {post.origin}
                            </Text>
                          </View>
                          <View style={styles.routeConnector} />
                          <View style={styles.routeTop}>
                            <View style={styles.routeDotOrange} />
                            <Text style={styles.routeText} numberOfLines={1}>
                              {post.destination}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.priceTag}>₹{post.suggested_fare}</Text>
                          <Text style={styles.rateTagText}>
                            {post.distance_km > 0 ? `${post.distance_km} km` : 'Fair Fare'}
                          </Text>
                        </View>
                      </View>

                      {/* Meta Chips */}
                      <View style={styles.cardMeta}>
                        <View
                          style={[
                            styles.vehicleBadge,
                            post.vehicle_preference === 'bike'
                              ? styles.vehicleBadgeBike
                              : styles.vehicleBadgeCar,
                          ]}
                        >
                          {post.vehicle_preference === 'bike' ? (
                            <>
                              <Bike size={12} color="#92400E" strokeWidth={2.2} />
                              <Text style={styles.vehicleBadgeTextBike}>BIKE</Text>
                            </>
                          ) : (
                            <>
                              <Car size={12} color={Colors.primary[700]} strokeWidth={2.2} />
                              <Text style={styles.vehicleBadgeTextCar}>CAR</Text>
                            </>
                          )}
                        </View>

                        <View style={styles.metaChip}>
                          <Clock size={13} color={Colors.neutral[500]} strokeWidth={2} />
                          <Text style={styles.metaChipText}>{formatDate(post.departure_time)}</Text>
                        </View>

                        <View style={styles.metaChip}>
                          <Users size={13} color={Colors.neutral[500]} strokeWidth={2} />
                          <Text style={styles.metaChipText}>
                            {post.seats_needed} {post.seats_needed === 1 ? 'seat' : 'seats'}
                          </Text>
                        </View>

                        {post.is_daily ? (
                          <View style={styles.recurrenceBadgeDaily}>
                            <RefreshCw size={11} color={Colors.primary[700]} strokeWidth={2.2} />
                            <Text style={styles.recurrenceBadgeDailyText}>
                              DAILY ({post.recurring_days || 'Mon–Fri'})
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.recurrenceBadgeOnce}>
                            <Text style={styles.recurrenceBadgeOnceText}>ONCE</Text>
                          </View>
                        )}
                      </View>

                      {/* Optional Notes from Passenger */}
                      {Boolean(post.notes) && (
                        <View style={styles.postNoteBubble}>
                          <Text style={styles.postNoteText}>💬 "{post.notes}"</Text>
                        </View>
                      )}

                      {/* Footer: Passenger Profile & Action */}
                      <View style={styles.postCardFooter}>
                        <View style={styles.driverInfo}>
                          {post.passenger?.avatar_url ? (
                            <Image source={{ uri: post.passenger.avatar_url }} style={styles.avatarImg} />
                          ) : (
                            <View style={[styles.avatar, { backgroundColor: '#fef3c7' }]}>
                              <Text style={[styles.avatarText, { color: '#b45309' }]}>
                                {(post.passenger?.full_name ?? 'P').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View>
                            <Text style={styles.driverName}>
                              {post.passenger?.full_name ?? 'Passenger'}
                              {isMyPost && ' (You)'}
                            </Text>
                            {post.passenger && post.passenger.avg_rating > 0 && (
                              <View style={styles.ratingRow}>
                                <Star
                                  size={11}
                                  color={Colors.secondary[500]}
                                  fill={Colors.secondary[500]}
                                  strokeWidth={2}
                                />
                                <Text style={styles.ratingText}>{post.passenger.avg_rating.toFixed(1)}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Status & Actions */}
                        {isMyPost ? (
                          isOpen ? (
                            <TouchableOpacity
                              style={styles.cancelRequestBtn}
                              onPress={() => handleCancelPost(post.id)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.cancelRequestText}>Cancel Drop</Text>
                            </TouchableOpacity>
                          ) : post.status === 'accepted' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={styles.statusAcceptedBadge}>
                                <Check size={12} color="#15803d" strokeWidth={2.5} />
                                <Text style={styles.statusAcceptedText}>
                                  {post.accepted_driver?.full_name ? `Accepted (${post.accepted_driver.full_name})` : 'Accepted'}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.cancelRequestBtn}
                                onPress={() => handleCancelPost(post.id)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.cancelRequestText}>Cancel Drop</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={styles.statusFilledBadge}>
                              <Text style={styles.statusFilledText}>{post.status.toUpperCase()}</Text>
                            </View>
                          )
                        ) : isAcceptedByMe ? (
                          <View style={styles.statusAcceptedBadge}>
                            <CheckCircle2 size={13} color="#15803d" strokeWidth={2.5} />
                            <Text style={styles.statusAcceptedText}>You Accepted · In Progress</Text>
                          </View>
                        ) : !isOpen ? (
                          <View style={styles.statusFilledBadge}>
                            <Text style={styles.statusFilledText}>Drop Accepted</Text>
                          </View>
                        ) : isDriverUser ? (
                          <TouchableOpacity
                            style={styles.acceptDropBtn}
                            onPress={() => handleAcceptPost(post)}
                            disabled={acceptingPostId === post.id}
                            activeOpacity={0.85}
                          >
                            {acceptingPostId === post.id ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <>
                                <Check size={14} color="#ffffff" strokeWidth={2.5} />
                                <Text style={styles.acceptDropBtnText}>Accept & Drop</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.statusOpenBadge}>
                            <Text style={styles.statusOpenText}>Looking for Driver</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },
  searchBar: {
    backgroundColor: Colors.neutral[0],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cityLabel: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.sm, color: Colors.primary[700] },
  postDropHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary[600],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  postDropHeaderBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#ffffff',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[100],
    borderRadius: Radius.lg,
    padding: 3,
    marginBottom: Spacing.sm,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  modeTabActive: {
    backgroundColor: Colors.primary[600],
    ...Shadow.sm,
  },
  modeTabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[600],
  },
  modeTabTextActive: {
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  inputIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  dotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary[500] },
  dotDest: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary[500] },
  searchInput: { flex: 1, fontFamily: 'Inter-Medium', fontSize: FontSizes.md, color: Colors.neutral[900], paddingVertical: Spacing.sm },
  gpsOriginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  gpsOriginBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.primary[700],
  },
  searchDivider: { height: 1, backgroundColor: Colors.neutral[100], marginLeft: 34, marginVertical: 2 },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutral[100],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  filterChipActive: {
    backgroundColor: Colors.neutral[900],
    borderColor: Colors.neutral[900],
  },
  filterChipActiveCar: {
    backgroundColor: Colors.primary[500],
    borderColor: Colors.primary[600],
  },
  filterChipActiveBike: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  filterChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: Colors.neutral[700],
  },
  filterChipTextActive: {
    color: Colors.neutral[0],
  },
  searchButton: {
    backgroundColor: Colors.primary[500],
    borderRadius: Radius.md,
    minHeight: 48,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    ...Shadow.sm,
  },
  searchButtonText: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.md, color: Colors.neutral[0] },
  clearButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: Spacing.sm },
  clearText: { fontFamily: 'Inter-Regular', fontSize: FontSizes.sm, color: Colors.neutral[500] },
  results: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  emptyState: { alignItems: 'center', paddingTop: Spacing.xxxl * 1.2, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.lg, color: Colors.neutral[700], marginTop: Spacing.md },
  emptyDesc: { fontFamily: 'Inter-Regular', fontSize: FontSizes.md, color: Colors.neutral[400], textAlign: 'center', marginTop: Spacing.xs },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary[600],
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    ...Shadow.sm,
  },
  emptyActionBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: '#ffffff',
  },
  postRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: '#86efac',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  postRequestIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postRequestTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: '#166534',
  },
  postRequestSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#15803d',
    marginTop: 2,
  },
  resultList: { gap: Spacing.md },
  resultCount: { fontFamily: 'Inter-Regular', fontSize: FontSizes.sm, color: Colors.neutral[500], marginBottom: Spacing.xs },
  rideCard: { backgroundColor: Colors.neutral[0], borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.sm },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  routeContainer: { flex: 1, marginRight: Spacing.md },
  routeTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary[500] },
  routeDotOrange: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary[500] },
  routeText: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.md, color: Colors.neutral[800], flex: 1 },
  routeConnector: { width: 2, height: 14, backgroundColor: Colors.neutral[300], marginLeft: 4 },
  priceTag: { fontFamily: 'Inter-Bold', fontSize: FontSizes.xl, color: Colors.primary[600] },
  rateTagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[500],
    marginTop: 2,
  },
  cardMeta: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  vehicleBadgeCar: { backgroundColor: Colors.primary[50] },
  vehicleBadgeBike: { backgroundColor: '#FEF3C7' },
  vehicleBadgeAny: { backgroundColor: '#e0e7ff' },
  vehicleBadgeTextCar: { fontFamily: 'Inter-Bold', fontSize: 10, color: Colors.primary[700] },
  vehicleBadgeTextBike: { fontFamily: 'Inter-Bold', fontSize: 10, color: '#92400E' },
  vehicleBadgeTextAny: { fontFamily: 'Inter-Bold', fontSize: 10, color: '#4338ca' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  metaChipText: { fontFamily: 'Inter-Regular', fontSize: FontSizes.xs, color: Colors.neutral[600] },
  recurrenceBadgeDaily: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  recurrenceBadgeDailyText: { fontFamily: 'Inter-Bold', fontSize: 10, color: Colors.primary[700] },
  recurrenceBadgeOnce: {
    backgroundColor: Colors.neutral[100],
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  recurrenceBadgeOnceText: { fontFamily: 'Inter-Bold', fontSize: 10, color: Colors.neutral[600] },
  postNoteBubble: {
    backgroundColor: '#f8fafc',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    marginBottom: Spacing.sm,
  },
  postNoteText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.neutral[600],
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
  },
  postCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
  },
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.md, color: Colors.primary[700] },
  driverName: { fontFamily: 'Inter-Medium', fontSize: FontSizes.sm, color: Colors.neutral[800] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  ratingText: { fontFamily: 'Inter-Regular', fontSize: FontSizes.xs, color: Colors.neutral[500] },
  payBadge: {
    backgroundColor: Colors.success[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  payBadgeText: { fontFamily: 'Inter-Medium', fontSize: FontSizes.xs, color: Colors.success[700] },
  acceptDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    ...Shadow.sm,
  },
  acceptDropBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    color: '#ffffff',
  },
  cancelRequestBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#fee2e2',
  },
  cancelRequestText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#dc2626',
  },
  statusAcceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  statusAcceptedText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#15803d',
  },
  statusFilledBadge: {
    backgroundColor: Colors.neutral[100],
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  statusFilledText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  statusOpenBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  statusOpenText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#1d4ed8',
  },
});
