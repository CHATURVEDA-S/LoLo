import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Bell, Car, Check, CheckCheck, UserCheck, UserX, Navigation, CreditCard, Star } from 'lucide-react-native';
import { api } from '@/lib/api';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import type { Notification } from '@/lib/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { setUnreadNotificationsCount } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { data } = await api.getNotifications(50);
    if (data) {
      const d = data as any;
      const count = d.unread_count ?? 0;
      setNotifications(d.notifications ?? []);
      setUnreadCount(count);
      setUnreadNotificationsCount(count);
    }
    setLoading(false);
    setRefreshing(false);
  }, [setUnreadNotificationsCount]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  async function markAllRead() {
    await api.markAllNotificationsRead();
    setUnreadCount(0);
    setUnreadNotificationsCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    await api.markNotificationRead(id);
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    setUnreadNotificationsCount(Math.max(0, unreadCount - 1));
  }

  function getNotifIcon(type: string) {
    switch (type) {
      case 'ride_request': return <UserCheck size={20} color={Colors.primary[500]} strokeWidth={2} />;
      case 'request_accepted': return <Check size={20} color={Colors.success[500]} strokeWidth={2} />;
      case 'request_rejected': return <UserX size={20} color={Colors.error[500]} strokeWidth={2} />;
      case 'ride_started': return <Navigation size={20} color={Colors.warning[500]} strokeWidth={2} />;
      case 'ride_completed': return <Car size={20} color={Colors.success[500]} strokeWidth={2} />;
      case 'payment_confirmed': return <CreditCard size={20} color={Colors.primary[500]} strokeWidth={2} />;
      default: return <Bell size={20} color={Colors.neutral[400]} strokeWidth={2} />;
    }
  }

  function timeAgo(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllButton} onPress={markAllRead}>
            <CheckCheck size={16} color={Colors.primary[600]} strokeWidth={2} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchNotifications} />}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary[500]} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.centerState}>
            <Bell size={48} color={Colors.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyDesc}>You'll see ride updates and requests here.</Text>
          </View>
        ) : (
          <View style={styles.notifList}>
            {notifications.map((notif) => (
              <TouchableOpacity
                key={notif.id}
                style={[styles.notifCard, !notif.is_read && styles.notifUnread]}
                onPress={() => {
                  if (!notif.is_read) markRead(notif.id);
                  if (notif.ride_id) router.push(`/ride/${notif.ride_id}`);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.notifIcon}>
                  {getNotifIcon(notif.type)}
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{notif.title}</Text>
                  <Text style={styles.notifBody}>{notif.body}</Text>
                  <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                </View>
                {!notif.is_read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neutral[50] },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.neutral[0], borderBottomWidth: 1, borderBottomColor: Colors.neutral[200],
  },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: FontSizes.xxxl, color: Colors.neutral[900] },
  markAllButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { fontFamily: 'Inter-Medium', fontSize: FontSizes.sm, color: Colors.primary[600] },
  scrollView: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  centerState: { alignItems: 'center', paddingTop: Spacing.xxxl * 1.5, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.lg, color: Colors.neutral[700], marginTop: Spacing.md },
  emptyDesc: { fontFamily: 'Inter-Regular', fontSize: FontSizes.md, color: Colors.neutral[400], textAlign: 'center', marginTop: Spacing.xs },
  notifList: { gap: Spacing.sm },
  notifCard: {
    flexDirection: 'row', backgroundColor: Colors.neutral[0], borderRadius: Radius.lg,
    padding: Spacing.md, ...Shadow.sm, gap: Spacing.md, alignItems: 'flex-start',
  },
  notifUnread: { backgroundColor: Colors.primary[50], borderWidth: 1, borderColor: Colors.primary[100] },
  notifIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.neutral[50],
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifTitle: { fontFamily: 'Inter-SemiBold', fontSize: FontSizes.md, color: Colors.neutral[900] },
  notifBody: { fontFamily: 'Inter-Regular', fontSize: FontSizes.sm, color: Colors.neutral[600], marginTop: 2 },
  notifTime: { fontFamily: 'Inter-Regular', fontSize: FontSizes.xs, color: Colors.neutral[400], marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary[500], marginTop: 6 },
});
