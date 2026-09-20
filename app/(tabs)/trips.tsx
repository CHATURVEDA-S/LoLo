import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  Car,
  Bike,
  Clock,
  Users,
  ArrowRight,
  PlusCircle,
  Check,
  Navigation,
  CheckCircle2,
  XCircle,
  Phone,
  Sparkles,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Trip, PassengerPost } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'rides' | 'drops'>('rides');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [passengerPosts, setPassengerPosts] = useState<PassengerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tripsRes, postsRes] = await Promise.all([
        api.getMyTrips(),
        api.getMyPassengerPosts(),
      ]);

      if (tripsRes.data && Array.isArray(tripsRes.data)) {
        setTrips(tripsRes.data as Trip[]);
      }
      if (postsRes.data && Array.isArray(postsRes.data)) {
        setPassengerPosts(postsRes.data);
      }
    } catch (e) {
      console.log('Error fetching trips and posts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  async function handleQuickCancelRide(rideId: string) {
    Alert.alert(
      'Cancel Ride?',
      'If you do not need to drive today or your plans changed, you can cancel. Passengers will be notified immediately.',
      [
        { text: 'Keep Ride', style: 'cancel' },
        {
          text: 'Yes, Cancel Ride',
          style: 'destructive',
          onPress: async () => {
            const { error } = await api.updateRideStatus(rideId, 'cancelled');
            if (error) {
              Alert.alert('Error', error);
            } else {
              Alert.alert('Ride Cancelled', 'Your ride has been cancelled and passengers have been notified.');
              fetchData();
            }
          },
        },
      ]
    );
  }

  async function handleCompleteDrop(postId: string) {
    Alert.alert(
      'Complete Drop?',
      'Confirm that you have safely dropped off the passenger at their destination.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Drop Completed',
          style: 'default',
          onPress: async () => {
            setActionLoadingId(postId);
            const { error } = await api.completePassengerPost(postId);
            setActionLoadingId(null);
            if (error) {
              Alert.alert('Error', error);
            } else {
              Alert.alert('Drop Completed! 🎉', 'Trip marked as completed. Thank you for carpooling!');
              fetchData();
            }
          },
        },
      ]
    );
  }

  async function handleWithdrawDropOffer(postId: string) {
    Alert.alert(
      'Withdraw Drop Offer?',
      'Are you sure you want to withdraw your offer? The passenger will be notified and their request will be reopened for other commuters.',
      [
        { text: 'Keep Offer', style: 'cancel' },
        {
          text: 'Yes, Withdraw',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(postId);
            const { error } = await api.cancelPassengerPost(postId);
            setActionLoadingId(null);
            if (error) {
              Alert.alert('Error', error);
            } else {
              Alert.alert('Offer Withdrawn', 'Your drop offer has been withdrawn.');
              fetchData();
            }
          },
        },
      ]
    );
  }

  async function handleCancelPassengerPost(postId: string) {
    Alert.alert(
      'Cancel Drop Request?',
      'Are you sure you want to cancel your drop request?',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(postId);
            const { error } = await api.cancelPassengerPost(postId);
            setActionLoadingId(null);
            if (error) {
              Alert.alert('Error', error);
            } else {
              Alert.alert('Request Cancelled', 'Your drop request has been cancelled.');
              fetchData();
            }
          },
        },
      ]
    );
  }

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isTomorrow = d.toDateString() === tomorrow.toDateString();
      const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      if (isToday) return `Today, ${time}`;
      if (isTomorrow) return `Tomorrow, ${time}`;
      return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${time}`;
    } catch {
      return iso;
    }
  }

  function formatPrice(price: number) {
    return `₹${Math.round(price)}`;
  }

  const statusColors: Record<string, string> = {
    open: Colors.primary[600],
    confirmed: Colors.accent[600],
    in_progress: Colors.warning[600],
    completed: Colors.success[600],
    cancelled: Colors.error[600],
    accepted: '#059669',
  };

  const statusLabels: Record<string, string> = {
    open: 'Open',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
  };

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 80;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/offer')} activeOpacity={0.8}>
          <PlusCircle size={22} color={Colors.primary[600]} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Switcher: Carpool Rides vs Drop Offers */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'rides' && styles.tabButtonActive]}
          onPress={() => setActiveTab('rides')}
          activeOpacity={0.8}
        >
          <Car size={15} color={activeTab === 'rides' ? Colors.primary[600] : Colors.neutral[500]} strokeWidth={2.2} />
          <Text style={[styles.tabButtonText, activeTab === 'rides' && styles.tabButtonTextActive]}>
            Pool Rides ({trips.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'drops' && styles.tabButtonActive]}
          onPress={() => setActiveTab('drops')}
          activeOpacity={0.8}
        >
          <Navigation size={15} color={activeTab === 'drops' ? '#059669' : Colors.neutral[500]} strokeWidth={2.2} />
          <Text style={[styles.tabButtonText, activeTab === 'drops' && styles.tabButtonTextActive]}>
            Drop Offers & Requests ({passengerPosts.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomAutoPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary[500]} />
          </View>
        ) : activeTab === 'rides' ? (
          /* ========================================================= */
          /* TAB 1: CARPOOL RIDES                                      */
          /* ========================================================= */
          trips.length === 0 ? (
            <View style={styles.centerState}>
              <Car size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No carpool rides yet</Text>
              <Text style={styles.emptyDesc}>Find a car or bike ride or publish one to get started!</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/(tabs)/find')}>
                  <Text style={styles.emptyButtonText}>Find a Ride</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyButton, { backgroundColor: Colors.primary[600] }]}
                  onPress={() => router.push('/(tabs)/offer')}
                >
                  <Text style={styles.emptyButtonText}>Publish a Ride</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tripList}>
              {trips.map((trip, idx) => {
                const ride = trip.ride;
                const status = trip.role === 'passenger' ? (trip.request_status ?? 'pending') : ride.status;
                const statusColor = statusColors[status] ?? Colors.neutral[500];
                const isBike = ride.vehicle_type === 'bike';

                return (
                  <TouchableOpacity
                    key={`${ride.id}-${trip.role}-${idx}`}
                    style={styles.tripCard}
                    onPress={() => router.push(`/ride/${ride.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.tripCardHeader}>
                      <View style={styles.badgeGroup}>
                        <View style={[styles.roleBadge, trip.role === 'driver' ? styles.driverBadge : styles.passengerBadge]}>
                          <Text style={styles.roleBadgeText}>{trip.role === 'driver' ? 'Driver' : 'Passenger'}</Text>
                        </View>
                        <View style={[styles.vehicleBadge, isBike ? styles.vehicleBadgeBike : styles.vehicleBadgeCar]}>
                          {isBike ? (
                            <>
                              <Bike size={11} color="#92400E" strokeWidth={2.2} />
                              <Text style={styles.vehicleBadgeTextBike}>BIKE</Text>
                            </>
                          ) : (
                            <>
                              <Car size={11} color={Colors.primary[700]} strokeWidth={2.2} />
                              <Text style={styles.vehicleBadgeTextCar}>CAR</Text>
                            </>
                          )}
                        </View>
                        {ride.is_daily || ride.notes?.toLowerCase().includes('daily') ? (
                          <View style={styles.dailyBadge}>
                            <Text style={styles.dailyBadgeText}>
                              🔁 {ride.recurring_days ? `Daily (${ride.recurring_days})` : 'Daily'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.onceBadge}>
                            <Text style={styles.onceBadgeText}>Once</Text>
                          </View>
                        )}
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {statusLabels[status] ?? status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tripRoute}>
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: Colors.primary[500] }]} />
                        <Text style={styles.routeText} numberOfLines={1}>{ride.origin}</Text>
                      </View>
                      <View style={styles.routeLine} />
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: '#f59e0b' }]} />
                        <Text style={styles.routeText} numberOfLines={1}>{ride.destination}</Text>
                      </View>
                    </View>

                    <View style={styles.tripFooter}>
                      <View style={styles.tripMeta}>
                        <View style={styles.metaItem}>
                          <Clock size={13} color={Colors.neutral[500]} strokeWidth={2} />
                          <Text style={styles.metaText}>{formatDate(ride.departure_time)}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Users size={13} color={Colors.neutral[500]} strokeWidth={2} />
                          <Text style={styles.metaText}>
                            {ride.seats_available}/{ride.seats_total} {isBike ? 'pillion' : 'seats'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tripFooterRight}>
                        <Text style={styles.tripPrice}>{formatPrice(ride.price_per_seat)}</Text>
                        {ride.status === 'completed' && (
                          <View style={styles.completedBadge}>
                            <Check size={12} color={Colors.success[600]} strokeWidth={2} />
                          </View>
                        )}
                        <ArrowRight size={16} color={Colors.neutral[400]} strokeWidth={2} />
                      </View>
                    </View>

                    {/* Driver Instant Cancel Option */}
                    {trip.role === 'driver' && (ride.status === 'open' || ride.status === 'confirmed') && (
                      <View style={styles.driverQuickActionRow}>
                        <TouchableOpacity
                          style={styles.quickCancelBtn}
                          onPress={(e) => {
                            // @ts-ignore
                            e.stopPropagation?.();
                            handleQuickCancelRide(ride.id);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.quickCancelBtnText}>Cancel Ride</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : (
          /* ========================================================= */
          /* TAB 2: DROP OFFERS & REQUESTS                             */
          /* ========================================================= */
          passengerPosts.length === 0 ? (
            <View style={styles.centerState}>
              <Navigation size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No drop requests or offers</Text>
              <Text style={styles.emptyDesc}>
                When you offer a drop to a commuter or request a drop, it will appear here.
              </Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={[styles.emptyButton, { backgroundColor: '#059669' }]}
                  onPress={() => router.push('/(tabs)/home')}
                >
                  <Text style={styles.emptyButtonText}>Explore Drop Requests</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tripList}>
              {passengerPosts.map((post) => {
                const isAcceptedByMe = post.accepted_driver_id === user?.id;
                const isMyRequest = post.passenger_id === user?.id;
                const isCompleted = post.status === 'completed';
                const isAccepted = post.status === 'accepted';
                const isBike = post.vehicle_preference === 'bike';

                return (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.dropCard}
                    onPress={() => router.push(`/passenger-post/${post.id}`)}
                    activeOpacity={0.88}
                  >
                    {/* Header: Role & Status */}
                    <View style={styles.dropCardHeader}>
                      <View style={styles.badgeGroup}>
                        {isAcceptedByMe ? (
                          <View style={styles.driverOfferBadge}>
                            <CheckCircle2 size={12} color="#059669" strokeWidth={2.4} />
                            <Text style={styles.driverOfferBadgeText}>Drop Offered by You</Text>
                          </View>
                        ) : (
                          <View style={styles.passengerRequestBadge}>
                            <Navigation size={12} color={Colors.primary[700]} strokeWidth={2.4} />
                            <Text style={styles.passengerRequestBadgeText}>Your Drop Request</Text>
                          </View>
                        )}

                        <View style={[styles.vehicleBadge, isBike ? styles.vehicleBadgeBike : styles.vehicleBadgeCar]}>
                          <Text style={isBike ? styles.vehicleBadgeTextBike : styles.vehicleBadgeTextCar}>
                            {isBike ? 'BIKE' : 'CAR'}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          isCompleted
                            ? styles.badgeCompleted
                            : isAccepted
                              ? styles.badgeAccepted
                              : styles.badgeOpen,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isCompleted
                              ? styles.badgeCompletedText
                              : isAccepted
                                ? styles.badgeAcceptedText
                                : styles.badgeOpenText,
                          ]}
                        >
                          {isCompleted
                            ? 'Completed'
                            : isAccepted
                              ? isAcceptedByMe
                                ? 'Accepted / Live'
                                : 'Driver Found'
                              : 'Open'}
                        </Text>
                      </View>
                    </View>

                    {/* Participant Details */}
                    <View style={styles.participantRow}>
                      <View style={styles.participantLeft}>
                        {isAcceptedByMe ? (
                          <>
                            <View style={styles.participantAvatarFallback}>
                              <Text style={styles.participantAvatarText}>
                                {(post.passenger?.full_name || 'P').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View>
                              <Text style={styles.participantName}>
                                Passenger: {post.passenger?.full_name || 'Passenger'}
                              </Text>
                              <Text style={styles.participantSub}>
                                {post.passenger?.city || 'Hyderabad'}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={[styles.participantAvatarFallback, { backgroundColor: '#ecfdf5' }]}>
                              <Text style={[styles.participantAvatarText, { color: '#059669' }]}>
                                {(post.accepted_driver?.full_name || 'D').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View>
                              <Text style={styles.participantName}>
                                {post.accepted_driver
                                  ? `Driver: ${post.accepted_driver.full_name}`
                                  : 'Awaiting Commuter Driver...'}
                              </Text>
                              <Text style={styles.participantSub}>
                                {post.accepted_driver?.city || 'Hyderabad'}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>

                      <Text style={styles.dropFareText}>₹{Math.round(post.suggested_fare)}</Text>
                    </View>

                    {/* Route Timeline */}
                    <View style={styles.tripRoute}>
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: '#10b981' }]} />
                        <Text style={styles.routeText} numberOfLines={1}>
                          {post.origin}
                        </Text>
                      </View>
                      <View style={styles.routeLine} />
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: '#ef4444' }]} />
                        <Text style={styles.routeText} numberOfLines={1}>
                          {post.destination}
                        </Text>
                      </View>
                    </View>

                    {/* Schedule & Notes */}
                    <View style={styles.dropMetaRow}>
                      <View style={styles.metaItem}>
                        <Clock size={12} color={Colors.neutral[500]} />
                        <Text style={styles.metaText}>{formatDate(post.departure_time)}</Text>
                      </View>
                      {post.distance_km ? (
                        <View style={styles.metaItem}>
                          <Text style={styles.metaText}>{post.distance_km} km</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* View Live Map, Route & Details Button */}
                    <TouchableOpacity
                      style={styles.viewDropDetailsBtn}
                      onPress={() => router.push(`/passenger-post/${post.id}`)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Navigation size={13} color={Colors.primary[700]} strokeWidth={2.4} />
                        <Text style={styles.viewDropDetailsBtnText}>
                          View Live Map, Chat, Call & Route
                        </Text>
                      </View>
                      <ArrowRight size={13} color={Colors.primary[700]} strokeWidth={2.4} />
                    </TouchableOpacity>

                    {/* Driver or Passenger Actions */}
                    {isAcceptedByMe && isAccepted && (
                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.completeDropBtn}
                          onPress={() => handleCompleteDrop(post.id)}
                          disabled={actionLoadingId === post.id}
                          activeOpacity={0.8}
                        >
                          {actionLoadingId === post.id ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Check size={14} color="#ffffff" strokeWidth={2.5} />
                              <Text style={styles.completeDropBtnText}>Mark Drop Finished</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.withdrawBtn}
                          onPress={() => handleWithdrawDropOffer(post.id)}
                          disabled={actionLoadingId === post.id}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.withdrawBtnText}>Withdraw Offer</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isMyRequest && (post.status === 'open' || post.status === 'accepted') && (
                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.cancelRequestBtn}
                          onPress={() => handleCancelPassengerPost(post.id)}
                          disabled={actionLoadingId === post.id}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.cancelRequestBtnText}>Cancel Drop Request</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.neutral[900],
    letterSpacing: -0.3,
  },
  addButton: { padding: Spacing.xs },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: '#EFF6FF',
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
  },
  tabButtonTextActive: {
    color: Colors.primary[700],
    fontWeight: '700',
  },

  scrollView: { flex: 1 },
  centerState: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl * 2,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.neutral[800],
    marginTop: Spacing.md,
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    justifyContent: 'center',
  },
  emptyButton: {
    backgroundColor: Colors.primary[600],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },

  tripList: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  // Trip Card
  tripCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadow.sm,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  driverBadge: { backgroundColor: '#EFF6FF' },
  passengerBadge: { backgroundColor: '#FDF2F8' },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary[700],
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  vehicleBadgeBike: { backgroundColor: '#FEF3C7' },
  vehicleBadgeCar: { backgroundColor: '#EFF6FF' },
  vehicleBadgeTextBike: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  vehicleBadgeTextCar: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary[700],
  },
  dailyBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  dailyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary[700],
  },
  onceBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  onceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.neutral[600],
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  tripRoute: {
    marginVertical: Spacing.sm,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeLine: {
    width: 2,
    height: 14,
    backgroundColor: '#CBD5E1',
    marginLeft: 3,
    marginVertical: 2,
  },
  routeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[800],
    flex: 1,
  },

  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  tripMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontWeight: '500',
  },
  tripFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.neutral[900],
  },
  completedBadge: {
    backgroundColor: '#ecfdf5',
    padding: 3,
    borderRadius: Radius.full,
  },

  driverQuickActionRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },
  quickCancelBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  quickCancelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Drop Card
  dropCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.sm,
  },
  dropCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  driverOfferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  driverOfferBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  passengerRequestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  passengerRequestBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary[700],
  },

  badgeCompleted: { backgroundColor: '#ECFDF5' },
  badgeCompletedText: { color: '#059669' },
  badgeAccepted: { backgroundColor: '#EFF6FF' },
  badgeAcceptedText: { color: Colors.primary[700] },
  badgeOpen: { backgroundColor: '#FEF3C7' },
  badgeOpenText: { color: '#B45309' },

  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  participantAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary[700],
  },
  participantName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  participantSub: {
    fontSize: 10,
    color: Colors.neutral[500],
  },
  dropFareText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },

  dropMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },

  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  completeDropBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  completeDropBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  withdrawBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
  },
  withdrawBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelRequestBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
  },
  cancelRequestBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  viewDropDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  viewDropDetailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary[700],
  },
});
