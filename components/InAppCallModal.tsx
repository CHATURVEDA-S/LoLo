import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Volume1,
  ShieldCheck,
  Radio,
  Car,
  Bike,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from 'expo-audio';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { api } from '@/lib/api';
import { RideCall, RideStatus } from '@/lib/types';
import {
  startOutgoingRingback,
  startIncomingRingtone,
  stopAllCallSounds,
  configureCallAudioMode,
  resetCallAudioMode,
} from '@/lib/notifications';
import WebRTCVoiceBridge from './WebRTCVoiceBridge';

interface InAppCallModalProps {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  rideStatus: RideStatus;
  otherPartyName: string;
  otherPartyRole: 'Driver' | 'Passenger';
  otherPartyAvatar?: string;
  targetReceiverId?: string;
  vehicleType?: string;
  originName?: string;
  destinationName?: string;
  isIncoming?: boolean;
  existingCall?: RideCall | null;
}

export default function InAppCallModal({
  visible,
  onClose,
  rideId,
  rideStatus,
  otherPartyName,
  otherPartyRole,
  otherPartyAvatar,
  targetReceiverId,
  vehicleType,
  originName,
  destinationName,
  isIncoming = false,
  existingCall = null,
}: InAppCallModalProps) {
  const [callState, setCallState] = useState<'initiating' | 'ringing' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'initiating'
  );
  const [voiceState, setVoiceState] = useState<'connecting' | 'connected' | 'failed' | 'disconnected'>('connecting');
  const [currentCall, setCurrentCall] = useState<RideCall | null>(existingCall);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  // Animation refs for pulsing ripple aura and dynamic audio waveform
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.7)).current;
  const wave3 = useRef(new Animated.Value(0.4)).current;
  const wave4 = useRef(new Animated.Value(0.8)).current;
  const wave5 = useRef(new Animated.Value(0.5)).current;

  // 1. Check and request microphone permissions
  async function checkAndRequestPermissions() {
    try {
      const current = await getRecordingPermissionsAsync();
      if (current.granted) {
        setHasMicPermission(true);
        return true;
      }
      const requested = await requestRecordingPermissionsAsync();
      setHasMicPermission(requested.granted);
      return requested.granted;
    } catch (err) {
      console.warn('Microphone permission query error:', err);
      setHasMicPermission(false);
      return false;
    }
  }

  // Ask for microphone permissions immediately on mount / visibility
  useEffect(() => {
    if (visible) {
      checkAndRequestPermissions();
    }
  }, [visible]);

  // Pulse animation loop for ringing
  useEffect(() => {
    if (callState === 'ringing' || callState === 'initiating') {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.35,
              duration: 1100,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1100,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.1,
              duration: 1100,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.55,
              duration: 1100,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [callState, pulseAnim, pulseOpacity]);

  // Audio frequency bar visualizer animation during connected call
  useEffect(() => {
    if (callState === 'connected' && !isMuted) {
      const animateWave = (anim: Animated.Value, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const a1 = animateWave(wave1, 380);
      const a2 = animateWave(wave2, 540);
      const a3 = animateWave(wave3, 320);
      const a4 = animateWave(wave4, 490);
      const a5 = animateWave(wave5, 420);

      a1.start();
      a2.start();
      a3.start();
      a4.start();
      a5.start();

      return () => {
        a1.stop();
        a2.stop();
        a3.stop();
        a4.stop();
        a5.stop();
      };
    }
  }, [callState, isMuted, wave1, wave2, wave3, wave4, wave5]);

  // Timer for active connected call
  useEffect(() => {
    let timer: any = null;
    if (callState === 'connected') {
      timer = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Enforce ride lifecycle: If ride completed or cancelled, immediately abort call
  useEffect(() => {
    if (visible && (rideStatus === 'completed' || rideStatus === 'cancelled')) {
      stopAllCallSounds();
      resetCallAudioMode();
      Alert.alert(
        'Ride Closed',
        'In-app calling is disabled once the ride is completed or cancelled to protect user privacy.'
      );
      onClose();
    }
  }, [visible, rideStatus, onClose]);

  // Start outgoing ringback or incoming ringtone
  useEffect(() => {
    if (!visible) return;

    if (rideStatus === 'completed' || rideStatus === 'cancelled') {
      return;
    }

    let isMounted = true;

    async function handleCallAudioStart() {
      // 1. Ensure microphone permission is requested
      await checkAndRequestPermissions();

      if (!isIncoming && !existingCall) {
        // Outgoing call (Caller): plays telephone ringing sound (earpiece or loudspeaker based on speaker toggle)
        setCallState('initiating');
        await configureCallAudioMode(isSpeaker);
        startOutgoingRingback(isSpeaker);

        const { data, error } = await api.initiateRideCall(rideId, targetReceiverId);
        if (!isMounted) return;

        if (error || !data) {
          stopAllCallSounds();
          resetCallAudioMode();
          Alert.alert('Call Failed', error || 'Could not place call. Ensure passenger is accepted and ride is active.');
          onClose();
          return;
        }

        setCurrentCall(data as RideCall);
        setCallState('ringing');
      } else if (existingCall) {
        setCurrentCall(existingCall);
        if (existingCall.status === 'connected') {
          setCallState('connected');
          stopAllCallSounds();
          await configureCallAudioMode(isSpeaker);
        } else {
          setCallState('ringing');
          // Incoming call (Receiver): plays loud ringtone sound on loudspeaker
          startIncomingRingtone();
        }
      } else if (isIncoming) {
        setCallState('ringing');
        startIncomingRingtone();
      }
    }

    handleCallAudioStart();

    return () => {
      isMounted = false;
      stopAllCallSounds();
      resetCallAudioMode();
    };
  }, [visible, isIncoming, existingCall, rideId, targetReceiverId, rideStatus, onClose]);

  // Poll call status while active
  useEffect(() => {
    if (!visible || callState === 'ended') return;

    let consecutiveMisses = 0;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await api.getActiveRideCall(rideId);
        if (error) {
          // Network jitter or temporary unreachable; do not drop call
          return;
        }

        if (data && data.call) {
          consecutiveMisses = 0;
          const c = data.call as RideCall;
          setCurrentCall(c);

          if (c.status === 'connected' && callState !== 'connected') {
            // Connected: stop all ring sounds and configure voice session
            stopAllCallSounds();
            await configureCallAudioMode(isSpeaker);
            setCallState('connected');
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (_) {}
          } else if (c.status === 'ended' || c.status === 'rejected') {
            stopAllCallSounds();
            resetCallAudioMode();
            setEndReason(c.status === 'rejected' ? 'Call Declined' : 'Call Ended');
            setCallState('ended');
            setTimeout(() => {
              onClose();
            }, 1400);
          }
        } else if (data && data.active === false) {
          consecutiveMisses++;
          if (consecutiveMisses >= 2) {
            stopAllCallSounds();
            resetCallAudioMode();
            setEndReason('Call Ended');
            setCallState('ended');
            setTimeout(() => {
              onClose();
            }, 1400);
          }
        }
      } catch (_) {}
    }, 1500);

    return () => clearInterval(interval);
  }, [visible, callState, rideId, isSpeaker, onClose]);

  async function handleAcceptCall() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (_) {}
    stopAllCallSounds();

    await checkAndRequestPermissions();
    await configureCallAudioMode(isSpeaker);
    setCallState('connected');

    if (currentCall) {
      try {
        const { data } = await api.updateRideCallStatus(rideId, currentCall.id, 'connected');
        if (data) {
          setCurrentCall(data as RideCall);
        }
      } catch (err) {
        console.warn('Accept call update error:', err);
      }
    }
  }

  async function handleEndOrDeclineCall() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    stopAllCallSounds();
    resetCallAudioMode();

    if (currentCall) {
      const newStatus = isIncoming && callState === 'ringing' ? 'rejected' : 'ended';
      await api.updateRideCallStatus(rideId, currentCall.id, newStatus);
    }

    setEndReason(isIncoming && callState === 'ringing' ? 'Call Declined' : 'Call Ended');
    setCallState('ended');

    setTimeout(() => {
      onClose();
    }, 1200);
  }

  function toggleMute() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
    setIsMuted(!isMuted);
  }

  async function toggleSpeaker() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
    const nextSpeaker = !isSpeaker;
    setIsSpeaker(nextSpeaker);
    await configureCallAudioMode(nextSpeaker);

    // If currently playing outgoing ringback cadence, adapt volume & routing immediately
    if ((callState === 'initiating' || callState === 'ringing') && !isIncoming) {
      startOutgoingRingback(nextSpeaker);
    }
  }

  function formatTime(secs: number) {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  }

  if (!visible) return null;

  const isBike = vehicleType?.toLowerCase().includes('bike');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleEndOrDeclineCall}>
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.safeArea}>
          {/* Top Brand Header in App Light Theme */}
          <View style={styles.headerRow}>
            <View style={styles.brandPill}>
              <ShieldCheck size={14} color={Colors.primary[600]} strokeWidth={2.4} />
              <Text style={styles.brandPillText}>Lo Ride VoIP • 100% Number Masked</Text>
            </View>
          </View>

          {/* Ride Route Card */}
          {(originName || destinationName) && (
            <View style={styles.routeCard}>
              <View style={styles.routeVehicleBadge}>
                {isBike ? (
                  <Bike size={13} color={Colors.primary[700]} strokeWidth={2.2} />
                ) : (
                  <Car size={13} color={Colors.primary[700]} strokeWidth={2.2} />
                )}
                <Text style={styles.routeVehicleText}>
                  {isBike ? 'Bike Pool' : 'Car Pool'}
                </Text>
              </View>
              <View style={styles.routePlacesRow}>
                <Text style={styles.routePlaceText} numberOfLines={1}>
                  {originName?.split(',')[0]?.trim() || 'Pickup'}
                </Text>
                <ArrowRight size={13} color={Colors.neutral[400]} />
                <Text style={styles.routePlaceText} numberOfLines={1}>
                  {destinationName?.split(',')[0]?.trim() || 'Drop-off'}
                </Text>
              </View>
            </View>
          )}

          {/* Caller / Receiver Hero Center */}
          <View style={styles.heroCenter}>
            <View style={styles.avatarContainer}>
              {(callState === 'ringing' || callState === 'initiating') && (
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      transform: [{ scale: pulseAnim }],
                      opacity: pulseOpacity,
                    },
                  ]}
                />
              )}
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {otherPartyName?.charAt(0)?.toUpperCase() || (otherPartyRole === 'Driver' ? 'D' : 'P')}
                </Text>
              </View>
            </View>

            <Text style={styles.personName} numberOfLines={1}>
              {otherPartyName}
            </Text>

            <View style={styles.roleBadgeRow}>
              <CheckCircle2 size={14} color={Colors.primary[600]} strokeWidth={2.2} />
              <Text style={styles.roleBadgeText}>
                {otherPartyRole === 'Driver' ? 'Verified Driver (Captain)' : 'Verified Co-Rider Passenger'}
              </Text>
            </View>

            {/* Status & Live Timer */}
            <View style={styles.statusBox}>
              {callState === 'initiating' && (
                <View style={styles.statusRow}>
                  <Radio size={16} color={Colors.primary[600]} />
                  <Text style={styles.statusText}>Connecting secure line...</Text>
                </View>
              )}
              {callState === 'ringing' && (
                <View style={styles.statusRow}>
                  <Radio size={16} color={isIncoming ? Colors.primary[600] : '#16a34a'} />
                  <Text style={[styles.statusRingingText, isIncoming && { color: Colors.primary[700] }]}>
                    {isIncoming ? 'Incoming in-app audio call...' : 'Ringing...'}
                  </Text>
                </View>
              )}
              {callState === 'connected' && (
                <View style={styles.connectedBox}>
                  <Text style={styles.durationTimer}>{formatTime(callDuration)}</Text>
                  {/* Dynamic Frequency Waveform */}
                  <View style={styles.waveContainer}>
                    <Animated.View style={[styles.waveBar, { transform: [{ scaleY: isMuted ? 0.1 : wave1 }] }]} />
                    <Animated.View style={[styles.waveBar, { transform: [{ scaleY: isMuted ? 0.1 : wave2 }] }]} />
                    <Animated.View style={[styles.waveBar, { transform: [{ scaleY: isMuted ? 0.1 : wave3 }] }]} />
                    <Animated.View style={[styles.waveBar, { transform: [{ scaleY: isMuted ? 0.1 : wave4 }] }]} />
                    <Animated.View style={[styles.waveBar, { transform: [{ scaleY: isMuted ? 0.1 : wave5 }] }]} />
                  </View>
                  <View style={styles.voiceQualityPill}>
                    <View style={[styles.voiceQualityDot, voiceState === 'connected' && styles.voiceQualityDotActive]} />
                    <Text style={styles.voiceQualityText}>
                      {voiceState === 'connected' ? 'HD Voice Live' : 'Connecting Audio Stream...'}
                    </Text>
                  </View>
                  {isMuted && (
                    <Text style={styles.mutedNotice}>Microphone Muted</Text>
                  )}
                </View>
              )}
              {callState === 'ended' && (
                <Text style={styles.endedText}>{endReason || 'Call Ended'}</Text>
              )}
            </View>

            {/* Microphone Permission Prompt Card */}
            {hasMicPermission === false && (
              <TouchableOpacity
                style={styles.micAlertCard}
                onPress={checkAndRequestPermissions}
                activeOpacity={0.8}
              >
                <AlertTriangle size={18} color="#d97706" strokeWidth={2.4} />
                <View style={styles.micAlertTextWrap}>
                  <Text style={styles.micAlertTitle}>Microphone Permission Needed</Text>
                  <Text style={styles.micAlertSub}>
                    Tap here to allow microphone access so you can speak.
                  </Text>
                </View>
                <View style={styles.micAlertBtn}>
                  <Text style={styles.micAlertBtnText}>Allow</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Action Buttons Footer */}
          <View style={styles.footerContainer}>
            {/* Live Controls: Mute & Speaker (Available while calling, ringing, and connected) */}
            {(callState === 'initiating' || callState === 'ringing' || callState === 'connected') && (
              <View style={styles.inCallControlsRow}>
                {/* Mute Button */}
                <View style={styles.controlItemWrap}>
                  <TouchableOpacity
                    style={[styles.controlBtn, isMuted && styles.controlBtnMuted]}
                    onPress={toggleMute}
                    activeOpacity={0.8}
                  >
                    {isMuted ? (
                      <MicOff size={26} color="#dc2626" strokeWidth={2.2} />
                    ) : (
                      <Mic size={26} color={Colors.neutral[700]} strokeWidth={2.2} />
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.controlBtnLabel, isMuted && { color: '#dc2626' }]}>
                    {isMuted ? 'Muted' : 'Mute'}
                  </Text>
                </View>

                {/* Speaker Toggle Button */}
                <View style={styles.controlItemWrap}>
                  <TouchableOpacity
                    style={[styles.controlBtn, isSpeaker && styles.controlBtnSpeakerOn]}
                    onPress={toggleSpeaker}
                    activeOpacity={0.8}
                  >
                    {isSpeaker ? (
                      <Volume2 size={26} color={Colors.primary[600]} strokeWidth={2.2} />
                    ) : (
                      <Volume1 size={26} color={Colors.neutral[700]} strokeWidth={2.2} />
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.controlBtnLabel, isSpeaker && { color: Colors.primary[700] }]}>
                    {isSpeaker ? 'Speaker On' : 'Speaker Off'}
                  </Text>
                </View>
              </View>
            )}

            {/* Bottom Call Management Actions */}
            <View style={styles.callActionsRow}>
              {isIncoming && callState === 'ringing' ? (
                <>
                  {/* Decline Red Button */}
                  <View style={styles.actionBtnWrap}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.declineBtn]}
                      onPress={handleEndOrDeclineCall}
                      activeOpacity={0.85}
                    >
                      <PhoneOff size={28} color="#ffffff" strokeWidth={2.4} />
                    </TouchableOpacity>
                    <Text style={styles.actionBtnText}>Decline</Text>
                  </View>

                  {/* Accept Green Button */}
                  <View style={styles.actionBtnWrap}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={handleAcceptCall}
                      activeOpacity={0.85}
                    >
                      <PhoneCall size={28} color="#ffffff" strokeWidth={2.4} />
                    </TouchableOpacity>
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </View>
                </>
              ) : (
                /* End Call Red Button */
                <View style={styles.actionBtnWrap}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.declineBtn]}
                    onPress={handleEndOrDeclineCall}
                    activeOpacity={0.85}
                    disabled={callState === 'ended'}
                  >
                    <PhoneOff size={28} color="#ffffff" strokeWidth={2.4} />
                  </TouchableOpacity>
                  <Text style={styles.actionBtnText}>End Call</Text>
                </View>
              )}
            </View>

            {/* Privacy note */}
            <Text style={styles.privacyNote}>
              In-app VoIP is 100% encrypted & auto-closes when the ride completes.
            </Text>
          </View>

          {/* Active Bidirectional WebRTC Voice Audio Stream */}
          {currentCall && callState === 'connected' && (
            <WebRTCVoiceBridge
              rideId={rideId}
              callId={currentCall.id}
              isCaller={!isIncoming}
              isMuted={isMuted}
              isSpeaker={isSpeaker}
              onConnectionChange={(status) => {
                setVoiceState(status);
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#f8fafc', // Lo Ride signature clean light theme
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'android' ? 32 : Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    ...Shadow.sm,
  },
  brandPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: Colors.primary[700],
    letterSpacing: 0.2,
  },
  routeCard: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.sm,
    gap: 6,
    ...Shadow.sm,
  },
  routeVehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  routeVehicleText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.primary[700],
  },
  routePlacesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routePlaceText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.neutral[800],
    flexShrink: 1,
  },
  heroCenter: {
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  avatarContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  pulseRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: '#ffffff',
    shadowColor: Colors.primary[600],
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  avatarInitials: {
    fontFamily: 'Inter-Bold',
    fontSize: 40,
    color: '#ffffff',
  },
  personName: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: Colors.neutral[900], // Crisp dark slate for light theme
    textAlign: 'center',
    marginBottom: 6,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginBottom: Spacing.lg,
  },
  roleBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.primary[800],
  },
  statusBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.neutral[500],
  },
  statusRingingText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#16a34a',
  },
  connectedBox: {
    alignItems: 'center',
    gap: 10,
  },
  durationTimer: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: Colors.primary[600],
    letterSpacing: 2,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
  },
  waveBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: Colors.primary[500],
  },
  mutedNotice: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#dc2626',
  },
  endedText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: '#dc2626',
  },
  micAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: Spacing.lg,
    maxWidth: 340,
    ...Shadow.sm,
  },
  micAlertTextWrap: {
    flex: 1,
  },
  micAlertTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#b45309',
  },
  micAlertSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#92400e',
    marginTop: 2,
  },
  micAlertBtn: {
    backgroundColor: '#d97706',
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  micAlertBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#ffffff',
  },
  footerContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingBottom: Platform.OS === 'android' ? Spacing.lg : Spacing.md,
  },
  inCallControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
    width: '100%',
  },
  controlItemWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 84,
    gap: 8,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    ...Shadow.md,
  },
  controlBtnMuted: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  controlBtnSpeakerOn: {
    backgroundColor: '#e0f2fe',
    borderColor: Colors.primary[500],
  },
  controlBtnLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.neutral[600],
    textAlign: 'center',
  },
  callActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 56,
    width: '100%',
  },
  actionBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 84,
    gap: 8,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  acceptBtn: {
    backgroundColor: '#16a34a', // Emerald green
  },
  declineBtn: {
    backgroundColor: '#dc2626', // Crimson red
  },
  actionBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: Colors.neutral[700],
    textAlign: 'center',
  },
  privacyNote: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[400],
    textAlign: 'center',
    marginTop: 4,
  },
  voiceQualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginTop: 8,
  },
  voiceQualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  voiceQualityDotActive: {
    backgroundColor: '#16a34a',
  },
  voiceQualityText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#15803d',
  },
});
