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

export default function RoutePreviewMap({
  originLat,
  originLng,
  originName = 'Pickup',
  destLat,
  destLng,
  destName = 'Destination',
  height = 280,
  onPlusPress,
  onSharePress,
}: RoutePreviewMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Default fallback center (Hyderabad HITEC City / Jubilee Hills area)
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

  // Generate clean Leaflet HTML with CartoDB Voyager tiles (light minimal sky blue styling)
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
    /* Minimalist Map Tile Styling */
    .leaflet-tile {
      filter: contrast(102%) brightness(101%);
    }
    /* Origin Pin: Clean Ring with Center Pulse */
    .origin-marker-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }
    .origin-ring {
      width: 16px;
      height: 16px;
      border: 3.5px solid #0284c7;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.45);
    }
    /* Destination Pin: Red Pin Marker with Icon */
    .dest-marker-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
    }
    .dest-pin-body {
      width: 28px;
      height: 28px;
      background: #ef4444;
      border: 2.5px solid #ffffff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 8px rgba(239, 68, 68, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dest-pin-icon {
      transform: rotate(45deg);
      font-size: 13px;
      line-height: 1;
      color: #ffffff;
    }
    .dest-pin-shadow {
      width: 10px;
      height: 4px;
      background: rgba(0,0,0,0.25);
      border-radius: 50%;
      margin-top: 2px;
    }
    /* Tooltip */
    .custom-tooltip {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      background: #ffffff;
      border-radius: 6px;
      padding: 3px 7px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${centerLat}, ${centerLng}], 13);

    // CartoDB Voyager: Clean, modern light minimal map with pastel sky blue water & subtle roads
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    var boundsMarkers = [];

    // Origin Marker
    ${
      originLat && originLng
        ? `
      var originIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="origin-marker-wrap"><div class="origin-ring"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      var originMarker = L.marker([${originLat}, ${originLng}], { icon: originIcon }).addTo(map);
      originMarker.bindTooltip("${originName.replace(/"/g, '\\"')}", {
        permanent: false,
        direction: 'top',
        className: 'custom-tooltip'
      });
      boundsMarkers.push([${originLat}, ${originLng}]);
    `
        : ''
    }

    // Destination Marker
    ${
      destLat && destLng
        ? `
      var destIcon = L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="dest-marker-wrap"><div class="dest-pin-body"><span class="dest-pin-icon">📍</span></div><div class="dest-pin-shadow"></div></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 34]
      });
      var destMarker = L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map);
      destMarker.bindTooltip("${destName.replace(/"/g, '\\"')}", {
        permanent: true,
        direction: 'top',
        className: 'custom-tooltip'
      });
      boundsMarkers.push([${destLat}, ${destLng}]);
    `
        : ''
    }

    // Fetch live turn-by-turn road route via OSRM
    ${
      originLat && originLng && destLat && destLng
        ? `
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson';
      
      fetch(osrmUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.routes && data.routes.length > 0) {
            var routeCoords = data.routes[0].geometry.coordinates.map(function(c) {
              return [c[1], c[0]];
            });

            // Subtle route glow/casing
            L.polyline(routeCoords, {
              color: '#0284c7',
              weight: 8,
              opacity: 0.28,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            // Primary vivid sky blue route polyline
            var activePolyline = L.polyline(routeCoords, {
              color: '#0284c7',
              weight: 5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            map.fitBounds(activePolyline.getBounds(), {
              padding: [45, 45],
              maxZoom: 15
            });
          } else {
            drawFallbackLine();
          }
        })
        .catch(function() {
          drawFallbackLine();
        });

      function drawFallbackLine() {
        var fallbackLine = L.polyline([
          [${originLat}, ${originLng}],
          [${destLat}, ${destLng}]
        ], {
          color: '#0284c7',
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 8',
          lineJoin: 'round'
        }).addTo(map);

        map.fitBounds(fallbackLine.getBounds(), {
          padding: [50, 50],
          maxZoom: 15
        });
      }
    `
        : `
      if (boundsMarkers.length === 1) {
        map.setView(boundsMarkers[0], 14);
      }
    `
    }

    // Function to re-fit route bounds
    window.fitRouteBounds = function() {
      if (boundsMarkers.length > 1) {
        map.fitBounds(boundsMarkers, { padding: [45, 45] });
      } else if (boundsMarkers.length === 1) {
        map.setView(boundsMarkers[0], 14);
      }
    };
  </script>
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
    backgroundColor: '#e2e8f0',
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
    backgroundColor: '#ef4444', // Red button matching reference screenshot
    borderColor: '#dc2626',
  },
});
