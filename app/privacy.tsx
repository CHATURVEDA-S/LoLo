import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ShieldCheck, MapPin, Mic, Lock, Mail, Users, FileCheck } from 'lucide-react-native';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={Colors.neutral[800]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <LinearGradient
          colors={['#0284c7', '#38bdf8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <ShieldCheck size={16} color="#ffffff" />
            <Text style={styles.heroBadgeText}>Verified Safety & Privacy</Text>
          </View>
          <Text style={styles.heroTitle}>Lo Ride Privacy Policy</Text>
          <Text style={styles.heroSubtitle}>
            Application: com.loloride.app • Effective: Sept 20, 2026
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={styles.introText}>
            Lo Ride Technologies ("we", "our", or "us") is dedicated to protecting your privacy.
            This policy outlines how your information is collected, used, and safeguarded when using
            our intra-city ride-sharing platform.
          </Text>

          {/* Section 1: Location */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#e0f2fe' }]}>
                <MapPin size={20} color="#0284c7" />
              </View>
              <Text style={styles.sectionTitle}>1. Location Data</Text>
            </View>
            <Text style={styles.sectionBody}>
              We collect precise and approximate GPS location data while using the app or during active rides to:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• Match you with nearby drivers or passengers.</Text>
              <Text style={styles.bulletItem}>• Calculate pickup ETA, route navigation, and shared fares.</Text>
              <Text style={styles.bulletItem}>• Provide live tracking for passenger safety during an ongoing trip.</Text>
            </View>
            <Text style={styles.sectionNote}>
              Location tracking is disabled once a trip completes. You can control location permissions anytime in your device settings.
            </Text>
          </View>

          {/* Section 2: Audio & Calls */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#ecfdf5' }]}>
                <Mic size={20} color="#059669" />
              </View>
              <Text style={styles.sectionTitle}>2. Audio & VoIP Calls</Text>
            </View>
            <Text style={styles.sectionBody}>
              Lo Ride provides in-app voice calling so drivers and riders can coordinate pickups securely without exposing personal phone numbers.
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• Audio is streamed peer-to-peer using encrypted WebRTC.</Text>
              <Text style={styles.bulletItem}>• <Text style={{ fontFamily: 'Inter-Bold' }}>We NEVER record, store, or monitor your calls.</Text></Text>
              <Text style={styles.bulletItem}>• Calling is permanently disabled immediately upon ride completion.</Text>
            </View>
          </View>

          {/* Section 3: Phone & OTP */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef3c7' }]}>
                <Lock size={20} color="#d97706" />
              </View>
              <Text style={styles.sectionTitle}>3. Passwordless OTP Auth</Text>
            </View>
            <Text style={styles.sectionBody}>
              Authentication is handled via a 2-factor one-time password (OTP) sent to your mobile number via 2Factor.in SMS gateway.
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• No passwords are required, created, or stored.</Text>
              <Text style={styles.bulletItem}>• Phone numbers are never shared publicly or sold to third parties.</Text>
            </View>
          </View>

          {/* Section 4: Driver Documents */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#f3e8ff' }]}>
                <FileCheck size={20} color="#9333ea" />
              </View>
              <Text style={styles.sectionTitle}>4. Driver Verifications</Text>
            </View>
            <Text style={styles.sectionBody}>
              For driver safety, we collect Driving License (DL) and Vehicle Registration Certificates (RC). These documents are stored securely with restricted administrative access and are solely used for safety verification.
            </Text>
          </View>

          {/* Section 5: Account Deletion */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                <Users size={20} color="#dc2626" />
              </View>
              <Text style={styles.sectionTitle}>5. Account & Data Deletion</Text>
            </View>
            <Text style={styles.sectionBody}>
              In accordance with Google Play User Data policies, you have the right to request full deletion of your account and personal data.
            </Text>
            <Text style={styles.sectionNote}>
              To delete your account, email support@loloride.app with the subject "Account Deletion Request" from your registered mobile number. All personal data will be purged within 30 days.
            </Text>
          </View>

          {/* Contact */}
          <View style={styles.contactCard}>
            <Mail size={20} color="#0369a1" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactTitle}>Support & Grievances</Text>
              <Text style={styles.contactText}>support@loloride.app</Text>
              <Text style={styles.contactSub}>Lo Ride Technologies • Hyderabad, India</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  heroBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: '#ffffff',
  },
  heroTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: '#ffffff',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  content: {
    padding: Spacing.md,
  },
  introText: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.neutral[600],
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
  },
  sectionBody: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.sm,
    color: Colors.neutral[700],
    lineHeight: 20,
    marginBottom: 8,
  },
  bulletList: {
    marginVertical: 4,
    gap: 4,
  },
  bulletItem: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[600],
    lineHeight: 18,
  },
  sectionNote: {
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    marginTop: 8,
    fontStyle: 'italic',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  contactTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.sm,
    color: '#0369a1',
  },
  contactText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: '#0284c7',
    marginTop: 2,
  },
  contactSub: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    marginTop: 2,
  },
});
