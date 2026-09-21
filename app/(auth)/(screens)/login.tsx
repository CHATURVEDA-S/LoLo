import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  UIManager,
  TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Location from 'expo-location';
import { Check, ShieldCheck, User, MapPin, Crosshair } from 'lucide-react-native';
import { useAuth } from '@/lib/auth-context';
import { Colors, Radius, FontSizes } from '@/lib/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppLogo from '@/components/AppLogo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Precise vector line-art thumbs-up hand matching the reference image
function ThumbsUpGraphic({ size = 110, color = '#bfbcb2' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* Main hand contour */}
      <Path
        d="M38 60 C 38 48, 44 32, 50 20 C 53 15, 58 13, 62 16 C 66 19, 66 26, 62 35 L 58 46 L 78 46 C 87 46, 92 51, 91 58 L 87 76 C 85 83, 79 88, 71 88 L 38 88 C 32 88, 28 84, 28 78 L 28 70 C 28 64, 32 60, 38 60 Z"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Wrist crease */}
      <Path
        d="M28 74 C 21 74, 17 69, 17 63 C 17 57, 21 52, 28 52"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* Knuckle folds */}
      <Path
        d="M58 57 C 66 57, 75 57, 79 57"
        stroke={color}
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <Path
        d="M57 67 C 65 67, 73 67, 77 67"
        stroke={color}
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <Path
        d="M56 77 C 63 77, 70 77, 74 77"
        stroke={color}
        strokeWidth="3.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Illustrated avatar with scalloped blue verified checkmark badge matching right screen
