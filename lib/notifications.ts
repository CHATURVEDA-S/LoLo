import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Constants from 'expo-constants';
import { api } from './api';

type NotificationsType = typeof import('expo-notifications');

// In Expo SDK 53+, remote push notification functionality was removed from the Android Expo Go app.
// Statically importing expo-notifications evaluates DevicePushTokenAutoRegistration.fx which throws
// a fatal error in Expo Go on Android.
// We dynamically require expo-notifications only when supported (iOS, development/standalone builds, etc.)
// so Expo Go runs smoothly without crashing.
const isAndroidExpoGo = Platform.OS === 'android' && isRunningInExpoGo();

let Notifications: NotificationsType | null = null;

if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true, // Play device default system sound
          shouldSetBadge: true,
        }),
      });
    }
  } catch (err) {
    console.warn('Could not initialize expo-notifications:', err);
  }
}

// Configure device audio mode for in-app voice call session (earpiece vs speaker)
export async function configureCallAudioMode(isSpeaker: boolean = false) {
  if (Platform.OS === 'web') return;
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: !isSpeaker,
    });
  } catch (err) {
    console.warn('Could not configure call audio mode:', err);
  }
}

// Reset audio mode back to default after call ends
export async function resetCallAudioMode() {
  if (Platform.OS === 'web') return;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch (err) {
    console.warn('Could not reset call audio mode:', err);
  }
}

// Synthesize pleasant two-tone audio chime for Web browser
function playWebChime() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // First tone (520Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(520, ctx.currentTime);
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.25);

    // Second tone (780Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(780, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// Setup Android notification channels & request permissions for mobile status bar alerts
export async function initNotifications() {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    // Request permission from the mobile OS so notifications show in the device notification bar
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus !== 'granted') {
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
    }

    // Configure Android channels for high-priority notification bar delivery with device default sound
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Lo Ride Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0284c7',
        sound: 'default', // Device default notification sound
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Lo Ride In-App Calls',
        importance: Notifications.AndroidImportance.MAX, // MAX importance pops heads-up banner in notification bar
        vibrationPattern: [0, 500, 300, 500, 300, 500],
        lightColor: '#16a34a',
        sound: 'default', // Device default system ringtone/notification sound
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }
  } catch (e) {
    console.warn('Could not initialize mobile notification bar channels:', e);
  }
}

// Request permissions and register push token with backend
export async function registerPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || isAndroidExpoGo || !Notifications) {
    if (isAndroidExpoGo) {
      console.log('Push notifications are not supported in Expo Go on Android (SDK 53+). Use a development build for remote push.');
    }
    return null;
  }

  try {
    await initNotifications();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Mobile notification permission not granted by user');
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenRes?.data;

    if (token) {
      await api.registerPushToken(token);
    }
    return token;
  } catch (err) {
    // In Expo Go without EAS project ID or on simulator, remote push registration may be unavailable.
    // Local notifications, sound chimes, and haptics continue to function normally.
    console.log('Remote push registration note:', err);
    return null;
  }
}

const CHIME_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
let mobileAudioPlayer: any = null;

async function playMobileChime() {
  try {
    if (!mobileAudioPlayer) {
      mobileAudioPlayer = createAudioPlayer({ uri: CHIME_AUDIO_URL });
    }
    await mobileAudioPlayer.seekTo(0);
    mobileAudioPlayer.play();
  } catch (err) {
    try {
      mobileAudioPlayer = createAudioPlayer({ uri: CHIME_AUDIO_URL });
      mobileAudioPlayer.play();
    } catch (_) {}
  }
}

// Trigger immediate Sound Alert, Haptic Buzz, and Notification Banner across Web & Mobile
export async function triggerNotificationSoundAlert(
  title?: string,
  body?: string,
  data?: Record<string, unknown>
) {
  // 1. Tactile haptic buzz on mobile device
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (_) {}

  // 2. Play audible chime across both Web & Mobile
  if (Platform.OS === 'web') {
    playWebChime();
  } else {
    playMobileChime().catch(() => {});
  }

  // 3. Dispatch native notification directly into mobile status/notification bar with device default sound
  if (Notifications && title) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: body || '',
          sound: 'default', // Device system default sound
          data: data || {},
        },
        trigger: {
          channelId: 'default', // Route into Android notification bar
        } as any,
      });
    } catch (err) {
      console.log('Mobile notification bar dispatch note:', err);
    }
  }
}
// User's custom caller tune sound placed in assets/images/
const CALLER_TUNE_ASSET = require('../assets/images/dragon-studio-phone-ringing-382734.mp3');

let callSoundInterval: any = null;
let webCallAudioCtx: any = null;
let webCallAudioElement: any = null;
let callerTunePlayer: any = null;
let activeCallNotificationId: string | null = null;

