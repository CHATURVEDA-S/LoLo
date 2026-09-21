import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Share2, Plus, Crosshair } from 'lucide-react-native';
import { Shadow } from '@/lib/theme';

interface RoutePreviewMapProps {
  originLat?: number;
  originLng?: number;
  originName?: string;
  destLat?: number;
  destLng?: number;
  destName?: string;
  height?: number;
  onPlusPress?: () => void;
  onSharePress?: () => void;
}

const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyAg8BiwWrJEYduu94ilNNebUdBFOD3B9uQ';

export default function RoutePreviewMap({
  originLat,
  originLng,
  originName = 'Pickup',
  destLat,
  destLng,
  destName = 'Destination',
  height = 260,
  onPlusPress,
  onSharePress,
}: RoutePreviewMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Default center (e.g. Hyderabad metro area)
  const centerLat = originLat || 17.4435;
  const centerLng = originLng || 78.3772;

  // Handle native share
  async function handleShare() {
    if (onSharePress) {
      onSharePress();
      return;
    }
    try {
      await Share.share({
        title: 'Lo Ride Commute Route',
        message: `Commute Route on Lo Ride:\nFrom: ${originName}\nTo: ${destName}\n\nCarpool & Bikepool together and save!`,
      });
    } catch {}
  }

  // Google Maps HTML with light minimal sky blue styling
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    #map {
      width: 100%;
      height: 100%;
    }
    /* Origin Pin Marker */
    .origin-marker {
      width: 18px;
      height: 18px;
      border: 3.5px solid #0284c7;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.5);
    }
    /* Red Destination Pin */
    .dest-pin {
      width: 32px;
      height: 32px;
      background: #ef4444;
      border: 2.5px solid #ffffff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 8px rgba(239, 68, 68, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 13px;
    }
    .dest-pin span {
      transform: rotate(45deg);
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    // Custom Google Maps Style: Light minimal with soft sky blue water & clean subtle roads
    var mapStyles = [
      {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#c0e1fb" }] // Light minimal sky blue water
      },
      {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [{ "color": "#f8fafc" }] // Clean minimal light off-white land
      },
      {
        "featureType": "poi.park",
        "elementType": "geometry",
        "stylers": [{ "color": "#dcfce7" }] // Pastel green parks
      },
      {
        "featureType": "poi",
        "elementType": "labels.text",
        "stylers": [{ "visibility": "simplified" }]
      },
      {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [{ "color": "#ffffff" }] // Crisp white roads
      },
      {
        "featureType": "road",
        "elementType": "geometry.stroke",
        "stylers": [{ "color": "#e2e8f0" }] // Subtle road borders
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry",
        "stylers": [{ "color": "#fed7aa" }] // Soft pastel highway
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [{ "color": "#fdba74" }]
      },
      {
        "featureType": "transit",
        "stylers": [{ "visibility": "simplified" }]
      },
      {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#475569" }]
      },
      {
        "featureType": "all",
        "elementType": "labels.text.stroke",
        "stylers": [{ "color": "#ffffff" }, { "weight": 3 }]
      }
    ];

    var map = null;
    var directionsRenderer = null;
    var originMarker = null;
    var destMarker = null;

    function initMap() {
      try {
        var centerPos = { lat: ${centerLat}, lng: ${centerLng} };

        map = new google.maps.Map(document.getElementById('map'), {
          center: centerPos,
          zoom: 13,
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: 'greedy'
        });

        // Setup directions renderer with blue route polyline
        var directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
          map: map,
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: {
            strokeColor: '#0284c7', // Sky Blue brand route
            strokeWeight: 6,
            strokeOpacity: 0.95
          }
        });

        // Add custom markers
        ${
          originLat && originLng
            ? `
          originMarker = new google.maps.Marker({
            position: { lat: ${originLat}, lng: ${originLng} },
            map: map,
            title: "${originName.replace(/"/g, '\\"')}",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#ffffff',
              fillOpacity: 1,
              strokeColor: '#0284c7',
              strokeWeight: 4
            }
          });
        `
            : ''
        }

        ${
          destLat && destLng
            ? `
          destMarker = new google.maps.Marker({
            position: { lat: ${destLat}, lng: ${destLng} },
            map: map,
            title: "${destName.replace(/"/g, '\\"')}",
            label: {
              text: '📍',
              fontSize: '18px'
            }
          });
        `
            : ''
        }

        // Calculate and render route via Google Directions
        ${
          originLat && originLng && destLat && destLng
            ? `
          directionsService.route({
            origin: { lat: ${originLat}, lng: ${originLng} },
            destination: { lat: ${destLat}, lng: ${destLng} },
            travelMode: google.maps.TravelMode.DRIVING
          }, function(result, status) {
            if (status === google.maps.DirectionsStatus.OK) {
              directionsRenderer.setDirections(result);
            } else {
              // Fallback to fitting bounds around markers
              fitMarkersBounds();
            }
          });
        `
            : `
          fitMarkersBounds();
        `
        }

        window.fitRouteBounds = function() {
          if (directionsRenderer && directionsRenderer.getDirections()) {
            var bounds = directionsRenderer.getDirections().routes[0].bounds;
            map.fitBounds(bounds);
          } else {
            fitMarkersBounds();
          }
        };

        function fitMarkersBounds() {
          var bounds = new google.maps.LatLngBounds();
          var count = 0;
          if (originMarker) { bounds.extend(originMarker.getPosition()); count++; }
          if (destMarker) { bounds.extend(destMarker.getPosition()); count++; }
          if (count > 1) {
            map.fitBounds(bounds);
          } else if (count === 1) {
            map.setCenter(centerPos);
            map.setZoom(14);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  </script>

  <!-- Google Maps JavaScript API with user's authorized API key -->
  <script
    async
    defer
    src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap&libraries=geometry"
  ></script>
</body>
</html>
  `;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
      />

      {/* Floating Action Buttons */}
      <View style={styles.floatingControls}>
        {/* Recenter Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            webViewRef.current?.injectJavaScript(`window.fitRouteBounds && window.fitRouteBounds(); true;`);
          }}
          activeOpacity={0.8}
        >
          <Crosshair size={18} color="#0284c7" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Share Route Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <Share2 size={18} color="#0284c7" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Quick Add / Post Request Button */}
        {onPlusPress && (
          <TouchableOpacity
            style={[styles.iconBtn, styles.plusBtn]}
            onPress={onPlusPress}
            activeOpacity={0.8}
          >
            <Plus size={20} color="#ffffff" strokeWidth={2.6} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  floatingControls: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  plusBtn: {
    backgroundColor: '#ef4444', // Red + button matching reference screenshot
    borderColor: '#dc2626',
  },
});