function VerifiedUserAvatar({ size = 76 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, position: 'relative', marginBottom: 14 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#fed7aa', // soft warm peach circle
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
          {/* Head & Neck */}
          <Circle cx="40" cy="33" r="13" fill="#fcd34d" />
          {/* Dark Hair */}
          <Path
            d="M27 28 C 27 18, 33 14, 40 14 C 47 14, 53 18, 53 28 C 49 24, 45 26, 40 26 C 35 26, 31 24, 27 28 Z"
            fill="#1e293b"
          />
          {/* Shoulders / Shirt */}
          <Path
            d="M20 72 C 20 52, 28 48, 40 48 C 52 48, 60 52, 60 72 Z"
            fill="#f43f5e"
          />
          {/* White V-Neck Collar */}
          <Path d="M36 48 L 40 56 L 44 48 Z" fill="#ffffff" />
        </Svg>
      </View>

      {/* Scalloped verified check badge at top-right */}
      <View
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: Colors.primary[600],
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: '#ffffff',
        }}
      >
        <Check size={12} color="#ffffff" strokeWidth={3.5} />
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [step, setStep] = useState<'otp' | 'profile'>('otp');

  // New user registration
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [resendTimer, setResendTimer] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const timerRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const { sendOtp, verifyOtp, completeOtpRegistration } = useAuth();
  const insets = useSafeAreaInsets();

  // Keyboard show/hide listeners with smooth animated transition
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsKeyboardVisible(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (showOtpModal && step === 'otp') {
      setResendTimer(30);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showOtpModal, step]);

  const cleanDigits = phone.replace(/[^0-9]/g, '');
  const isValidPhone = cleanDigits.length === 10;

  // Build the inline ghost placeholder:
  // e.g. cleanDigits is "9876" -> displays "9876" + "0 00000" in light grey
  const firstHalfEntered = cleanDigits.slice(0, 5);
  const secondHalfEntered = cleanDigits.slice(5, 10);

  const firstHalfGhost = '00000'.slice(firstHalfEntered.length);
  const secondHalfGhost = '00000'.slice(secondHalfEntered.length);

  // Send OTP via 2Factor Gateway
  async function handleSendOtp(customPhone?: string) {
    const targetPhone = customPhone || cleanDigits;
    setError(null);

    if (targetPhone.length !== 10) {
      setError('Please enter a 10-digit mobile number');
      return;
    }

    setLoading(true);
    const res = await sendOtp(targetPhone);
    setLoading(false);

    if (res.error || !res.session_id) {
      setError(res.error || 'Could not send OTP. Please try again.');
      return;
    }

    setSessionId(res.session_id);
    setStep('otp');
    setOtp('');
    setShowOtpModal(true);
    setTimeout(() => {
      otpInputRef.current?.focus();
    }, 350);
  }

  // Verify OTP
  async function handleVerifyOtp(codeToVerify?: string) {
    if (loading) return;
    const code = codeToVerify || otp;
    setError(null);

    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    const res = await verifyOtp(cleanDigits, sessionId, code);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid code. Please try again.');
      setOtp('');
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
      return;
    }

    if (res.is_new_user) {
      setStep('profile');
      return;
    }

    setShowOtpModal(false);
    router.replace('/(tabs)/home');
  }

  // Complete profile for new user
  async function handleCompleteProfile() {
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    const selectedCity = city.trim() || 'Hyderabad';

    setLoading(true);
    const res = await completeOtpRegistration(cleanDigits, sessionId, fullName.trim(), selectedCity);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to complete profile. Please try again.');
      return;
    }

    setShowOtpModal(false);
    router.replace('/(tabs)/home');
  }

  // Auto-detect GPS city
  async function handleAutoDetectCity() {
    setDetectingLocation(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. Please enter city manually.');
        setDetectingLocation(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo) {
        const detected = geo.city || geo.subregion || geo.district || 'Hyderabad';
        setCity(detected);
      }
    } catch {
      setError('Could not detect location. Please type your city.');
    } finally {
      setDetectingLocation(false);
    }
  }

  function fillDemoReviewer() {
    setPhone('9999999999');
    setError(null);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            isKeyboardVisible && styles.scrollContentKeyboard,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ================================================================= */}
          {/* TOP SECTION: Lo Ride Logo + Thumbs-Up Illustration               */}
          {/* ================================================================= */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={[styles.topSection, isKeyboardVisible && styles.topSectionKeyboard]}>
              {/* Hand-drawn Thumbs Up Graphic on top - smoothly scales to compact size when keyboard opens */}
              <View style={[styles.illustrationWrapper, isKeyboardVisible && styles.illustrationWrapperKeyboard]}>
                <ThumbsUpGraphic size={isKeyboardVisible ? 54 : 180} color="#b5b2a6" />
              </View>

              {/* Lo Ride Brand Logo positioned cleanly below the thumb */}
              <View style={[styles.brandLogoHeader, isKeyboardVisible && styles.brandLogoHeaderKeyboard]}>
                <AppLogo height={isKeyboardVisible ? 42 : 68} />
              </View>

              <Text style={[styles.headlineTitle, isKeyboardVisible && styles.headlineTitleKeyboard]}>
                {isKeyboardVisible ? 'Boom shakalak! Let’s get started.' : `Boom shakalak! Let’s\nget started.`}
              </Text>
              {!isKeyboardVisible && (
                <Text style={styles.headlineSubtitle}>
                  Share & book intra-city rides effortlessly!
                </Text>
              )}
            </View>
          </TouchableWithoutFeedback>

          {/* ================================================================= */}
          {/* MIDDLE SECTION: Minimalist Inline +91 | 00000 00000 Input         */}
          {/* ================================================================= */}
          <View style={[styles.middleInputSection, isKeyboardVisible && styles.middleInputSectionKeyboard]}>
            <View style={styles.inlinePhoneRow}>
              <Text style={styles.countryCodePrefix}>+91</Text>
              <View style={styles.blueCursorDivider} />

              <TextInput
                ref={phoneInputRef}
                style={styles.realPhoneInput}
                value={
                  cleanDigits.length > 5
                    ? `${cleanDigits.slice(0, 5)} ${cleanDigits.slice(5)}`
                    : cleanDigits
                }
                onChangeText={(val) => {
                  const num = val.replace(/[^0-9]/g, '').slice(0, 10);
                  setPhone(num);
                  if (error) setError(null);
                }}
                placeholder="00000 00000"
                placeholderTextColor="#d6d3d1"
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (isValidPhone) handleSendOtp();
                }}
                maxLength={11}
                autoFocus
              />
            </View>

            {/* Error Message */}
            {error && !showOtpModal && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{error}</Text>
              </View>
            )}
          </View>

          {/* ================================================================= */}
          {/* BOTTOM SECTION: Full-width "Get Otp" Button in Lo Ride Blue       */}
          {/* ================================================================= */}
          <View
            style={[
              styles.bottomButtonSection,
              isKeyboardVisible && styles.bottomButtonSectionKeyboard,
              { paddingBottom: isKeyboardVisible ? 16 : Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.getOtpButton,
                (!isValidPhone || loading) && styles.getOtpButtonDisabled,
              ]}
              onPress={() => handleSendOtp()}
              disabled={!isValidPhone || loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.getOtpButtonText}>Get Otp</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===================================================================== */}
      {/* VERIFICATION MODAL POPUP (Matching Right Screen in Reference Design) */}
      {/* ===================================================================== */}
      <Modal
        visible={showOtpModal}
        transparent
        animationType="fade"
        onShow={() => {
          setTimeout(() => {
            otpInputRef.current?.focus();
          }, 100);
        }}
        onRequestClose={() => {
          if (!loading) setShowOtpModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalCardWrapper}
          >
            <View style={styles.floatingCard}>
              {step === 'otp' ? (
                <>
                  {/* Verified Avatar Header */}
                  <VerifiedUserAvatar size={76} />

                  {/* Title & Subtitle */}
                  <Text style={styles.cardHeaderTitle}>Verify your account</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Enter 6 digits verification code we{'\n'}have sent to{' '}
                    <Text style={styles.highlightPhone}>+91 {cleanDigits}</Text>
                  </Text>

                  {/* 6 Digit Input Boxes */}
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => otpInputRef.current?.focus()}
                    style={styles.digitBoxesContainer}
                  >
                    {/* Visual 6 Boxes (Underneath) */}
                    <View style={styles.boxesRow} pointerEvents="none">
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const digit = otp[index] || '';
                        const isCurrent = otp.length === index;
                        const isFilled = digit.length > 0;
                        return (
                          <View
                            key={index}
                            style={[
                              styles.singleBox,
                              isFilled && styles.singleBoxFilled,
                              isCurrent && styles.singleBoxActive,
                            ]}
                          >
                            <Text style={styles.boxText}>{digit}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Real Full-Sized Transparent Interactive TextInput Directly on Top */}
                    <TextInput
                      ref={otpInputRef}
                      style={styles.otpFullOverlayInput}
                      value={otp}
                      onChangeText={(val) => {
                        let num = val.replace(/[^0-9]/g, '');
                        if (num.length > 6) {
                          num = num.slice(-6);
                        }
                        setOtp(num);
                        if (error) setError(null);
                        if (num.length === 6) {
                          handleVerifyOtp(num);
                        }
                      }}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      importantForAutofill="yes"
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (otp.length === 6) {
                          handleVerifyOtp(otp);
                        }
                      }}
                      maxLength={8}
                      autoFocus
                      caretHidden
                      cursorColor="transparent"
                      selectionColor="transparent"
                      contextMenuHidden={false}
                      selectTextOnFocus={false}
                    />
                  </TouchableOpacity>

                  {/* Demo OTP fill for Play Store Reviewer */}
                  {cleanDigits === '9999999999' && (
                    <TouchableOpacity
                      style={styles.reviewerDemoBanner}
                      onPress={() => {
                        setOtp('123456');
                        handleVerifyOtp('123456');
                      }}
                    >
                      <Text style={styles.reviewerDemoText}>
                        Reviewer OTP: <Text style={{ fontFamily: 'Inter-Bold' }}>123456</Text> (Tap to fill)
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Error inside modal */}
                  {error && (
                    <View style={styles.modalErrorContainer}>
                      <Text style={styles.modalErrorText}>{error}</Text>
                    </View>
                  )}

                  {/* Solid Verify Button (Lo Ride Brand Blue) */}
                  <TouchableOpacity
                    style={[
                      styles.verifyButton,
                      (otp.length !== 6 || loading) && styles.verifyButtonDisabled,
                    ]}
                    onPress={() => handleVerifyOtp()}
                    disabled={otp.length !== 6 || loading}
                    activeOpacity={0.88}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Verify</Text>
                    )}
                  </TouchableOpacity>

                  {/* Resend OTP Link */}
                  <View style={styles.resendContainer}>
                    {resendTimer > 0 ? (
                      <Text style={styles.resendDisabledText}>
                        Resend OTP in {resendTimer}s
                      </Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleSendOtp()}
                        disabled={loading}
                        style={styles.resendTouchable}
                      >
                        <Text style={styles.resendActiveText}>Resend OTP</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                /* NEW USER QUICK PROFILE FINISH */
                <>
                  <View style={styles.welcomeEmojiWrapper}>
                    <Text style={{ fontSize: 36 }}>🎉</Text>
                  </View>

                  <Text style={styles.cardHeaderTitle}>Welcome to Lo Ride!</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Enter your name and metro city to complete setup:
                  </Text>

                  {/* Full Name */}
                  <View style={styles.modalFieldGroup}>
                    <Text style={styles.modalFieldLabel}>Full Name</Text>
                    <View style={styles.modalFieldInputWrap}>
                      <User size={18} color={Colors.neutral[400]} />
                      <TextInput
                        style={styles.fieldTextInput}
                        placeholder="e.g. Rahul Sharma"
                        placeholderTextColor={Colors.neutral[400]}
                        value={fullName}
                        onChangeText={(val) => {
                          setFullName(val);
                          if (error) setError(null);
                        }}
                        autoCapitalize="words"
                        autoFocus
                      />
                    </View>
                  </View>

                  {/* Metro City */}
                  <View style={styles.modalFieldGroup}>
                    <View style={styles.labelWithRightAction}>
                      <Text style={styles.modalFieldLabel}>Metro City</Text>
                      <TouchableOpacity
                        onPress={handleAutoDetectCity}
                        style={styles.autoDetectBtn}
                        disabled={detectingLocation}
                      >
                        {detectingLocation ? (
                          <ActivityIndicator size="small" color={Colors.primary[600]} />
                        ) : (
                          <>
                            <Crosshair size={12} color={Colors.primary[600]} />
                            <Text style={styles.autoDetectText}>Auto-detect GPS</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.modalFieldInputWrap}>
                      <MapPin size={18} color={Colors.neutral[400]} />
                      <TextInput
                        style={styles.fieldTextInput}
                        placeholder="Hyderabad / Bengaluru / Delhi"
                        placeholderTextColor={Colors.neutral[400]}
                        value={city}
                        onChangeText={(val) => {
                          setCity(val);
                          if (error) setError(null);
                        }}
                      />
                    </View>
                  </View>

                  {error && (
                    <View style={styles.modalErrorContainer}>
                      <Text style={styles.modalErrorText}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.verifyButton,
                      (!fullName.trim() || loading) && styles.verifyButtonDisabled,
                    ]}
                    onPress={handleCompleteProfile}
                    disabled={!fullName.trim() || loading}
                    activeOpacity={0.88}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Finish & Start Riding</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f4ed', // Exact warm light ivory/cream background from reference
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  scrollContentKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: 6,
  },

  /* ========================================================================= */
  /* Top Section                                                               */
  /* ========================================================================= */
  topSection: {
    alignItems: 'center',
    paddingTop: 10,
  },
  topSectionKeyboard: {
    paddingTop: 4,
    marginBottom: 4,
  },
  illustrationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  illustrationWrapperKeyboard: {
    marginTop: 0,
    marginBottom: 4,
  },
  brandLogoHeader: {
    marginBottom: 10,
    alignItems: 'center',
  },
  brandLogoHeaderKeyboard: {
    marginBottom: 4,
  },
  headlineTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 25,
    lineHeight: 32,
    color: '#1a1917',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  headlineTitleKeyboard: {
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 2,
  },
  headlineSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#78716c',
    textAlign: 'center',
    maxWidth: 270,
    lineHeight: 19,
  },

  /* ========================================================================= */
  /* Middle Input Section: +91 | 00000 00000                                   */
  /* ========================================================================= */
  middleInputSection: {
    alignItems: 'center',
    marginVertical: 18,
    width: '100%',
  },
  middleInputSectionKeyboard: {
    marginVertical: 10,
  },
  inlinePhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  countryCodePrefix: {
    fontFamily: 'Inter-Bold',
    fontSize: 27,
    color: '#1a1917',
    marginRight: 6,
  },
  blueCursorDivider: {
    width: 2,
    height: 30,
    backgroundColor: Colors.primary[600], // Lo Ride Electric Blue
    marginRight: 10,
    borderRadius: 1,
  },
  realPhoneInput: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 27,
    color: '#1a1917',
    letterSpacing: 1,
    minWidth: 195,
    padding: 0,
    margin: 0,
  },
  numberGhostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 175,
  },
  digitEnteredText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 27,
    color: '#1a1917',
    letterSpacing: 0.5,
  },
  spaceSeparatorText: {
    fontSize: 27,
    letterSpacing: 2,
  },
  digitGhostText: {
    fontFamily: 'Inter-Regular',
    fontSize: 27,
    color: '#d6d3d1', // soft ghost grey placeholder
    letterSpacing: 0.5,
  },
  inlineErrorBox: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: Radius.md,
  },
  inlineErrorText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
  },
  demoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  demoPillText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.primary[800],
  },

  /* ========================================================================= */
  /* Bottom Section: Full Width Get Otp Button                                 */
  /* ========================================================================= */
  bottomButtonSection: {
    width: '100%',
  },
  bottomButtonSectionKeyboard: {
    marginTop: 6,
  },
  getOtpButton: {
    backgroundColor: Colors.primary[600], // Lo Ride Brand Blue
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  getOtpButtonDisabled: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
    elevation: 0,
  },
  getOtpButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#ffffff',
  },

  /* ========================================================================= */
  /* Verification Modal Card (Right Screen in Reference)                       */
  /* ========================================================================= */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(35, 35, 35, 0.72)', // dark dimmed backdrop from reference
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  modalCardWrapper: {
    width: '100%',
    maxWidth: 370,
  },
  floatingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 14,
  },
  cardHeaderTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 19,
    color: '#18181b',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  cardHeaderSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  highlightPhone: {
    fontFamily: 'Inter-Bold',
    color: '#18181b',
  },

  /* Digit Boxes (Side-by-Side) */
  digitBoxesContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
    position: 'relative',
    height: 52,
    justifyContent: 'center',
  },
  otpFullOverlayInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: 52,
    opacity: 0,
    zIndex: 10,
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
  },
  singleBox: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e4e4e7',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleBoxFilled: {
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d8',
  },
  singleBoxActive: {
    borderColor: Colors.primary[600], // Brand Blue focus highlight
    borderWidth: 2,
    backgroundColor: '#ffffff',
  },
  boxText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    color: '#18181b',
  },

  reviewerDemoBanner: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    marginTop: 8,
    marginBottom: 6,
  },
  reviewerDemoText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.primary[700],
  },
  modalErrorContainer: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 8,
    width: '100%',
  },
  modalErrorText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
  },

  /* Solid Verify Button */
  verifyButton: {
    width: '100%',
    backgroundColor: Colors.primary[600], // Lo Ride Brand Blue
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  verifyButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  verifyButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#ffffff',
  },

  /* Resend Link */
  resendContainer: {
    marginTop: 14,
    alignItems: 'center',
  },
  resendDisabledText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#a1a1aa',
  },
  resendTouchable: {
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  resendActiveText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#71717a',
    textDecorationLine: 'underline',
  },

  /* New User Profile Finish */
  welcomeEmojiWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalFieldGroup: {
    width: '100%',
    marginBottom: 12,
  },
  labelWithRightAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  modalFieldLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#475569',
    marginBottom: 5,
  },
  autoDetectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  autoDetectText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.primary[600],
  },
  modalFieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  fieldTextInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#0f172a',
  },
});
