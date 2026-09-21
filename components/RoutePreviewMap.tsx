import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Share,
  DimensionValue,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Share2, Plus, Minus, Crosshair } from 'lucide-react-native';
import { Shadow } from '@/lib/theme';

interface RoutePreviewMapProps {
  originLat?: number;
  originLng?: number;
  originName?: string;
  destLat?: number;
  destLng?: number;
  destName?: string;
  height?: DimensionValue;
  onPlusPress?: () => void;
  onSharePress?: () => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
}

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
  onMapClick,
}: RoutePreviewMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Default fallback center (Hyderabad HITEC City / Jubilee Hills area)
  const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyAv6puZhhuJOdVzyYWhPf7d7M_MwRjjt80';

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

  // CartoDB Voyager HTML: 100% reliable, zero billing required, exact light minimal sky blue aesthetic
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
    /* Subtle Brand Map Watermark */
    .map-watermark {
      position: absolute;
      bottom: 8px;
      left: 10px;
      z-index: 1000;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      opacity: 0.75;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="map-watermark">Lo Ride Maps</div>

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

            window.activePolyline = activePolyline;
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

        window.activePolyline = fallbackLine;
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

    // Zoom in control
    window.zoomIn = function() {
      try {
        map.zoomIn();
      } catch (e) {
        console.error('zoomIn err', e);
      }
    };

    // Zoom out control
    window.zoomOut = function() {
      try {
        map.zoomOut();
      } catch (e) {
        console.error('zoomOut err', e);
      }
    };

    // Function to re-fit route bounds
    window.fitRouteBounds = function() {
      try {
        if (window.activePolyline && typeof window.activePolyline.getBounds === 'function') {
          map.fitBounds(window.activePolyline.getBounds(), { padding: [45, 45], maxZoom: 15 });
        } else if (boundsMarkers && boundsMarkers.length > 1) {
          map.fitBounds(L.latLngBounds(boundsMarkers), { padding: [45, 45], maxZoom: 15 });
        } else if (boundsMarkers && boundsMarkers.length === 1) {
          map.setView(boundsMarkers[0], 14);
        } else {
          map.setView([${centerLat}, ${centerLng}], 13);
        }
      } catch (e) {
        console.error('fitRouteBounds err', e);
      }
    };

    // Auto-adjust map viewport whenever the container resizes
    window.addEventListener('resize', function() {
      try {
        if (map) {
          map.invalidateSize();
          if (window.fitRouteBounds) { window.fitRouteBounds(); }
        }
      } catch (e) {}
    });

    // Map click handler to select point directly on map
    map.on('click', function(e) {
      try {
        if (e && e.latlng) {
          var payload = JSON.stringify({
            type: 'MAP_CLICK',
            lat: e.latlng.lat,
            lng: e.latlng.lng
          });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(payload);
          }
        }
      } catch (err) {
        console.error('map click err', err);
      }
    });
  </script>
</body>
</html>
  `;

  function handleZoomIn() {
    webViewRef.current?.injectJavaScript(`if (window.zoomIn) { window.zoomIn(); } true;`);
  }

  function handleZoomOut() {
    webViewRef.current?.injectJavaScript(`if (window.zoomOut) { window.zoomOut(); } true;`);
  }

  function handleRecenter() {
    webViewRef.current?.injectJavaScript(`if (window.fitRouteBounds) { window.fitRouteBounds(); } true;`);
  }

  return (
    <View style={[styles.container, { height }]} pointerEvents="box-none">
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
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MAP_CLICK' && onMapClick) {
              onMapClick({ lat: data.lat, lng: data.lng });
            }
          } catch (e) {}
        }}
      />

      {/* Floating Action Buttons */}
      <View style={styles.floatingControls} pointerEvents="box-none">
        {/* Recenter Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleRecenter}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Crosshair size={18} color="#0284c7" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Zoom In Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleZoomIn}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Plus size={18} color="#0f172a" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Zoom Out Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleZoomOut}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Minus size={18} color="#0f172a" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Share Route Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleShare}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Share2 size={18} color="#0284c7" strokeWidth={2.4} />
        </TouchableOpacity>
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
    zIndex: 9999,
    elevation: 25,
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
    zIndex: 10000,
    ...Shadow.sm,
    elevation: 26,
  },
  plusBtn: {
    backgroundColor: '#0284c7', // Lo Ride Brand Sky Blue
    borderColor: '#0369a1',
  },
});
