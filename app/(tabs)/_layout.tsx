import { Tabs, Redirect } from 'expo-router';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Home, ClipboardList, Bell, User } from 'lucide-react-native';
import { Colors } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
function ModernFloatingCardTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { unreadNotificationsCount } = useAuth();
  const bottomMargin = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 12);

  const tabConfig: Record<string, { label: string; Icon: any }> = {
    home: { label: 'Home', Icon: Home },
    trips: { label: 'My Trips', Icon: ClipboardList },
    notifications: { label: 'Alerts', Icon: Bell },
    profile: { label: 'Profile', Icon: User },
  };

  const visibleRoutes = state.routes.filter((route: any) => tabConfig[route.name]);

  return (
    <View pointerEvents="box-none" style={[styles.floatingContainer, { bottom: bottomMargin }]}>
      <View style={styles.floatingCard}>
        {visibleRoutes.map((route: any) => {
          const isFocused = state.routes[state.index]?.name === route.name;
          const config = tabConfig[route.name];
          if (!config) return null;
          const { label, Icon } = config;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.75}
            >
              <View style={styles.iconWrap}>
                <Icon
                  size={21}
                  color={isFocused ? Colors.primary[600] : '#94a3b8'}
                  strokeWidth={isFocused ? 2.4 : 1.8}
                />
                {route.name === 'notifications' && unreadNotificationsCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {label}
              </Text>
              <View style={[styles.activeDot, isFocused && styles.activeDotVisible]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { user, loading } = useAuth();

  // If user is not logged in, automatically redirect to login screen
  if (!loading && !user) {
    return <Redirect href="/(auth)/(screens)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <ModernFloatingCardTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="profile" />

      {/* Hidden Screens (not shown in the bottom footer bar) */}
      <Tabs.Screen
        name="find"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="offer"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  floatingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    height: 64,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 20,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  tabLabelActive: {
    fontFamily: 'Inter-Bold',
    color: Colors.primary[700],
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  activeDotVisible: {
    backgroundColor: Colors.primary[600],
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -7,
    backgroundColor: '#ef4444',
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontFamily: 'Inter-Bold',
    lineHeight: 11,
  },
});
