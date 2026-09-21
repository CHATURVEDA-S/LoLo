import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Navigation, MapPin, Maximize2, Minimize2, ExternalLink } from 'lucide-react-native';
import { Colors, Radius, Spacing, FontSizes, Shadow } from '@/lib/theme';
import { api } from '@/lib/api';

interface LiveRideMapProps {
  rideId: string;
  isDriver: boolean;
  vehicleType?: 'car' | 'bike';
  driverLiveLat?: number;
  driverLiveLng?: number;
  driverName?: string;
  originName: string;
  originLat?: number;
  originLng?: number;
  destName: string;
  destLat?: number;
  destLng?: number;
  pickupName?: string;
  pickupLat?: number;
  pickupLng?: number;
  passengerName?: string;
  rideStatus: string;
}

// Calculate distance between two coordinates in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function LiveRideMap({
  rideId,
  isDriver,
  vehicleType = 'car',
  driverLiveLat,
  driverLiveLng,
  driverName = 'Driver',
  originName,
  originLat,
  originLng,
  destName,
  destLat,
  destLng,
  pickupName,
  pickupLat,
  pickupLng,
  passengerName = 'Passenger',
  rideStatus,
}: LiveRideMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Active coordinates
  const [currentDriverLat, setCurrentDriverLat] = useState<number | undefined>(
    driverLiveLat ?? originLat
  );
  const [currentDriverLng, setCurrentDriverLng] = useState<number | undefined>(
    driverLiveLng ?? originLng
  );
  const [isTracking, setIsTracking] = useState(false);

  // Sync props updates
  useEffect(() => {
    if (driverLiveLat && driverLiveLng) {
      setCurrentDriverLat(driverLiveLat);
      setCurrentDriverLng(driverLiveLng);
    }
  }, [driverLiveLat, driverLiveLng]);

  // Driver live location tracking
  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;

    async function startDriverTracking() {
      if (!isDriver || (rideStatus !== 'confirmed' && rideStatus !== 'in_progress')) {
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      setIsTracking(true);

      // Initial position
      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCurrentDriverLat(initial.coords.latitude);
        setCurrentDriverLng(initial.coords.longitude);
        api.updateDriverLocation(rideId, initial.coords.latitude, initial.coords.longitude);
      } catch (_) {}

      // Watch updates
      try {
        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // Every 10 seconds
            distanceInterval: 15, // Every 15 meters
          },
          (loc) => {
            const { latitude, longitude } = loc.coords;
            setCurrentDriverLat(latitude);
            setCurrentDriverLng(longitude);
            api.updateDriverLocation(rideId, latitude, longitude);

            // Update WebView marker
            if (webViewRef.current) {
              webViewRef.current.postMessage(
                JSON.stringify({
                  type: 'UPDATE_DRIVER_LOCATION',
                  lat: latitude,
                  lng: longitude,
                })
              );
            }
          }
        );
      } catch (_) {}
    }

    startDriverTracking();

    return () => {
      if (watcher) watcher.remove();
    };
  }, [isDriver, rideId, rideStatus]);

  // Compute live distance
  let distanceToPickup: number | null = null;
  if (currentDriverLat && currentDriverLng && pickupLat && pickupLng) {
    distanceToPickup = calculateDistanceKm(
      currentDriverLat,
      currentDriverLng,
      pickupLat,
      pickupLng
    );
  }

  let distanceToDest: number | null = null;
  if (currentDriverLat && currentDriverLng && destLat && destLng) {
    distanceToDest = calculateDistanceKm(
      currentDriverLat,
      currentDriverLng,
      destLat,
      destLng
    );
  }

  // Open native maps navigation
  async function openNavigation() {
    let targetLat = destLat;
    let targetLng = destLng;
    let targetLabel = destName || 'Destination';

    // If driver heading to pickup first
    if (isDriver && pickupLat && pickupLng && rideStatus !== 'in_progress') {
      targetLat = pickupLat;
      targetLng = pickupLng;
      targetLabel = pickupName || 'Passenger Pickup';
    }

    // Fallback: If coordinates missing, open Maps with place label query
    if (!targetLat || !targetLng) {
      if (targetLabel && targetLabel.trim()) {
        const encoded = encodeURIComponent(targetLabel.trim());
        const searchUrl = Platform.select({
          ios: `maps://app?q=${encoded}`,
          android: `geo:0,0?q=${encoded}`,
          default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
        });
        Linking.openURL(searchUrl!).catch(() => {
          Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
        });
        return;
      }
      Alert.alert('Location Unavailable', 'No valid destination location found for navigation.');
      return;
    }

    const travelMode = vehicleType === 'bike' ? 'two-wheeler' : 'driving';
    const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}&travelmode=${travelMode}`;
    const nativeUrl = Platform.select({
      ios: `maps://app?daddr=${targetLat},${targetLng}&q=${encodeURIComponent(targetLabel)}`,
      android: `google.navigation:q=${targetLat},${targetLng}&mode=${vehicleType === 'bike' ? 'b' : 'd'}`,
      default: googleWebUrl,
    });

    try {
      const supported = await Linking.canOpenURL(nativeUrl!);
      if (supported) {
        await Linking.openURL(nativeUrl!);
      } else {
        await Linking.openURL(googleWebUrl);
      }
    } catch {
      Linking.openURL(googleWebUrl).catch(() => {
        Alert.alert('Navigation Error', 'Unable to open Maps application.');
      });
    }
  }

  // Generate Leaflet HTML map
  const driverIcon = vehicleType === 'bike' ? '🏍️' : '🚗';
  const centerLat = currentDriverLat ?? originLat ?? 17.4435;
  const centerLng = currentDriverLng ?? originLng ?? 78.3772;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, sans-serif; }
    #map { width: 100vw; height: 100vh; }
    .driver-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      background: #0284c7;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.45);
      font-size: 20px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.6); }
      70% { box-shadow: 0 0 0 14px rgba(2, 132, 199, 0); }
      100% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
    }
    .pickup-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      background: #16a34a;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.4);
      font-size: 18px;
    }
    .dest-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      background: #dc2626;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
      font-size: 18px;
    }
    .custom-tooltip {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      background: #ffffff;
      border-radius: 6px;
      padding: 4px 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], 14);

    // CartoDB Voyager: Clean, modern light minimal map with pastel sky blue water & subtle roads
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© CartoDB © OpenStreetMap'
    }).addTo(map);

    var driverMarker = null;
    var markers = [];

    // Driver Marker
    ${
      currentDriverLat && currentDriverLng
        ? `
      var driverIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="driver-pin">${driverIcon}</div>',
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });
      driverMarker = L.marker([${currentDriverLat}, ${currentDriverLng}], { icon: driverIcon }).addTo(map);
      driverMarker.bindTooltip("${driverName} (Live)", { permanent: true, direction: 'top', className: 'custom-tooltip' });
      markers.push([${currentDriverLat}, ${currentDriverLng}]);
    `
        : ''
    }

    // Pickup Marker
    ${
      pickupLat && pickupLng
        ? `
      var pickupIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="pickup-pin">📍</div>',
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
      var pickupMarker = L.marker([${pickupLat}, ${pickupLng}], { icon: pickupIcon }).addTo(map);
      pickupMarker.bindTooltip("Pickup: ${passengerName}", { permanent: true, direction: 'top', className: 'custom-tooltip' });
      markers.push([${pickupLat}, ${pickupLng}]);
    `
        : ''
    }

    // Destination Marker
    ${
      destLat && destLng
        ? `
      var destIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="dest-pin">🏁</div>',
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
      var destMarker = L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map);
      destMarker.bindTooltip("Destination", { permanent: true, direction: 'top', className: 'custom-tooltip' });
      markers.push([${destLat}, ${destLng}]);
    `
        : ''
    }

    // Live Turn-by-Turn Road Route via OSRM
    ${
      (originLat || pickupLat) && (originLng || pickupLng) && destLat && destLng
        ? `
      var routeStartLat = ${pickupLat ?? originLat};
      var routeStartLng = ${pickupLng ?? originLng};
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + routeStartLng + ',' + routeStartLat + ';' + ${destLng} + ',' + ${destLat} + '?overview=full&geometries=geojson';
      
      fetch(osrmUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.routes && data.routes.length > 0) {
            var routeCoords = data.routes[0].geometry.coordinates.map(function(c) {
              return [c[1], c[0]];
            });

            // Route halo
            L.polyline(routeCoords, {
              color: '#0284c7',
              weight: 8,
              opacity: 0.25,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            // Active blue route
            var activePoly = L.polyline(routeCoords, {
              color: '#0284c7',
              weight: 5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            map.fitBounds(activePoly.getBounds(), { padding: [40, 40] });
          } else {
            fallbackPoly();
          }
        })
        .catch(function() {
          fallbackPoly();
        });

      function fallbackPoly() {
        var line = L.polyline([
          [routeStartLat, routeStartLng],
          [${destLat}, ${destLng}]
        ], {
          color: '#0284c7',
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 8',
          lineJoin: 'round'
        }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [40, 40] });
      }
    `
        : `
      if (markers.length > 1) {
        map.fitBounds(markers, { padding: [40, 40] });
      }
    `
    }

    // Handle messages from React Native
    window.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'UPDATE_DRIVER_LOCATION' && driverMarker) {
          driverMarker.setLatLng([data.lat, data.lng]);
        }
      } catch(e) {}
    });
    document.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'UPDATE_DRIVER_LOCATION' && driverMarker) {
          driverMarker.setLatLng([data.lat, data.lng]);
        }
      } catch(e) {}
    });
  </script>
