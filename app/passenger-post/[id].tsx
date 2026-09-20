import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Car,
  Bike,
  Star,
  Check,
  X,
  Navigation,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Share2,
  Calendar,
  Sparkles,
  CheckCircle2,
} from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { PassengerPost, VehicleType } from '@/lib/types';
import LiveRideMap from '@/components/LiveRideMap';
import RideChatModal from '@/components/RideChatModal';
import InAppCallModal from '@/components/InAppCallModal';

export default function PassengerPostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const [post, setPost] = useState<PassengerPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Chat and In-App Calling Modals
  const [showChatModal, setShowChatModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);

  const fetchPost = useCallback(async () => {
    if (!postId) return;
    try {
      const res = await api.getPassengerPost(postId);
      if (res.data) {
        setPost(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch drop request:', err);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      fetchPost();
    }, [fetchPost])
  );

  // Auto-polling when active/accepted for live coordination
  useEffect(() => {
    if (!post || post.status === 'completed' || post.status === 'cancelled') return;
    const interval = setInterval(() => {
      fetchPost();
    }, 10000);
    return () => clearInterval(interval);
  }, [post?.status, fetchPost]);

  const isMyPost = post?.passenger_id === user?.id;
  const isAcceptedDriver = Boolean(post?.accepted_driver_id && post?.accepted_driver_id === user?.id);
  const isBike = post?.vehicle_preference === 'bike';

  const otherParty = isAcceptedDriver ? post?.passenger : post?.accepted_driver;
  const otherPartyName = isAcceptedDriver
    ? post?.passenger?.full_name || 'Passenger'
    : post?.accepted_driver?.full_name || 'Commuter Driver';
  const otherPartyRole = isAcceptedDriver ? 'Passenger' : 'Driver';
  const targetReceiverId = isAcceptedDriver ? post?.passenger_id : post?.accepted_driver_id;

  // Formatting helpers
  function formatDate(iso?: string) {
    if (!iso) return '';
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

  // Turn-by-Turn Navigation directly into Google Maps / Apple Maps
  async function handleOpenNavigation() {
    if (!post) return;
    const destLat = post.dest_lat;
    const destLng = post.dest_lng;
    const mode = isBike ? 'two-wheeler' : 'driving';

    let url = '';
    if (destLat && destLng) {
      if (Platform.OS === 'ios') {
        url = `maps://app?daddr=${destLat},${destLng}&dirflg=${isBike ? 'd' : 'd'}`;
      } else {
        url = `google.navigation:q=${destLat},${destLng}&mode=${mode === 'two-wheeler' ? 'l' : 'd'}`;
      }
    } else {
      const encodedDest = encodeURIComponent(post.destination);
      url = Platform.OS === 'ios'
        ? `maps://app?daddr=${encodedDest}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}`;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        const webUrl = destLat && destLng
          ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(post.destination)}`;
        await Linking.openURL(webUrl);
      }
    } catch (e) {
      Alert.alert('Navigation Error', 'Could not launch maps app.');
    }
  }

  // Driver accepts an open drop request
  async function handleAcceptDrop() {
    if (!post) return;
    Alert.alert(
      'Offer Drop',
      `Confirm offering a drop for ${post.passenger?.full_name || 'Passenger'} from ${post.origin} to ${post.destination} for ₹${Math.round(post.suggested_fare)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Offer',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await api.acceptPassengerPost(post.id);
              if (res.error) {
                Alert.alert('Error', res.error);
              } else {
                Alert.alert(
                  'Drop Accepted! 🎉',
                  'You have accepted this drop request. You can now chat, call, and view turn-by-turn navigation.'
                );
                fetchPost();
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to accept drop');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  // Driver or Passenger completes the drop
  async function handleCompleteDrop() {
    if (!post) return;
    Alert.alert(
      'Complete Drop',
      'Has the commuter been dropped off at the destination safely?',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, Complete',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await api.completePassengerPost(post.id);
              if (res.error) {
                Alert.alert('Error', res.error);
              } else {
                Alert.alert('Drop Completed! 🌟', 'Trip marked completed successfully.');
                fetchPost();
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to complete drop');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  // Driver withdraws offer or Passenger cancels post
  async function handleCancelOrWithdraw() {
    if (!post) return;
    const isDriverWithdrawing = isAcceptedDriver && post.status === 'accepted';
    const alertTitle = isDriverWithdrawing ? 'Withdraw Drop Offer?' : 'Cancel Drop Request?';
    const alertDesc = isDriverWithdrawing
      ? 'This will withdraw your drop offer and re-open the request so another commuter can help the passenger.'
      : 'Are you sure you want to cancel your drop request?';

    Alert.alert(alertTitle, alertDesc, [
      { text: 'Keep', style: 'cancel' },
      {
        text: isDriverWithdrawing ? 'Withdraw Offer' : 'Cancel Request',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            const res = await api.cancelPassengerPost(post.id);
            if (res.error) {
              Alert.alert('Error', res.error);
            } else {
              Alert.alert(
                isDriverWithdrawing ? 'Offer Withdrawn' : 'Request Cancelled',
                isDriverWithdrawing
                  ? 'Your offer was withdrawn. The drop request has been re-opened.'
                  : 'Your drop request has been cancelled.'
              );
              fetchPost();
            }
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Action failed');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  function handleStartCall() {
    if (!post) return;
    if (post.status === 'completed' || post.status === 'cancelled') {
      Alert.alert('Drop Finished', 'In-app calling is closed after trip completion for privacy.');
      return;
    }
    if (post.status === 'open') {
      Alert.alert('Awaiting Driver', 'In-app call becomes available once a commuter accepts the drop.');
      return;
    }
    setShowCallModal(true);
  }

  function handleStartChat() {
    if (!post) return;
    if (post.status === 'completed' || post.status === 'cancelled') {
      Alert.alert('Drop Finished', 'In-app chat is closed after trip completion for privacy.');
      return;
    }
    setShowChatModal(true);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
        <Text style={styles.loadingText}>Loading drop details & route...</Text>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <AlertCircle size={48} color={Colors.error[500]} />
        <Text style={styles.notFoundTitle}>Drop Request Not Found</Text>
        <Text style={styles.notFoundSub}>This drop request may have expired or been removed.</Text>
        <TouchableOpacity style={styles.backBtnSolid} onPress={() => router.back()}>
          <Text style={styles.backBtnSolidText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isAccepted = post.status === 'accepted';
  const isCompleted = post.status === 'completed';
  const isOpen = post.status === 'open';
  const isCancelled = post.status === 'cancelled';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.neutral[800]} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitleCenter}>
          <Text style={styles.headerTitleText}>
            {isAcceptedDriver ? 'Offered Drop' : isMyPost ? 'My Drop Request' : 'Drop Request'}
          </Text>
          <Text style={styles.headerSubText}>ID: {post.id.slice(0, 8)}</Text>
        </View>

        <TouchableOpacity style={styles.headerIconBtn} onPress={fetchPost} activeOpacity={0.7}>
          <RefreshCw size={19} color={Colors.neutral[700]} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Pill & Summary Bar */}
        <View style={styles.statusBanner}>
          <View style={styles.statusBannerLeft}>
            <View
              style={[
                styles.statusDot,
                isAccepted ? styles.dotGreen : isCompleted ? styles.dotBlue : isOpen ? styles.dotAmber : styles.dotGray,
              ]}
            />
            <Text style={styles.statusBannerTitle}>
              {isAccepted
                ? isAcceptedDriver
                  ? 'Drop Accepted by You • In Progress'
                  : 'Commuter Driver Found & Connected'
                : isCompleted
                ? 'Drop Finished & Completed'
                : isOpen
                ? 'Open Request • Awaiting Commuters'
                : 'Drop Cancelled'}
            </Text>
          </View>

          <View style={[styles.vehicleTypeTag, isBike ? styles.tagBike : styles.tagCar]}>
            {isBike ? (
              <Bike size={13} color="#b45309" strokeWidth={2.4} />
            ) : (
              <Car size={13} color={Colors.primary[700]} strokeWidth={2.4} />
            )}
            <Text style={[styles.vehicleTagText, isBike ? styles.tagTextBike : styles.tagTextCar]}>
              {isBike ? 'Bike Pool' : 'Car Pool'}
            </Text>
          </View>
        </View>

        {/* 1. INTERACTIVE LIVE ROUTE MAP */}
        <View style={styles.mapCard}>
          <LiveRideMap
            rideId={post.id}
            isDriver={isAcceptedDriver}
            originName={post.origin}
            destName={post.destination}
            originLat={post.origin_lat}
            originLng={post.origin_lng}
            destLat={post.dest_lat}
            destLng={post.dest_lng}
            rideStatus={isAccepted ? 'in_progress' : isCompleted ? 'completed' : 'open'}
            vehicleType={post.vehicle_preference}
            driverName={post.accepted_driver?.full_name}
            passengerName={post.passenger?.full_name}
          />
        </View>

        {/* 2. ROUTE & COMMUTE TIMELINE CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardSectionTitle}>Route & Commute</Text>
            <View style={styles.fareBadge}>
              <Text style={styles.fareAmount}>₹{Math.round(post.suggested_fare)}</Text>
              <Text style={styles.farePer}>fare</Text>
            </View>
          </View>

          {/* Route Dots & Labels */}
          <View style={styles.routeContainer}>
            <View style={styles.routeDotsCol}>
              <View style={styles.dotOrigin} />
              <View style={styles.routeLine} />
              <View style={styles.dotDest} />
            </View>
            <View style={styles.routeLabelsCol}>
              <View style={styles.routePointBox}>
                <Text style={styles.routeLabelSmall}>PICKUP LOCATION</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {post.origin}
                </Text>
              </View>

              <View style={[styles.routePointBox, { marginTop: 14 }]}>
                <Text style={styles.routeLabelSmall}>DROP LOCATION</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {post.destination}
                </Text>
              </View>
            </View>
          </View>

          {/* Meta Grid: Time, Distance, Preference, Seats */}
          <View style={styles.metaGrid}>
            <View style={styles.metaCol}>
              <Clock size={15} color={Colors.neutral[500]} strokeWidth={2} />
              <View style={styles.metaTextGroup}>
                <Text style={styles.metaLabel}>DEPARTURE</Text>
                <Text style={styles.metaValue}>{formatDate(post.departure_time)}</Text>
              </View>
            </View>

            <View style={styles.metaCol}>
              <Navigation size={15} color={Colors.primary[600]} strokeWidth={2} />
              <View style={styles.metaTextGroup}>
                <Text style={styles.metaLabel}>DISTANCE</Text>
                <Text style={styles.metaValue}>
                  {post.distance_km > 0 ? `${post.distance_km} km` : 'Calculated'}
                </Text>
              </View>
            </View>
          </View>

          {/* Daily Recurrence pill */}
          {post.is_daily ? (
            <View style={styles.dailyNotice}>
              <RefreshCw size={13} color="#047857" strokeWidth={2.4} />
              <Text style={styles.dailyNoticeText}>
                Daily Commute: {post.recurring_days || 'Everyday'}
              </Text>
            </View>
          ) : null}

          {/* Notes from passenger */}
          {Boolean(post.notes) && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes from commuter:</Text>
              <Text style={styles.notesText}>"{post.notes}"</Text>
            </View>
          )}
        </View>

        {/* 3. PARTICIPANTS: PASSENGER & DRIVER PROFILES */}
        {/* Passenger Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Passenger</Text>
          <View style={styles.participantRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(post.passenger?.full_name || 'P').charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>
                {post.passenger?.full_name || 'Commuter'}
                {isMyPost ? ' (You)' : ''}
              </Text>
              <View style={styles.participantSubRow}>
                <Text style={styles.participantCity}>{post.passenger?.city || post.city || 'Hyderabad'}</Text>
                {post.passenger?.avg_rating ? (
                  <View style={styles.ratingBadge}>
                    <Star size={11} color="#f59e0b" fill="#f59e0b" />
                    <Text style={styles.ratingText}>{post.passenger.avg_rating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* If driver viewing passenger, show Call & Chat buttons */}
            {isAcceptedDriver && !isCompleted && (
              <View style={styles.quickContactRow}>
                <TouchableOpacity style={styles.callIconBtn} onPress={handleStartCall} activeOpacity={0.8}>
                  <PhoneCall size={18} color="#059669" strokeWidth={2.4} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.chatIconBtn} onPress={handleStartChat} activeOpacity={0.8}>
                  <MessageSquare size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Driver Card (if accepted) */}
        {isAccepted && post.accepted_driver && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Commuter Driver</Text>
            <View style={styles.participantRow}>
              <View style={[styles.avatarCircle, { backgroundColor: '#ecfdf5' }]}>
                <Text style={[styles.avatarText, { color: '#059669' }]}>
                  {(post.accepted_driver.full_name || 'D').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.participantInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.participantName}>
                    {post.accepted_driver.full_name}
                    {isAcceptedDriver ? ' (You)' : ''}
                  </Text>
                  {post.accepted_driver.is_verified_driver && (
                    <ShieldCheck size={15} color="#059669" strokeWidth={2.5} />
                  )}
                </View>
                <View style={styles.participantSubRow}>
                  <Text style={styles.participantCity}>
                    Verified {isBike ? 'Two-Wheeler' : 'Car'} Pooler
                  </Text>
                  {post.accepted_driver.avg_rating ? (
                    <View style={styles.ratingBadge}>
                      <Star size={11} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.ratingText}>{post.accepted_driver.avg_rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* If passenger viewing driver, show Call & Chat buttons */}
              {isMyPost && !isCompleted && (
                <View style={styles.quickContactRow}>
                  <TouchableOpacity style={styles.callIconBtn} onPress={handleStartCall} activeOpacity={0.8}>
                    <PhoneCall size={18} color="#059669" strokeWidth={2.4} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.chatIconBtn} onPress={handleStartChat} activeOpacity={0.8}>
                    <MessageSquare size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 4. TURN-BY-TURN NAVIGATION CARD */}
        {isAccepted && (
          <TouchableOpacity
            style={styles.navLaunchCard}
            onPress={handleOpenNavigation}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.navLaunchGradient}
            >
              <View style={styles.navLaunchLeft}>
                <Navigation size={22} color="#ffffff" strokeWidth={2.4} />
                <View>
                  <Text style={styles.navLaunchTitle}>Turn-by-Turn Navigation</Text>
                  <Text style={styles.navLaunchSub}>
                    Open in Google Maps / Apple Maps
                  </Text>
                </View>
              </View>
              <View style={styles.navLaunchGoBadge}>
                <Text style={styles.navLaunchGoText}>GO</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* FIXED BOTTOM ACTION BAR */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Scenario 1: Driver who offered the drop */}
        {isAcceptedDriver && !isCompleted && !isCancelled && (
          <View style={styles.bottomBarActions}>
            <TouchableOpacity
              style={styles.actionBtnChat}
              onPress={handleStartChat}
              activeOpacity={0.8}
            >
              <MessageSquare size={18} color={Colors.primary[700]} strokeWidth={2.4} />
              <Text style={styles.actionBtnChatText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnCall}
              onPress={handleStartCall}
              activeOpacity={0.8}
            >
              <PhoneCall size={18} color="#059669" strokeWidth={2.4} />
              <Text style={styles.actionBtnCallText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnFinish}
              onPress={handleCompleteDrop}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#ffffff" strokeWidth={2.4} />
                  <Text style={styles.actionBtnFinishText}>Mark Finished</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Driver Option to Withdraw */}
        {isAcceptedDriver && !isCompleted && !isCancelled && (
          <TouchableOpacity
            style={styles.withdrawBtn}
            onPress={handleCancelOrWithdraw}
            disabled={actionLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.withdrawBtnText}>Withdraw Drop Offer</Text>
          </TouchableOpacity>
        )}

        {/* Scenario 2: Passenger who posted the request and has driver */}
        {isMyPost && isAccepted && !isCompleted && !isCancelled && (
          <View style={styles.bottomBarActions}>
            <TouchableOpacity
              style={styles.actionBtnChat}
              onPress={handleStartChat}
              activeOpacity={0.8}
            >
              <MessageSquare size={18} color={Colors.primary[700]} strokeWidth={2.4} />
              <Text style={styles.actionBtnChatText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnCall}
              onPress={handleStartCall}
              activeOpacity={0.8}
            >
              <PhoneCall size={18} color="#059669" strokeWidth={2.4} />
              <Text style={styles.actionBtnCallText}>Call Driver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnFinish}
              onPress={handleCompleteDrop}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              <CheckCircle2 size={18} color="#ffffff" strokeWidth={2.4} />
              <Text style={styles.actionBtnFinishText}>Completed</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scenario 3: Passenger who posted the request and is still open */}
        {isMyPost && isOpen && (
          <View style={styles.bottomSingleRow}>
            <TouchableOpacity
              style={styles.actionBtnCancelSingle}
              onPress={handleCancelOrWithdraw}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              <X size={18} color="#dc2626" strokeWidth={2.4} />
              <Text style={styles.actionBtnCancelSingleText}>Cancel Drop Request</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scenario 4: Other commuter driver viewing an open drop request */}
        {!isMyPost && !isAcceptedDriver && isOpen && (
          <View style={styles.bottomSingleRow}>
            <TouchableOpacity
              style={styles.actionBtnOfferSingle}
              onPress={handleAcceptDrop}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Sparkles size={18} color="#ffffff" strokeWidth={2.4} />
                  <Text style={styles.actionBtnOfferSingleText}>
                    Offer Drop • ₹{Math.round(post.suggested_fare)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Scenario 5: Completed or Cancelled state */}
        {(isCompleted || isCancelled) && (
          <View style={styles.bottomSingleRow}>
            <View style={styles.bannerFinished}>
              <Check size={16} color={isCompleted ? '#059669' : '#dc2626'} strokeWidth={2.5} />
              <Text style={[styles.bannerFinishedText, { color: isCompleted ? '#059669' : '#dc2626' }]}>
                {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 5. IN-APP CALL MODAL */}
      <InAppCallModal
        visible={showCallModal}
        onClose={() => setShowCallModal(false)}
        rideId={post.id}
        rideStatus={(isAccepted ? 'active' : isCompleted ? 'completed' : 'open') as any}
        otherPartyName={otherPartyName}
        otherPartyRole={otherPartyRole}
        otherPartyAvatar={otherParty?.avatar_url}
        targetReceiverId={targetReceiverId}
        vehicleType={post.vehicle_preference}
        originName={post.origin}
        destinationName={post.destination}
      />

      {/* 6. RIDE / DROP CHAT MODAL */}
      <RideChatModal
        visible={showChatModal}
        onClose={() => setShowChatModal(false)}
        rideId={post.id}
        rideStatus={(isAccepted ? 'active' : isCompleted ? 'completed' : 'open') as any}
        otherPartyName={otherPartyName}
        isDriver={isAcceptedDriver}
        onStartCall={handleStartCall}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.neutral[600],
    fontWeight: '500',
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[900],
    marginTop: 14,
    marginBottom: 6,
  },
  notFoundSub: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginBottom: 20,
  },
  backBtnSolid: {
    backgroundColor: Colors.primary[600],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  backBtnSolidText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCenter: {
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  headerSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.neutral[400],
    marginTop: 1,
  },
  scrollView: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.sm,
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dotGreen: {
    backgroundColor: '#10b981',
  },
  dotBlue: {
    backgroundColor: '#3b82f6',
  },
  dotAmber: {
    backgroundColor: '#f59e0b',
  },
  dotGray: {
    backgroundColor: '#94a3b8',
  },
  statusBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.neutral[800],
  },
  vehicleTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  tagBike: {
    backgroundColor: '#FEF3C7',
  },
  tagCar: {
    backgroundColor: '#EFF6FF',
  },
  vehicleTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagTextBike: {
    color: '#92400E',
  },
  tagTextCar: {
    color: Colors.primary[700],
  },
  mapCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.md,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  fareBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  fareAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },
  farePer: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginLeft: 3,
  },
  routeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  routeDotsCol: {
    alignItems: 'center',
    width: 20,
    marginRight: 10,
    paddingTop: 4,
  },
  dotOrigin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 4,
  },
  dotDest: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  routeLabelsCol: {
    flex: 1,
  },
  routePointBox: {
    justifyContent: 'center',
  },
  routeLabelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.neutral[400],
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[800],
    lineHeight: 19,
  },
  metaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: 12,
    gap: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaTextGroup: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.neutral[400],
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.neutral[800],
    marginTop: 1,
  },
  dailyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  dailyNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
  notesBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: Colors.neutral[700],
    fontStyle: 'italic',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary[700],
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  participantSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  participantCity: {
    fontSize: 12,
    color: Colors.neutral[500],
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d97706',
  },
  quickContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  chatIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  navLaunchCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.md,
  },
  navLaunchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  navLaunchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navLaunchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  navLaunchSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  navLaunchGoBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  navLaunchGoText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    ...Shadow.lg,
  },
  bottomBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtnChat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    paddingVertical: 13,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  actionBtnChatText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary[700],
  },
  actionBtnCall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    paddingVertical: 13,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  actionBtnCallText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  actionBtnFinish: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  actionBtnFinishText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  withdrawBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  withdrawBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.error[600],
  },
  bottomSingleRow: {
    width: '100%',
  },
  actionBtnCancelSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionBtnCancelSingleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
  actionBtnOfferSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    ...Shadow.md,
  },
  actionBtnOfferSingleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  bannerFinished: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
  },
  bannerFinishedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