// Clean up all ringing sounds, intervals, caller tune, and dismiss notification bar banner
export function stopAllCallSounds() {
  if (callSoundInterval) {
    clearInterval(callSoundInterval);
    callSoundInterval = null;
  }
  if (callerTunePlayer) {
    try {
      callerTunePlayer.pause();
    } catch (_) {}
  }
  if (webCallAudioCtx) {
    try {
      webCallAudioCtx.close();
    } catch (_) {}
    webCallAudioCtx = null;
  }
  if (webCallAudioElement) {
    try {
      webCallAudioElement.pause();
      webCallAudioElement.currentTime = 0;
    } catch (_) {}
    webCallAudioElement = null;
  }
  if (activeCallNotificationId && Notifications) {
    try {
      Notifications.dismissNotificationAsync(activeCallNotificationId).catch(() => {});
    } catch (_) {}
    activeCallNotificationId = null;
  }
}

export const stopRingtone = stopAllCallSounds;

// 1. CALLER (OUTGOING CALL): Plays the user's caller tune sound while waiting for receiver to pick up
export function startOutgoingRingback(isSpeaker: boolean = false) {
  stopAllCallSounds();

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio(CALLER_TUNE_ASSET);
      audio.volume = isSpeaker ? 0.9 : 0.35;
      audio.loop = true;
      audio.play().catch(() => {});
      webCallAudioElement = audio;
    } catch (_) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          webCallAudioCtx = new AudioCtx();
          const playRingbackCadence = () => {
            if (!webCallAudioCtx || webCallAudioCtx.state === 'closed') return;
            try {
              const now = webCallAudioCtx.currentTime;
              [440, 480].forEach((freq) => {
                const osc = webCallAudioCtx.createOscillator();
                const gain = webCallAudioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(isSpeaker ? 0.08 : 0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
                osc.connect(gain);
                gain.connect(webCallAudioCtx.destination);
                osc.start(now);
                osc.stop(now + 1.8);
              });
            } catch (_) {}
          };
          playRingbackCadence();
          callSoundInterval = setInterval(playRingbackCadence, 4000);
        }
      } catch (_) {}
    }
  } else {
    // Native Mobile: route to earpiece or loudspeaker based on speaker toggle
    configureCallAudioMode(isSpeaker);

    try {
      if (!callerTunePlayer) {
        callerTunePlayer = createAudioPlayer(CALLER_TUNE_ASSET);
      }
      callerTunePlayer.loop = true;
      callerTunePlayer.seekTo(0);
      callerTunePlayer.play();
    } catch (_) {
      try {
        callerTunePlayer = createAudioPlayer(CALLER_TUNE_ASSET);
        callerTunePlayer.play();
      } catch (_) {}
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    callSoundInterval = setInterval(() => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (callerTunePlayer) {
          callerTunePlayer.play();
        }
      } catch (_) {}
    }, 8000);
  }
}

// 2. RECEIVER (INCOMING CALL): System default ringer / notification
export function startIncomingRingtone() {
  stopAllCallSounds();

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    // Pleasant melodic electronic chime for Web browser
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        webCallAudioCtx = new AudioCtx();

        const playMelodicRing = () => {
          if (!webCallAudioCtx || webCallAudioCtx.state === 'closed') return;
          try {
            const now = webCallAudioCtx.currentTime;
            const notes = [659, 831, 988, 1319, 988, 1319];
            notes.forEach((freq, idx) => {
              const osc = webCallAudioCtx.createOscillator();
              const gain = webCallAudioCtx.createGain();
              const noteStart = now + idx * 0.16;

              osc.type = 'triangle';
              osc.frequency.setValueAtTime(freq, noteStart);
              gain.gain.setValueAtTime(0.18, noteStart);
              gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.22);

              osc.connect(gain);
              gain.connect(webCallAudioCtx.destination);
              osc.start(noteStart);
              osc.stop(noteStart + 0.22);
            });
          } catch (_) {}
        };

        playMelodicRing();
        callSoundInterval = setInterval(playMelodicRing, 2600);
      }
    } catch (_) {}
  } else {
    // Native Mobile: Repeating tactile haptic buzz while system default ringtone alerts
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (_) {}

    callSoundInterval = setInterval(() => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (_) {}
    }, 2000);
  }
}

export const startRingtone = startIncomingRingtone;

// Trigger incoming call alert directly in the mobile notification bar with device system default sound
export async function triggerIncomingCallPush(callerName: string, rideId: string, callId: string) {
  startIncomingRingtone();

  if (Notifications) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `📞 Incoming Call from ${callerName}`,
          body: 'Lo Ride In-App Audio Call • Tap to Answer',
          sound: 'default', // Device native system default sound
          vibrate: [0, 600, 400, 600, 400, 600],
          categoryIdentifier: 'call',
          data: { type: 'incoming_call', ride_id: rideId, call_id: callId },
        },
        trigger: {
          channelId: 'calls', // MAX priority channel with device default sound in Android notification bar
        } as any,
      });
      activeCallNotificationId = id;
    } catch (err) {
      console.log('Incoming call notification bar error:', err);
    }
  }
}