</body>
</html>
  `;

  return (
    <View style={[styles.card, isExpanded && styles.cardExpanded]}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {rideStatus === 'in_progress' ? 'LIVE TRIP IN PROGRESS' : 'LIVE ROUTE & LOCATIONS'}
            </Text>
          </View>
          {isTracking && (
            <Text style={styles.gpsBroadcastingText}>• GPS Active</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
        >
          {isExpanded ? (
            <Minimize2 size={16} color={Colors.neutral[700]} strokeWidth={2.2} />
          ) : (
            <Maximize2 size={16} color={Colors.neutral[700]} strokeWidth={2.2} />
          )}
        </TouchableOpacity>
      </View>

      {/* Interactive Map */}
      <View style={[styles.mapContainer, isExpanded && styles.mapContainerExpanded]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webview}
          scrollEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="small" color={Colors.primary[600]} />
            </View>
          )}
        />
      </View>

      {/* Live Distance & Info Banner */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          {distanceToPickup !== null ? (
            <View style={styles.distanceRow}>
              <MapPin size={14} color={Colors.success[600]} strokeWidth={2.2} />
              <Text style={styles.distanceText}>
                {isDriver ? 'To Pickup' : 'Driver to you'}:{' '}
                <Text style={styles.distanceBold}>
                  {distanceToPickup < 1
                    ? `${(distanceToPickup * 1000).toFixed(0)} meters`
                    : `${distanceToPickup.toFixed(1)} km`}
                </Text>
              </Text>
            </View>
          ) : distanceToDest !== null ? (
            <View style={styles.distanceRow}>
              <Navigation size={14} color={Colors.primary[600]} strokeWidth={2.2} />
              <Text style={styles.distanceText}>
                To Destination:{' '}
                <Text style={styles.distanceBold}>
                  {distanceToDest < 1
                    ? `${(distanceToDest * 1000).toFixed(0)} meters`
                    : `${distanceToDest.toFixed(1)} km`}
                </Text>
              </Text>
            </View>
          ) : (
            <Text style={styles.statusSubText}>
              {pickupName ? `Pickup: ${pickupName}` : 'Driver and passenger locations on map'}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={openNavigation}
          activeOpacity={0.8}
        >
          <ExternalLink size={14} color="#ffffff" strokeWidth={2.2} />
          <Text style={styles.navBtnText}>Navigate</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    ...Shadow.sm,
  },
  cardExpanded: {
    marginHorizontal: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0ea5e9',
  },
  liveText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: '#0369a1',
    letterSpacing: 0.5,
  },
  gpsBroadcastingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: '#16a34a',
  },
  expandBtn: {
    padding: 4,
  },
  mapContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  mapContainerExpanded: {
    height: 320,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mapLoading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  distanceText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.neutral[700],
  },
  distanceBold: {
    fontFamily: 'Inter-Bold',
    color: Colors.neutral[900],
  },
  statusSubText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary[600],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  navBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#ffffff',
  },
});
