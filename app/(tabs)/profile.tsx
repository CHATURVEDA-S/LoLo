import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  User as UserIcon, Phone, Star, Car, LogOut, Edit3, Check, X,
  Shield, FileCheck, MapPin, Camera, Upload, Bike, HeartHandshake,
  FileText, Sparkles, Clock, ChevronRight, ChevronDown, PlusCircle,
  ArrowUpRight, ShieldCheck, AlertCircle, Navigation, CheckCircle2,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Colors, Spacing, Radius, Shadow } from '@/lib/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { DriverVerification, VehicleType, ProfileReviewsResponse, PassengerPost } from '@/lib/types';
import { pickImageFromLibrary, takePhotoWithCamera, pickDocumentImage } from '@/lib/image-picker';

type MenuSection = 'rides' | 'docs' | 'reviews' | 'personal' | 'safety';

export default function ProfileScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  // Accordion Menu State (which button-section is open)
  // By default, open 'rides' so user immediately sees their live rides
  const [openSections, setOpenSections] = useState<Record<MenuSection, boolean>>({
    rides: true,
    docs: false,
    reviews: false,
    personal: false,
    safety: false,
  });

  const toggleSection = (section: MenuSection) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Personal Info Edit State
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [gender, setGender] = useState(user?.gender ?? '');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Safety / Emergency Contact State
  const [editingEmergency, setEditingEmergency] = useState(false);
  const [emergencyName, setEmergencyName] = useState(user?.emergency_contact_name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergency_contact_phone ?? '');
  const [savingEmergency, setSavingEmergency] = useState(false);

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Live Reviews and Stats (100% live, zero hardcoded reviews)
  const [profileStats, setProfileStats] = useState<ProfileReviewsResponse | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'passenger' | 'driver'>('all');

  // Live Rides / Trips & Passenger Drops
  const [trips, setTrips] = useState<any[]>([]);
  const [passengerPosts, setPassengerPosts] = useState<PassengerPost[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [ridesTab, setRidesTab] = useState<'active' | 'completed'>('active');

  // Verification state
  const [verification, setVerification] = useState<DriverVerification | null>(null);
  const [showDLForm, setShowDLForm] = useState(false);
  const [showRCForm, setShowRCForm] = useState(false);

  // DL Form
  const [dlNumber, setDLNumber] = useState('');
  const [dlPhoto, setDlPhoto] = useState<string | null>(null);

  // RC Form
  const [rcNumber, setRCNumber] = useState('');
  const [rcVehicleType, setRcVehicleType] = useState<VehicleType>('car');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [rcPhoto, setRcPhoto] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  async function fetchVerification() {
    try {
      const { data } = await api.getVerificationStatus();
      if (data) setVerification(data as DriverVerification);
    } catch {
      // ignore
    }
  }

  async function fetchProfileReviews() {
    setLoadingReviews(true);
    try {
      const { data } = await api.getProfileReviews();
      if (data) setProfileStats(data);
    } catch {
      // ignore
    } finally {
      setLoadingReviews(false);
    }
  }

  async function fetchTrips() {
    setLoadingTrips(true);
    try {
      const [tripsRes, postsRes] = await Promise.all([
        api.getMyTrips(),
        api.getMyPassengerPosts(),
      ]);
      if (tripsRes.data && Array.isArray(tripsRes.data)) {
        setTrips(tripsRes.data);
      }
      if (postsRes.data && Array.isArray(postsRes.data)) {
        setPassengerPosts(postsRes.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTrips(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchVerification();
      fetchProfileReviews();
      fetchTrips();
      refreshProfile();
    }, [])
  );

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setBio(user.bio || '');
      setGender(user.gender || '');
      setEmergencyName(user.emergency_contact_name || '');
      setEmergencyPhone(user.emergency_contact_phone || '');
    }
  }, [user]);

  async function handleAvatarPick() {
    Alert.alert('Update Profile Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          setUploadingAvatar(true);
          const img = await takePhotoWithCamera();
          if (img) {
            await api.updateProfile({ avatar_url: img });
            await refreshProfile();
          }
          setUploadingAvatar(false);
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          setUploadingAvatar(true);
          const img = await pickImageFromLibrary();
          if (img) {
            await api.updateProfile({ avatar_url: img });
            await refreshProfile();
          }
          setUploadingAvatar(false);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handlePickDLPhoto() {
    const img = await pickDocumentImage();
    if (img) setDlPhoto(img);
  }

  async function handlePickRCPhoto() {
    const img = await pickDocumentImage();
    if (img) setRcPhoto(img);
  }

  async function savePersonalDetails() {
    setSavingPersonal(true);
    const { error } = await api.updateProfile({
      full_name: fullName.trim(),
      phone: phone.trim(),
      bio: bio.trim(),
      gender: gender.trim(),
    });
    setSavingPersonal(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    await refreshProfile();
    setEditingPersonal(false);
    Alert.alert('Saved', 'Your profile details have been updated.');
  }

  async function saveEmergencyContact() {
    setSavingEmergency(true);
    const { error } = await api.updateProfile({
      emergency_contact_name: emergencyName.trim(),
      emergency_contact_phone: emergencyPhone.trim(),
    });
    setSavingEmergency(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    await refreshProfile();
    setEditingEmergency(false);
    Alert.alert('Saved', 'Your emergency contact has been updated.');
  }

  async function submitDL() {
    if (!dlNumber.trim()) {
      Alert.alert('Error', 'Please enter your DL number');
      return;
    }
    setVerifyLoading(true);
    const { error } = await api.submitDL({
      dl_number: dlNumber.trim(),
      dl_image_url: dlPhoto || undefined,
    });
    setVerifyLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    Alert.alert(
      'DL Submitted! 🎉',
      'Your driving licence is being verified. Verification completes in a few seconds.'
    );
    setShowDLForm(false);
    setTimeout(fetchVerification, 3000);
  }

  async function submitRC() {
    if (!rcNumber.trim()) {
      Alert.alert('Error', 'Please enter your vehicle RC number');
      return;
    }
    setVerifyLoading(true);
    const { error } = await api.submitRC({
      rc_number: rcNumber.trim(),
      vehicle_type: rcVehicleType,
      vehicle_make: vehicleMake.trim(),
      vehicle_model: vehicleModel.trim(),
      vehicle_year: vehicleYear.trim(),
      vehicle_color: vehicleColor.trim(),
      vehicle_plate: vehiclePlate.trim(),
      rc_image_url: rcPhoto || undefined,
    });
    setVerifyLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    Alert.alert(
      'RC Submitted! 🎉',
      `Your ${rcVehicleType === 'bike' ? 'bike' : 'car'} RC document has been submitted for verification.`
    );
    setShowRCForm(false);
    setTimeout(fetchVerification, 3000);
  }

  async function performLogout() {
    try {
      await logout();
    } finally {
      router.replace('/(auth)/(screens)/login');
    }
  }

  function handleSignOut() {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
      if (confirmed) {
        performLogout();
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          performLogout();
        },
      },
    ]);
  }

  const initials = (user?.full_name ?? 'U')
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const dlStatus = verification?.dl_number?.trim() ? (verification.dl_status || 'not_submitted') : 'not_submitted';
  const rcStatus = verification?.rc_number?.trim() ? (verification.rc_status || 'not_submitted') : 'not_submitted';
  const secondaryRcStatus = verification?.secondary_rc_number?.trim()
    ? (verification.secondary_rc_status || 'not_submitted')
    : 'not_submitted';

  const hasPrimaryVehicle = rcStatus === 'verified' && Boolean(verification?.rc_number);
  const hasSecondaryVehicle = secondaryRcStatus === 'verified' && Boolean(verification?.secondary_rc_number);

  function StatusBadge({ status }: { status: string }) {
    const isVerified = status === 'verified';
    const isPending = status === 'pending';
    const isRejected = status === 'rejected';

    return (
      <View
        style={[
          styles.statusBadge,
          isVerified && styles.badgeVerified,
          isPending && styles.badgePending,
          isRejected && styles.badgeRejected,
          (!isVerified && !isPending && !isRejected) && styles.badgeDefault,
        ]}
      >
        {isVerified && <Check size={11} color="#059669" strokeWidth={3} />}
        {isPending && <Clock size={11} color="#d97706" strokeWidth={2.5} />}
        {isRejected && <X size={11} color="#dc2626" strokeWidth={2.5} />}
        <Text
          style={[
            styles.statusBadgeText,
            isVerified && styles.badgeTextVerified,
            isPending && styles.badgeTextPending,
            isRejected && styles.badgeTextRejected,
            (!isVerified && !isPending && !isRejected) && styles.badgeTextDefault,
          ]}
        >
          {isVerified ? 'Verified' : isPending ? 'Pending' : isRejected ? 'Action Needed' : 'Not Submitted'}
        </Text>
      </View>
    );
  }

  function formatDateTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      if (isToday) return `Today, ${timeStr}`;
      return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} • ${timeStr}`;
    } catch {
      return dateStr;
    }
  }

  // Reviews filtering
  const allReviews = profileStats?.reviews || [];
  const passengerReviews = allReviews.filter((r) => r.rater_role === 'Passenger');
  const driverReviews = allReviews.filter((r) => r.rater_role === 'Driver');

  const displayedReviews = allReviews.filter((r) => {
    if (reviewFilter === 'passenger') return r.rater_role === 'Passenger';
    if (reviewFilter === 'driver') return r.rater_role === 'Driver';
    return true;
  });

  // Trip & Drop Offer filtering
  const activeTrips = trips.filter(
    (t) => t.ride && ['open', 'active', 'in_progress'].includes(t.ride.status)
  );
  const completedTrips = trips.filter(
    (t) => t.ride && t.ride.status === 'completed'
  );
  const activeDrops = passengerPosts.filter(
    (p) => ['open', 'accepted'].includes(p.status)
  );
  const completedDrops = passengerPosts.filter(
    (p) => p.status === 'completed'
  );
  const totalActiveCount = activeTrips.length + activeDrops.length;
  const totalCompletedCount = completedTrips.length + completedDrops.length;

  const displayedTrips = ridesTab === 'active' ? activeTrips : completedTrips;
  const displayedDrops = ridesTab === 'active' ? activeDrops : completedDrops;
  const hasRidesOrDrops = displayedTrips.length > 0 || displayedDrops.length > 0;

  const totalRidesCount = profileStats?.total_rides ?? user?.total_rides ?? (trips.length + passengerPosts.length);
  const ratingScore = profileStats?.avg_rating ?? user?.avg_rating ?? 0;

  const bottomAutoPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 80;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Clean Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Profile</Text>
          {user?.is_verified_driver ? (
            <View style={styles.verifiedHeaderChip}>
              <ShieldCheck size={13} color="#059669" strokeWidth={2.5} />
              <Text style={styles.verifiedHeaderText}>Verified Driver</Text>
            </View>
          ) : (
            <View style={[styles.verifiedHeaderChip, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[styles.verifiedHeaderText, { color: Colors.neutral[600] }]}>
                Co-Rider
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomAutoPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero User Identity Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroMainRow}>
            {/* Avatar with Camera Button */}
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handleAvatarPick}
              disabled={uploadingAvatar}
              activeOpacity={0.85}
            >
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
              ) : (
                <LinearGradient
                  colors={[Colors.primary[600], Colors.primary[800]]}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </LinearGradient>
              )}
              <View style={styles.avatarEditBubble}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Camera size={13} color="#ffffff" strokeWidth={2.6} />
                )}
              </View>
            </TouchableOpacity>

            {/* User Meta */}
            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.full_name || 'LoRide User'}
                </Text>
                {user?.is_verified_driver && (
                  <View style={styles.verifiedMiniTick}>
                    <Check size={10} color="#ffffff" strokeWidth={3} />
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <Phone size={13} color={Colors.neutral[500]} />
                <Text style={styles.metaText}>{user?.phone || 'Phone not set'}</Text>
              </View>

              <View style={styles.metaRow}>
                <MapPin size={13} color={Colors.primary[600]} />
                <Text style={styles.metaText}>{user?.city || ''}</Text>
              </View>
            </View>
          </View>

          {/* User Bio Quote if set */}
          {user?.bio ? (
            <View style={styles.bioQuoteBox}>
              <Text style={styles.bioQuoteText}>"{user.bio}"</Text>
            </View>
          ) : null}

          {/* Quick 3-Stat Bar */}
          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>
                {ratingScore > 0 ? `${ratingScore.toFixed(1)} ★` : 'New'}
              </Text>
              <Text style={styles.quickStatLabel}>Rating</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{totalRidesCount}</Text>
              <Text style={styles.quickStatLabel}>Total Rides</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>
                {hasPrimaryVehicle ? (verification?.vehicle_model || 'Verified') : 'No Vehicle'}
              </Text>
              <Text style={styles.quickStatLabel}>Vehicle</Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* INTERACTIVE BUTTONS ACCORDION (Click Button to Open Data Inside)          */}
        {/* ========================================================================= */}
        <View style={styles.menuContainer}>

          {/* 1. BUTTON: MY RIDES & TRIPS */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => toggleSection('rides')}
              activeOpacity={0.8}
            >
              <View style={styles.menuButtonLeft}>
                <View style={[styles.menuIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Car size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>My Rides & Trips</Text>
                  <Text style={styles.menuSubtitle}>Live published rides & history</Text>
                </View>
              </View>

              <View style={styles.menuButtonRight}>
                <View style={styles.pillBadgeActive}>
                  <Text style={styles.pillBadgeActiveText}>
                    {totalActiveCount} Active
                  </Text>
                </View>
                {openSections.rides ? (
                  <ChevronDown size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                )}
              </View>
            </TouchableOpacity>

            {/* OPEN DATA: RIDES CONTENT */}
            {openSections.rides && (
              <View style={styles.menuExpandedContent}>
                {/* Sub-Tabs: Active vs Completed */}
                <View style={styles.ridesTabsBar}>
                  <TouchableOpacity
                    style={[styles.ridesTabPill, ridesTab === 'active' && styles.ridesTabPillActive]}
                    onPress={() => setRidesTab('active')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.ridesTabPillText,
                        ridesTab === 'active' && styles.ridesTabPillTextActive,
                      ]}
                    >
                      Active ({totalActiveCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.ridesTabPill, ridesTab === 'completed' && styles.ridesTabPillActive]}
                    onPress={() => setRidesTab('completed')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.ridesTabPillText,
                        ridesTab === 'completed' && styles.ridesTabPillTextActive,
                      ]}
                    >
                      Past Trips ({totalCompletedCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {loadingTrips ? (
                  <View style={styles.loaderBox}>
                    <ActivityIndicator size="small" color={Colors.primary[600]} />
                    <Text style={styles.loaderText}>Loading live trips...</Text>
                  </View>
                ) : hasRidesOrDrops ? (
                  <View style={styles.tripsList}>
                    {/* Carpool rides */}
                    {displayedTrips.map((item, idx) => {
                      const r = item.ride;
                      const isBike = r.vehicle_type === 'bike';
                      const isActive = ['open', 'active', 'in_progress'].includes(r.status);

                      return (
                        <TouchableOpacity
                          key={r.id || idx}
                          style={styles.tripCard}
                          onPress={() => router.push(`/ride/${r.id}`)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.tripCardHeader}>
                            <View style={styles.vehicleChip}>
                              {isBike ? (
                                <Bike size={13} color="#0284c7" strokeWidth={2.4} />
                              ) : (
                                <Car size={13} color="#0284c7" strokeWidth={2.4} />
                              )}
                              <Text style={styles.vehicleChipText}>
                                {isBike ? 'Bike Pool' : 'Car Pool'} • {r.vehicle_info || (isBike ? 'Two Wheeler' : 'Car')}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.tripStatusChip,
                                isActive ? styles.tripStatusActive : styles.tripStatusCompleted,
                              ]}
                            >
                              {isActive && <View style={styles.activeDot} />}
                              <Text
                                style={[
                                  styles.tripStatusText,
                                  isActive ? styles.tripStatusTextActive : styles.tripStatusTextCompleted,
                                ]}
                              >
                                {isActive ? 'Live / Open' : 'Completed'}
                              </Text>
                            </View>
                          </View>

                          {/* Route Timeline */}
                          <View style={styles.routeBox}>
                            <View style={styles.routeDots}>
                              <View style={styles.dotOrigin} />
                              <View style={styles.routeLine} />
                              <View style={styles.dotDest} />
                            </View>
                            <View style={styles.routeTexts}>
                              <Text style={styles.routeText} numberOfLines={1}>
                                {r.origin}
                              </Text>
                              <Text style={styles.routeText} numberOfLines={1}>
                                {r.destination}
                              </Text>
                            </View>
                          </View>

                          {/* Schedule & Fare Bottom */}
                          <View style={styles.tripCardFooter}>
                            <View style={styles.tripFooterLeft}>
                              <Clock size={12} color={Colors.neutral[500]} />
                              <Text style={styles.tripScheduleText}>
                                {formatDateTime(r.departure_time)}
                              </Text>
                            </View>

                            <View style={styles.tripFooterRight}>
                              <Text style={styles.tripFareText}>
                                ₹{Math.round(r.price_per_seat)}
                                <Text style={styles.tripFarePer}> / seat</Text>
                              </Text>
                              <View style={styles.viewRideBtn}>
                                <Text style={styles.viewRideBtnText}>View Ride</Text>
                                <ArrowUpRight size={12} color={Colors.primary[600]} strokeWidth={2.5} />
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Passenger Drop Offers / Requests */}
                    {displayedDrops.map((drop) => {
                      const isOfferedByMe = drop.accepted_driver_id === user?.id;
                      const isCompleted = drop.status === 'completed';
                      const isBike = drop.vehicle_preference === 'bike';

                      return (
                        <TouchableOpacity
                          key={drop.id}
                          style={[styles.tripCard, { borderColor: isOfferedByMe ? '#a7f3d0' : '#bfdbfe' }]}
                          onPress={() => router.push(`/passenger-post/${drop.id}`)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.tripCardHeader}>
                            <View style={[styles.vehicleChip, { backgroundColor: isOfferedByMe ? '#ecfdf5' : '#eff6ff' }]}>
                              {isOfferedByMe ? (
                                <CheckCircle2 size={13} color="#059669" strokeWidth={2.4} />
                              ) : (
                                <Navigation size={13} color="#0284c7" strokeWidth={2.4} />
                              )}
                              <Text style={[styles.vehicleChipText, { color: isOfferedByMe ? '#059669' : '#0284c7' }]}>
                                {isOfferedByMe ? 'Drop Offered by You' : 'Drop Request'} • {isBike ? 'Bike' : 'Car'}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.tripStatusChip,
                                !isCompleted ? styles.tripStatusActive : styles.tripStatusCompleted,
                              ]}
                            >
                              {!isCompleted && <View style={styles.activeDot} />}
                              <Text
                                style={[
                                  styles.tripStatusText,
                                  !isCompleted ? styles.tripStatusTextActive : styles.tripStatusTextCompleted,
                                ]}
                              >
                                {!isCompleted ? 'Accepted / Live' : 'Completed'}
                              </Text>
                            </View>
                          </View>

                          {/* Participant info */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.neutral[900] }}>
                              {isOfferedByMe
                                ? `Passenger: ${drop.passenger?.full_name || 'Passenger'}`
                                : `Driver: ${drop.accepted_driver?.full_name || 'Awaiting Driver'}`}
                            </Text>
                          </View>

                          {/* Route Timeline */}
                          <View style={styles.routeBox}>
                            <View style={styles.routeDots}>
                              <View style={[styles.dotOrigin, { backgroundColor: '#10b981' }]} />
                              <View style={styles.routeLine} />
                              <View style={[styles.dotDest, { borderColor: '#ef4444' }]} />
                            </View>
                            <View style={styles.routeTexts}>
                              <Text style={styles.routeText} numberOfLines={1}>
                                {drop.origin}
                              </Text>
                              <Text style={styles.routeText} numberOfLines={1}>
                                {drop.destination}
                              </Text>
                            </View>
                          </View>

                          {/* Schedule & Fare Bottom */}
                          <View style={styles.tripCardFooter}>
                            <View style={styles.tripFooterLeft}>
                              <Clock size={12} color={Colors.neutral[500]} />
                              <Text style={styles.tripScheduleText}>
                                {formatDateTime(drop.departure_time)}
                              </Text>
                            </View>

                            <View style={styles.tripFooterRight}>
                              <Text style={[styles.tripFareText, { color: '#059669' }]}>
                                ₹{Math.round(drop.suggested_fare)}
                              </Text>
                              <View style={styles.viewRideBtn}>
                                <Text style={styles.viewRideBtnText}>View Map & Details</Text>
                                <ArrowUpRight size={12} color={Colors.primary[600]} strokeWidth={2.5} />
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyContentBox}>
                    <Car size={32} color={Colors.neutral[300]} strokeWidth={1.5} />
                    <Text style={styles.emptyTitle}>
                      {ridesTab === 'active' ? 'No active live rides or drop offers' : 'No past trips recorded'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                      {ridesTab === 'active'
                        ? 'Publish a ride or offer a drop to a commuter to share commute costs.'
                        : 'Your completed rides and drop offers will be listed here.'}
                    </Text>
                    {ridesTab === 'active' && (
                      <TouchableOpacity
                        style={styles.primaryActionBtn}
                        onPress={() => router.push('/(tabs)/offer')}
                        activeOpacity={0.85}
                      >
                        <PlusCircle size={15} color="#ffffff" strokeWidth={2.4} />
                        <Text style={styles.primaryActionBtnText}>Publish a Ride</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* 2. BUTTON: DRIVER & VEHICLE DOCUMENTS */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => toggleSection('docs')}
              activeOpacity={0.8}
            >
              <View style={styles.menuButtonLeft}>
                <View style={[styles.menuIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Shield size={18} color="#059669" strokeWidth={2.4} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Driver & Vehicle Documents</Text>
                  <Text style={styles.menuSubtitle}>Driving Licence & Vehicle RC</Text>
                </View>
              </View>

              <View style={styles.menuButtonRight}>
                <StatusBadge status={hasPrimaryVehicle ? 'verified' : dlStatus} />
                {openSections.docs ? (
                  <ChevronDown size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                )}
              </View>
            </TouchableOpacity>

            {/* OPEN DATA: DOCUMENTS CONTENT */}
            {openSections.docs && (
              <View style={styles.menuExpandedContent}>
                {/* DL Item Card */}
                <View style={styles.subItemCard}>
                  <View style={styles.subItemHeader}>
                    <FileCheck size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                    <View style={{ flex: 1, marginLeft: Spacing.xs }}>
                      <Text style={styles.subItemTitle}>Driving Licence (DL)</Text>
                      <Text style={styles.subItemValue}>
                        {verification?.dl_number || 'Required for publishing rides'}
                      </Text>
                    </View>
                    <StatusBadge status={dlStatus} />
                  </View>

                  {dlStatus !== 'verified' && (
                    <TouchableOpacity
                      style={styles.subItemActionBtn}
                      onPress={() => setShowDLForm(!showDLForm)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.subItemActionBtnText}>
                        {showDLForm ? 'Hide Form' : dlStatus === 'rejected' ? 'Re-upload DL' : 'Submit DL Document'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Expandable DL Form */}
                  {showDLForm && (
                    <View style={styles.formContainer}>
                      <Text style={styles.inputLabel}>Driving Licence Number</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. DL0120190012345"
                        placeholderTextColor={Colors.neutral[400]}
                        value={dlNumber}
                        onChangeText={setDLNumber}
                        autoCapitalize="characters"
                      />

                      <Text style={styles.inputLabel}>Licence Document Photo</Text>
                      {dlPhoto ? (
                        <View style={styles.photoPreviewWrap}>
                          <Image source={{ uri: dlPhoto }} style={styles.photoPreviewImg} />
                          <TouchableOpacity
                            style={styles.removePhotoBubble}
                            onPress={() => setDlPhoto(null)}
                          >
                            <X size={13} color="#ffffff" strokeWidth={2.6} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.uploadTile}
                          onPress={handlePickDLPhoto}
                          activeOpacity={0.8}
                        >
                          <Upload size={17} color={Colors.primary[600]} />
                          <Text style={styles.uploadTileText}>Upload DL Photo</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.formSubmitBtn}
                        onPress={submitDL}
                        disabled={verifyLoading}
                        activeOpacity={0.85}
                      >
                        {verifyLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.formSubmitBtnText}>Submit Driving Licence</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* RC Vehicle Item Card */}
                <View style={styles.subItemCard}>
                  {/* Primary Vehicle */}
                  <View style={styles.subItemHeader}>
                    {verification?.vehicle_type === 'bike' ? (
                      <Bike size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                    ) : (
                      <Car size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                    )}
                    <View style={{ flex: 1, marginLeft: Spacing.xs }}>
                      <Text style={styles.subItemTitle}>
                        Primary Vehicle ({verification?.vehicle_type === 'bike' ? 'Bike RC' : 'Car RC'})
                      </Text>
                      <Text style={styles.subItemValue}>
                        {verification?.rc_number
                          ? `${verification.vehicle_make} ${verification.vehicle_model} • ${verification.rc_number}`
                          : 'Vehicle Registration Certificate'}
                      </Text>
                    </View>
                    <StatusBadge status={rcStatus} />
                  </View>

                  {/* Secondary Vehicle if verified */}
                  {hasSecondaryVehicle && (
                    <View style={[styles.subItemHeader, { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: '#f1f5f9' }]}>
                      {verification?.secondary_vehicle_type === 'bike' ? (
                        <Bike size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                      ) : (
                        <Car size={18} color={Colors.primary[600]} strokeWidth={2.2} />
                      )}
                      <View style={{ flex: 1, marginLeft: Spacing.xs }}>
                        <Text style={styles.subItemTitle}>
                          Secondary Vehicle ({verification?.secondary_vehicle_type === 'bike' ? 'Bike RC' : 'Car RC'})
                        </Text>
                        <Text style={styles.subItemValue}>
                          {verification?.secondary_vehicle_make} {verification?.secondary_vehicle_model} • {verification?.secondary_rc_number}
                        </Text>
                      </View>
                      <StatusBadge status={secondaryRcStatus} />
                    </View>
                  )}

                  {/* Add / Submit RC Button */}
                  {(!hasPrimaryVehicle || (!hasSecondaryVehicle && hasPrimaryVehicle)) && (
                    <TouchableOpacity
                      style={styles.subItemActionBtn}
                      onPress={() => {
                        if (hasPrimaryVehicle && !hasSecondaryVehicle) {
                          setRcVehicleType(verification?.vehicle_type === 'bike' ? 'car' : 'bike');
                        }
                        setShowRCForm(!showRCForm);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.subItemActionBtnText}>
                        {showRCForm
                          ? 'Hide RC Form'
                          : !hasPrimaryVehicle
                            ? rcStatus === 'rejected'
                              ? 'Re-upload RC'
                              : 'Submit Vehicle RC'
                            : `+ Add Second Vehicle (${verification?.vehicle_type === 'bike' ? 'Car' : 'Bike'})`}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Expandable RC Form */}
                  {showRCForm && (
                    <View style={styles.formContainer}>
                      <Text style={styles.inputLabel}>Vehicle Type</Text>
                      <View style={styles.typeSelectorRow}>
                        <TouchableOpacity
                          style={[
                            styles.typeBtn,
                            rcVehicleType === 'car' && styles.typeBtnActive,
                          ]}
                          onPress={() => setRcVehicleType('car')}
                          activeOpacity={0.8}
                        >
                          <Car size={15} color={rcVehicleType === 'car' ? '#ffffff' : Colors.neutral[600]} />
                          <Text
                            style={[
                              styles.typeBtnText,
                              rcVehicleType === 'car' && styles.typeBtnTextActive,
                            ]}
                          >
                            Car
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.typeBtn,
                            rcVehicleType === 'bike' && styles.typeBtnActive,
                          ]}
                          onPress={() => setRcVehicleType('bike')}
                          activeOpacity={0.8}
                        >
                          <Bike size={15} color={rcVehicleType === 'bike' ? '#ffffff' : Colors.neutral[600]} />
                          <Text
                            style={[
                              styles.typeBtnText,
                              rcVehicleType === 'bike' && styles.typeBtnTextActive,
                            ]}
                          >
                            Bike / Scooter
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.inputLabel}>RC Number</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. TS09AB1234"
                        placeholderTextColor={Colors.neutral[400]}
                        value={rcNumber}
                        onChangeText={setRCNumber}
                        autoCapitalize="characters"
                      />

                      <View style={styles.row2}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Make (Brand)</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="e.g. Honda"
                            placeholderTextColor={Colors.neutral[400]}
                            value={vehicleMake}
                            onChangeText={setVehicleMake}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Model</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder={rcVehicleType === 'bike' ? 'e.g. Activa' : 'e.g. City'}
                            placeholderTextColor={Colors.neutral[400]}
                            value={vehicleModel}
                            onChangeText={setVehicleModel}
                          />
                        </View>
                      </View>

                      <View style={styles.row2}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Plate Number</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="e.g. TS09AB1234"
                            placeholderTextColor={Colors.neutral[400]}
                            value={vehiclePlate}
                            onChangeText={setVehiclePlate}
                            autoCapitalize="characters"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Color</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="e.g. White"
                            placeholderTextColor={Colors.neutral[400]}
                            value={vehicleColor}
                            onChangeText={setVehicleColor}
                          />
                        </View>
                      </View>

                      <Text style={styles.inputLabel}>RC Document Photo</Text>
                      {rcPhoto ? (
                        <View style={styles.photoPreviewWrap}>
                          <Image source={{ uri: rcPhoto }} style={styles.photoPreviewImg} />
                          <TouchableOpacity
                            style={styles.removePhotoBubble}
                            onPress={() => setRcPhoto(null)}
                          >
                            <X size={13} color="#ffffff" strokeWidth={2.6} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.uploadTile}
                          onPress={handlePickRCPhoto}
                          activeOpacity={0.8}
                        >
                          <Upload size={17} color={Colors.primary[600]} />
                          <Text style={styles.uploadTileText}>Upload RC Document Photo</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.formSubmitBtn}
                        onPress={submitRC}
                        disabled={verifyLoading}
                        activeOpacity={0.85}
                      >
                        {verifyLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.formSubmitBtnText}>Submit Vehicle RC</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* 3. BUTTON: REVIEWS & RATINGS */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => toggleSection('reviews')}
              activeOpacity={0.8}
            >
              <View style={styles.menuButtonLeft}>
                <View style={[styles.menuIconCircle, { backgroundColor: '#FFFBEB' }]}>
                  <Star size={18} color="#f59e0b" fill="#f59e0b" strokeWidth={2} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Reviews & Ratings</Text>
                  <Text style={styles.menuSubtitle}>Co-traveler feedback & trust</Text>
                </View>
              </View>

              <View style={styles.menuButtonRight}>
                <View style={styles.pillBadgeNeutral}>
                  <Text style={styles.pillBadgeNeutralText}>
                    {allReviews.length > 0 ? `${allReviews.length} Reviews` : '0 Reviews'}
                  </Text>
                </View>
                {openSections.reviews ? (
                  <ChevronDown size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                )}
              </View>
            </TouchableOpacity>

            {/* OPEN DATA: REVIEWS CONTENT */}
            {openSections.reviews && (
              <View style={styles.menuExpandedContent}>
                {allReviews.length > 0 ? (
                  <>
                    {/* Role Filter Tabs */}
                    <View style={styles.filterChipsRow}>
                      <TouchableOpacity
                        style={[styles.filterPill, reviewFilter === 'all' && styles.filterPillActive]}
                        onPress={() => setReviewFilter('all')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.filterPillText, reviewFilter === 'all' && styles.filterPillTextActive]}>
                          All ({allReviews.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.filterPill, reviewFilter === 'passenger' && styles.filterPillActive]}
                        onPress={() => setReviewFilter('passenger')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.filterPillText, reviewFilter === 'passenger' && styles.filterPillTextActive]}>
                          From Passengers ({passengerReviews.length})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.filterPill, reviewFilter === 'driver' && styles.filterPillActive]}
                        onPress={() => setReviewFilter('driver')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.filterPillText, reviewFilter === 'driver' && styles.filterPillTextActive]}>
                          From Drivers ({driverReviews.length})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Review Cards */}
                    <View style={{ gap: Spacing.sm }}>
                      {displayedReviews.map((rev) => (
                        <View key={rev.id} style={styles.reviewCardItem}>
                          <View style={styles.reviewCardTop}>
                            <View style={styles.raterRow}>
                              <View style={styles.raterAvatarFallback}>
                                <Text style={styles.raterInitials}>
                                  {(rev.rater_name || 'U').slice(0, 2).toUpperCase()}
                                </Text>
                              </View>
                              <View>
                                <Text style={styles.raterName}>{rev.rater_name}</Text>
                                <Text style={styles.reviewDate}>{formatDateTime(rev.created_at)}</Text>
                              </View>
                            </View>
                            <View style={styles.reviewScorePill}>
                              <Star size={11} color="#f59e0b" fill="#f59e0b" />
                              <Text style={styles.reviewScoreText}>{rev.score}.0</Text>
                            </View>
                          </View>

                          {rev.origin && rev.destination && (
                            <View style={styles.reviewRouteChip}>
                              <MapPin size={11} color={Colors.primary[600]} />
                              <Text style={styles.reviewRouteText} numberOfLines={1}>
                                {rev.origin} → {rev.destination}
                              </Text>
                            </View>
                          )}

                          <Text style={styles.reviewComment}>"{rev.comment}"</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyContentBox}>
                    <Star size={32} color={Colors.neutral[300]} strokeWidth={1.5} />
                    <Text style={styles.emptyTitle}>No co-traveler reviews yet</Text>
                    <Text style={styles.emptySubtitle}>
                      When you complete rides with passengers or drivers, verified reviews will appear here.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* 4. BUTTON: PERSONAL INFORMATION */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => toggleSection('personal')}
              activeOpacity={0.8}
            >
              <View style={styles.menuButtonLeft}>
                <View style={[styles.menuIconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <UserIcon size={18} color={Colors.neutral[700]} strokeWidth={2.4} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Personal Details</Text>
                  <Text style={styles.menuSubtitle}>Name, phone, bio & gender</Text>
                </View>
              </View>

              <View style={styles.menuButtonRight}>
                <View style={styles.pillBadgeNeutral}>
                  <Text style={styles.pillBadgeNeutralText}>
                    {editingPersonal ? 'Editing' : 'View / Edit'}
                  </Text>
                </View>
                {openSections.personal ? (
                  <ChevronDown size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                )}
              </View>
            </TouchableOpacity>

            {/* OPEN DATA: PERSONAL DETAILS CONTENT */}
            {openSections.personal && (
              <View style={styles.menuExpandedContent}>
                {!editingPersonal ? (
                  <View style={styles.detailsViewBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Full Name</Text>
                      <Text style={styles.detailValue}>{user?.full_name || 'Not set'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>{user?.phone || 'Not set'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Email</Text>
                      <Text style={styles.detailValue}>{user?.email || 'Not set'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>City</Text>
                      <Text style={styles.detailValue}>{user?.city || ''}</Text>
                    </View>
                    {user?.gender ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Gender</Text>
                        <Text style={styles.detailValue}>{user.gender}</Text>
                      </View>
                    ) : null}
                    {user?.bio ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Bio</Text>
                        <Text style={styles.detailValue}>{user.bio}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={styles.subItemActionBtn}
                      onPress={() => setEditingPersonal(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.subItemActionBtnText}>Edit Personal Details</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.formContainer}>
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Your full name"
                    />

                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      placeholder="Your phone number"
                    />

                    <Text style={styles.inputLabel}>Bio / Commute Details</Text>
                    <TextInput
                      style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                      value={bio}
                      onChangeText={setBio}
                      placeholder="e.g. Daily commuter from KPHB to Madhapur"
                      multiline
                    />

                    <Text style={styles.inputLabel}>Gender</Text>
                    <TextInput
                      style={styles.textInput}
                      value={gender}
                      onChangeText={setGender}
                      placeholder="Male / Female / Other"
                    />

                    <View style={styles.row2}>
                      <TouchableOpacity
                        style={[styles.formSubmitBtn, { flex: 1, backgroundColor: Colors.neutral[200] }]}
                        onPress={() => setEditingPersonal(false)}
                      >
                        <Text style={[styles.formSubmitBtnText, { color: Colors.neutral[800] }]}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.formSubmitBtn, { flex: 1 }]}
                        onPress={savePersonalDetails}
                        disabled={savingPersonal}
                      >
                        {savingPersonal ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.formSubmitBtnText}>Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* 5. BUTTON: EMERGENCY SAFETY CONTACT */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => toggleSection('safety')}
              activeOpacity={0.8}
            >
              <View style={styles.menuButtonLeft}>
                <View style={[styles.menuIconCircle, { backgroundColor: '#FEF2F2' }]}>
                  <HeartHandshake size={18} color="#dc2626" strokeWidth={2.4} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={styles.menuTitle}>Emergency Contact (SOS)</Text>
                  <Text style={styles.menuSubtitle}>In-ride emergency alert recipient</Text>
                </View>
              </View>

              <View style={styles.menuButtonRight}>
                <View
                  style={user?.emergency_contact_name ? styles.pillBadgeActive : styles.pillBadgeNeutral}
                >
                  <Text
                    style={
                      user?.emergency_contact_name
                        ? styles.pillBadgeActiveText
                        : styles.pillBadgeNeutralText
                    }
                  >
                    {user?.emergency_contact_name ? 'Configured' : 'Not Set'}
                  </Text>
                </View>
                {openSections.safety ? (
                  <ChevronDown size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={18} color={Colors.neutral[500]} strokeWidth={2.4} />
                )}
              </View>
            </TouchableOpacity>

            {/* OPEN DATA: SAFETY CONTENT */}
            {openSections.safety && (
              <View style={styles.menuExpandedContent}>
                {!editingEmergency ? (
                  <View style={styles.detailsViewBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Contact Name</Text>
                      <Text style={styles.detailValue}>
                        {user?.emergency_contact_name || 'Not configured'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Contact Phone</Text>
                      <Text style={styles.detailValue}>
                        {user?.emergency_contact_phone || 'Not configured'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.subItemActionBtn}
                      onPress={() => setEditingEmergency(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.subItemActionBtnText}>
                        {user?.emergency_contact_name ? 'Change Emergency Contact' : 'Add Emergency Contact'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.formContainer}>
                    <Text style={styles.inputLabel}>Emergency Contact Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={emergencyName}
                      onChangeText={setEmergencyName}
                      placeholder="e.g. Father, Spouse, Friend"
                    />

                    <Text style={styles.inputLabel}>Emergency Contact Phone</Text>
                    <TextInput
                      style={styles.textInput}
                      value={emergencyPhone}
                      onChangeText={setEmergencyPhone}
                      keyboardType="phone-pad"
                      placeholder="10-digit mobile number"
                    />

                    <View style={styles.row2}>
                      <TouchableOpacity
                        style={[styles.formSubmitBtn, { flex: 1, backgroundColor: Colors.neutral[200] }]}
                        onPress={() => setEditingEmergency(false)}
                      >
                        <Text style={[styles.formSubmitBtnText, { color: Colors.neutral[800] }]}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.formSubmitBtn, { flex: 1 }]}
                        onPress={saveEmergencyContact}
                        disabled={savingEmergency}
                      >
                        {savingEmergency ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.formSubmitBtnText}>Save SOS Contact</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

        </View>

        {/* ========================================================================= */}
        {/* SIGN OUT BUTTON                                                           */}
        {/* ========================================================================= */}
        <View style={styles.signOutWrapper}>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <LogOut size={16} color="#dc2626" strokeWidth={2.2} />
            <Text style={styles.signOutBtnText}>Sign Out from LoLo Ride</Text>
          </TouchableOpacity>
          <Text style={styles.appVersionText}>LoLo Ride v1.0.0  </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.neutral[900],
    letterSpacing: -0.3,
  },
  verifiedHeaderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  verifiedHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  scrollView: {
    flex: 1,
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadow.sm,
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.primary[600],
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  avatarEditBubble: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Colors.primary[600],
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  heroInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.neutral[900],
  },
  verifiedMiniTick: {
    backgroundColor: '#059669',
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.neutral[600],
  },
  bioQuoteBox: {
    marginTop: Spacing.md,
    backgroundColor: '#F8FAFC',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary[500],
  },
  bioQuoteText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: Colors.neutral[700],
  },

  // Quick Stats Row
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.neutral[900],
  },
  quickStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },

  // Accordion Menu Container
  menuContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    ...Shadow.sm,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  menuButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  menuIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  menuSubtitle: {
    fontSize: 11,
    color: Colors.neutral[500],
    marginTop: 1,
  },
  menuButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  pillBadgeActive: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillBadgeActiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  pillBadgeNeutral: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillBadgeNeutralText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.neutral[600],
  },

  // Expanded Content Inside Menu Button
  menuExpandedContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: Spacing.md,
  },

  // Rides Tab Pills
  ridesTabsBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  ridesTabPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  ridesTabPillActive: {
    backgroundColor: '#ffffff',
    ...Shadow.sm,
  },
  ridesTabPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
  },
  ridesTabPillTextActive: {
    color: Colors.primary[600],
    fontWeight: '700',
  },

  // Trip Card
  tripsList: {
    gap: Spacing.sm,
  },
  tripCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  vehicleChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  tripStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  tripStatusActive: {
    backgroundColor: '#ECFDF5',
  },
  tripStatusCompleted: {
    backgroundColor: '#F1F5F9',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  tripStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tripStatusTextActive: {
    color: '#059669',
  },
  tripStatusTextCompleted: {
    color: Colors.neutral[600],
  },

  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  routeDots: {
    alignItems: 'center',
    width: 12,
  },
  dotOrigin: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10b981',
  },
  routeLine: {
    width: 2,
    height: 14,
    backgroundColor: '#CBD5E1',
    marginVertical: 2,
  },
  dotDest: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  routeTexts: {
    flex: 1,
    gap: 4,
  },
  routeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.neutral[800],
  },

  tripCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripScheduleText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[600],
  },
  tripFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripFareText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.neutral[900],
  },
  tripFarePer: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.neutral[500],
  },
  viewRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  viewRideBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary[600],
  },

  // Empty Box
  emptyContentBox: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.neutral[800],
    marginTop: Spacing.xs,
  },
  emptySubtitle: {
    fontSize: 11,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginTop: 2,
    maxWidth: 260,
    lineHeight: 15,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary[600],
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
    ...Shadow.sm,
  },
  primaryActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  loaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
  },

  // Sub Item Cards (DL / RC)
  subItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.sm,
  },
  subItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.neutral[800],
  },
  subItemValue: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[600],
    marginTop: 1,
  },
  subItemActionBtn: {
    marginTop: Spacing.sm,
    backgroundColor: '#EFF6FF',
    paddingVertical: 7,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  subItemActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary[600],
  },

  // Document Forms
  formContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.neutral[700],
    marginTop: 2,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: Colors.neutral[900],
  },
  row2: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  typeBtnActive: {
    backgroundColor: Colors.primary[600],
    borderColor: Colors.primary[600],
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.neutral[600],
  },
  typeBtnTextActive: {
    color: '#ffffff',
  },
  uploadTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary[300],
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: 2,
  },
  uploadTileText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary[600],
  },
  photoPreviewWrap: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 2,
  },
  photoPreviewImg: {
    width: '100%',
    height: 110,
    borderRadius: Radius.md,
  },
  removePhotoBubble: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSubmitBtn: {
    backgroundColor: Colors.primary[600],
    borderRadius: Radius.md,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  formSubmitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Status Badges
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeVerified: {
    backgroundColor: '#ECFDF5',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  badgeDefault: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextVerified: {
    color: '#059669',
  },
  badgeTextPending: {
    color: '#D97706',
  },
  badgeTextRejected: {
    color: '#DC2626',
  },
  badgeTextDefault: {
    color: Colors.neutral[500],
  },

  // Reviews Elements
  filterChipsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  filterPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  filterPillActive: {
    backgroundColor: Colors.primary[600],
  },
  filterPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.neutral[600],
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  reviewCardItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  raterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  raterAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  raterInitials: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary[700],
  },
  raterName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  reviewDate: {
    fontSize: 10,
    color: Colors.neutral[400],
  },
  reviewScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  reviewScoreText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  reviewRouteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginVertical: 4,
  },
  reviewRouteText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary[700],
  },
  reviewComment: {
    fontSize: 11,
    color: Colors.neutral[700],
    fontStyle: 'italic',
  },

  // Details View Box (Personal & Safety)
  detailsViewBox: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.neutral[500],
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.neutral[800],
    maxWidth: '65%',
    textAlign: 'right',
  },

  // Sign Out
  signOutWrapper: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 12,
  },
  signOutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  appVersionText: {
    fontSize: 11,
    color: Colors.neutral[400],
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
