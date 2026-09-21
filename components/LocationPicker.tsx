import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  MapPin,
  Search,
  X,
  Navigation,
  ChevronRight,
  Map,
  ArrowLeft,
  Check,
  Compass,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, FontSizes, Shadow } from '@/lib/theme';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface LocationResult {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  placeId?: string;
  category?: string;
}

export interface DisplayPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: string;
  placeId?: string;
}

interface Props {
  label: string;
  value: string;
  onSelect: (result: LocationResult) => void;
  markerColor?: string;
  city?: string;
  cityLat?: number;
  cityLng?: number;
}

interface MetroPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: 'Metro Station' | 'Tech Park' | 'Airport' | 'Residential' | 'Commercial';
}

// Curated database of metro places, stations, and tech corridors in Indian cities
export const METRO_PLACES: Record<string, MetroPlace[]> = {
  Hyderabad: [
    { name: 'HITEC City Cyber Towers', address: 'Madhapur, HITEC City, Hyderabad', lat: 17.4504, lng: 78.3808, category: 'Tech Park' },
    { name: 'HITEC City Metro Station', address: 'Blue Line, HITEC City, Hyderabad', lat: 17.4486, lng: 78.3842, category: 'Metro Station' },
    { name: 'Gachibowli DLF Cyber City', address: 'Gachibowli, Hyderabad, Telangana', lat: 17.4474, lng: 78.3567, category: 'Tech Park' },
    { name: 'Financial District (Wipro Circle)', address: 'Nanakramguda, Gachibowli, Hyderabad', lat: 17.4156, lng: 78.3427, category: 'Tech Park' },
    { name: 'Madhapur Metro Station', address: 'Jubilee Hills Check Post Road, Madhapur', lat: 17.4399, lng: 78.3984, category: 'Metro Station' },
    { name: 'Ameerpet Metro Interchange', address: 'Red & Blue Line Junction, Ameerpet', lat: 17.4375, lng: 78.4483, category: 'Metro Station' },
    { name: 'Kukatpally Housing Board (KPHB)', address: 'KPHB Colony, Kukatpally, Hyderabad', lat: 17.4932, lng: 78.3986, category: 'Residential' },
    { name: 'Miyapur Metro Station', address: 'Red Line Terminal, Miyapur, Hyderabad', lat: 17.4968, lng: 78.3614, category: 'Metro Station' },
    { name: 'Jubilee Hills Road No. 36', address: 'Near Metro Station, Jubilee Hills, Hyderabad', lat: 17.4325, lng: 78.4072, category: 'Commercial' },
    { name: 'Banjara Hills Road No. 12', address: 'Banjara Hills, Hyderabad, Telangana', lat: 17.4156, lng: 78.4347, category: 'Commercial' },
    { name: 'Secunderabad Railway Station', address: 'Secunderabad, Hyderabad, Telangana', lat: 17.4399, lng: 78.4983, category: 'Metro Station' },
    { name: 'Kondapur RTA Office', address: 'Kondapur, Hyderabad, Telangana', lat: 17.4699, lng: 78.3578, category: 'Residential' },
    { name: 'LB Nagar Ring Road', address: 'Red Line Metro Terminal, LB Nagar, Hyderabad', lat: 17.3457, lng: 78.5522, category: 'Metro Station' },
    { name: 'Uppal Metro Station', address: 'Blue Line, Uppal, Hyderabad', lat: 17.3950, lng: 78.5594, category: 'Metro Station' },
    { name: 'Dilsukhnagar Bus Depot', address: 'Dilsukhnagar, Hyderabad, Telangana', lat: 17.3688, lng: 78.5247, category: 'Commercial' },
    { name: 'Rajiv Gandhi Int. Airport (RGIA)', address: 'Shamshabad, Hyderabad, Telangana', lat: 17.2403, lng: 78.4294, category: 'Airport' },
    { name: 'Begumpet Airport Road', address: 'Begumpet, Secunderabad, Telangana', lat: 17.4439, lng: 78.4738, category: 'Commercial' },
    { name: 'Nanakramguda WaveRock', address: 'Financial District, Nanakramguda, Hyderabad', lat: 17.4168, lng: 78.3496, category: 'Tech Park' },
  ],
  Bengaluru: [
    { name: 'Koramangala Sony World Signal', address: '100ft Road, Koramangala 4th Block, Bengaluru', lat: 12.9352, lng: 77.6245, category: 'Commercial' },
    { name: 'Indiranagar Metro Station', address: 'Purple Line, CMH Road, Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408, category: 'Metro Station' },
    { name: 'HSR Layout BDA Complex', address: 'HSR Layout Sector 1, Bengaluru', lat: 12.9116, lng: 77.6389, category: 'Commercial' },
    { name: 'Whitefield ITPL Tech Park', address: 'International Tech Park, Whitefield, Bengaluru', lat: 12.9866, lng: 77.7381, category: 'Tech Park' },
    { name: 'Electronic City Phase 1 (Infosys Gate)', address: 'Hosur Road, Electronic City, Bengaluru', lat: 12.8399, lng: 77.6770, category: 'Tech Park' },
    { name: 'Manyata Embassy Business Park', address: 'Outer Ring Road, Nagavara, Hebbal, Bengaluru', lat: 13.0478, lng: 77.6209, category: 'Tech Park' },
    { name: 'Bellandur EcoSpace Tech Park', address: 'Outer Ring Road, Bellandur, Bengaluru', lat: 12.9260, lng: 77.6836, category: 'Tech Park' },
    { name: 'Marathahalli Bridge', address: 'Outer Ring Road, Marathahalli, Bengaluru', lat: 12.9591, lng: 77.7009, category: 'Commercial' },
    { name: 'BTM Layout Water Tank', address: 'BTM 2nd Stage, Bengaluru', lat: 12.9166, lng: 77.6101, category: 'Residential' },
    { name: 'Jayanagar 4th Block', address: 'Near Jayanagar Metro Station, Bengaluru', lat: 12.9308, lng: 77.5838, category: 'Metro Station' },
    { name: 'MG Road Metro Station', address: 'Trinity & MG Road, Bengaluru', lat: 12.9757, lng: 77.6063, category: 'Metro Station' },
    { name: 'Kempegowda Int. Airport (BLR)', address: 'Devanahalli, Bengaluru, Karnataka', lat: 13.1986, lng: 77.7066, category: 'Airport' },
    { name: 'Majestic KSR Railway Station', address: 'Kempegowda Metro Interchange, Bengaluru', lat: 12.9780, lng: 77.5700, category: 'Metro Station' },
    { name: 'Hebbal Flyover Junction', address: 'Bellary Road, Hebbal, Bengaluru', lat: 13.0358, lng: 77.5970, category: 'Commercial' },
  ],
  Mumbai: [
    { name: 'Bandra Kurla Complex (BKC)', address: 'G Block, BKC, Bandra East, Mumbai', lat: 19.0657, lng: 72.8687, category: 'Tech Park' },
    { name: 'Andheri Metro Station', address: 'Line 1 & Western Railway Junction, Andheri East', lat: 19.1197, lng: 72.8464, category: 'Metro Station' },
    { name: 'Powai Hiranandani Gardens', address: 'Powai, Mumbai, Maharashtra', lat: 19.1176, lng: 72.9060, category: 'Tech Park' },
    { name: 'Dadar Western & Central Junction', address: 'Dadar, Mumbai, Maharashtra', lat: 19.0178, lng: 72.8478, category: 'Commercial' },
    { name: 'Borivali West Station Road', address: 'Borivali West, Mumbai, Maharashtra', lat: 19.2288, lng: 72.8544, category: 'Residential' },
    { name: 'Thane Viviana Mall', address: 'Eastern Express Highway, Thane West', lat: 19.2084, lng: 72.9715, category: 'Commercial' },
    { name: 'Navi Mumbai Vashi Plaza', address: 'Sector 17, Vashi, Navi Mumbai', lat: 19.0771, lng: 72.9986, category: 'Commercial' },
    { name: 'Chhatrapati Shivaji Maharaj Airport (T2)', address: 'Sahar, Andheri East, Mumbai', lat: 19.0896, lng: 72.8656, category: 'Airport' },
    { name: 'Goregaon NESCO IT Park', address: 'Western Express Highway, Goregaon East, Mumbai', lat: 19.1550, lng: 72.8540, category: 'Tech Park' },
    { name: 'Lower Parel One World Center', address: 'Senapati Bapat Marg, Lower Parel, Mumbai', lat: 19.0016, lng: 72.8302, category: 'Commercial' },
  ],
  'Delhi NCR': [
    { name: 'CyberHub DLF Phase 2', address: 'Cyber City, Sector 24, Gurugram, Haryana', lat: 28.4908, lng: 77.0895, category: 'Tech Park' },
    { name: 'Connaught Place Central Park', address: 'Rajiv Chowk Metro Station, New Delhi', lat: 28.6315, lng: 77.2167, category: 'Metro Station' },
    { name: 'Noida Sector 62 Electronic City', address: 'Blue Line Metro, Sector 62, Noida, UP', lat: 28.6279, lng: 77.3615, category: 'Tech Park' },
    { name: 'Noida Sector 18 Wave Mall', address: 'Sector 18, Noida, Uttar Pradesh', lat: 28.5708, lng: 77.3261, category: 'Commercial' },
    { name: 'Gurgaon Huda City Centre', address: 'Millennium City Centre Metro, Gurugram', lat: 28.4595, lng: 77.0726, category: 'Metro Station' },
    { name: 'Dwarka Sector 21 Metro', address: 'Airport Express Line, Dwarka, New Delhi', lat: 28.5522, lng: 77.0583, category: 'Metro Station' },
    { name: 'IGI Airport Terminal 3', address: 'Indira Gandhi International Airport, New Delhi', lat: 28.5562, lng: 77.1000, category: 'Airport' },
    { name: 'Saket Select Citywalk', address: 'District Centre, Saket, New Delhi', lat: 28.5284, lng: 77.2193, category: 'Commercial' },
  ],
  Chennai: [
    { name: 'T. Nagar Panagal Park', address: 'T. Nagar, Chennai, Tamil Nadu', lat: 13.0418, lng: 80.2341, category: 'Commercial' },
    { name: 'OMR TIDEL Park', address: 'Rajiv Gandhi Salai, Tharamani, Chennai', lat: 12.9893, lng: 80.2472, category: 'Tech Park' },
    { name: 'Guindy Kathipara Junction', address: 'Near Guindy Metro Station, Chennai', lat: 13.0067, lng: 80.2206, category: 'Metro Station' },
    { name: 'Velachery Phoenix Marketcity', address: 'Velachery Main Road, Chennai', lat: 12.9915, lng: 80.2170, category: 'Commercial' },
    { name: 'Anna Nagar Roundtana', address: 'Anna Nagar East, Chennai', lat: 13.0850, lng: 80.2101, category: 'Residential' },
    { name: 'Chennai International Airport (MAA)', address: 'Meenambakkam, Chennai, Tamil Nadu', lat: 12.9941, lng: 80.1709, category: 'Airport' },
  ],
  Pune: [
    { name: 'Hinjewadi Phase 1 Infosys Circle', address: 'Rajiv Gandhi Infotech Park, Hinjewadi, Pune', lat: 18.5912, lng: 73.7380, category: 'Tech Park' },
    { name: 'Hinjewadi Phase 2 Wipro Circle', address: 'Hinjewadi, Pune, Maharashtra', lat: 18.5832, lng: 73.7180, category: 'Tech Park' },
    { name: 'Hinjewadi Phase 3 Megapolis', address: 'Maan, Hinjewadi Phase 3, Pune', lat: 18.5742, lng: 73.6980, category: 'Tech Park' },
    { name: 'Wakad Dutta Mandir Chowk', address: 'Wakad, Pimpri-Chinchwad, Pune', lat: 18.5988, lng: 73.7631, category: 'Residential' },
    { name: 'Baner High Street', address: 'Baner, Pune, Maharashtra', lat: 18.5590, lng: 73.7868, category: 'Commercial' },
    { name: 'Magarpatta Cybercity', address: 'Hadapsar, Pune, Maharashtra', lat: 18.5152, lng: 73.9272, category: 'Tech Park' },
    { name: 'Kharadi EON Free Zone', address: 'MIDC Knowledge Park, Kharadi, Pune', lat: 18.5518, lng: 73.9532, category: 'Tech Park' },
    { name: 'Viman Nagar Phoenix Marketcity', address: 'Nagar Road, Viman Nagar, Pune', lat: 18.5622, lng: 73.9168, category: 'Commercial' },
    { name: 'Kothrud Vanaz Corner', address: 'Paud Road, Kothrud, Pune', lat: 18.5074, lng: 73.8077, category: 'Metro Station' },
  ],
  Kolkata: [
    { name: 'Salt Lake Sector V Webel Bhavan', address: 'IT Hub, Salt Lake, Kolkata, WB', lat: 22.5735, lng: 88.4331, category: 'Tech Park' },
    { name: 'New Town Eco Space', address: 'Action Area II, New Town, Kolkata', lat: 22.5855, lng: 88.4726, category: 'Tech Park' },
    { name: 'Park Street Metro Station', address: 'North-South Metro, Park Street, Kolkata', lat: 22.5520, lng: 88.3529, category: 'Metro Station' },
    { name: 'Howrah Railway Station', address: 'Howrah, Kolkata, West Bengal', lat: 22.5858, lng: 88.3426, category: 'Commercial' },
    { name: 'Netaji Subhash Chandra Bose Airport (CCU)', address: 'Dum Dum, Kolkata, West Bengal', lat: 22.6555, lng: 88.4467, category: 'Airport' },
  ],
};

const DEFAULT_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Hyderabad: { lat: 17.4435, lng: 78.3772 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mumbai: { lat: 19.0760, lng: 72.8777 },
  'Delhi NCR': { lat: 28.6139, lng: 77.2090 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
};

export default function LocationPicker({
  label,
  value,
  onSelect,
  markerColor,
  city,
  cityLat,
  cityLng,
}: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'search' | 'map'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [dynamicResults, setDynamicResults] = useState<LocationResult[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [loadingCurrentLoc, setLoadingCurrentLoc] = useState(false);

  const fallbackCoords = DEFAULT_CITY_COORDS[city || 'Hyderabad'] || { lat: 17.4435, lng: 78.3772 };
  const initialLat = cityLat ?? fallbackCoords.lat;
  const initialLng = cityLng ?? fallbackCoords.lng;

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [mapAddress, setMapAddress] = useState<string>('Select position on map...');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const activeCity = city || 'Hyderabad';
  const cityPlaces = METRO_PLACES[activeCity] || METRO_PLACES['Hyderabad'];

  const [onlineResults, setOnlineResults] = useState<LocationResult[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Instant local search as user enters letters
  const filteredLocalPlaces = searchQuery.trim()
    ? cityPlaces.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q))
        );
      })
    : cityPlaces;

  // Format category string from OSM properties
  function formatOsmCategory(osmValue?: string, type?: string): string {
    const val = (osmValue || type || '').toLowerCase();
    if (!val) return 'Address';
    if (['suburb', 'neighbourhood', 'locality', 'quarter', 'district'].includes(val)) return 'Colony / Area';
    if (['residential', 'apartments', 'house', 'building'].includes(val)) return 'Residential';
    if (['street', 'tertiary', 'secondary', 'primary', 'trunk', 'highway', 'road', 'path'].includes(val)) return 'Road / Street';
    if (['hospital', 'clinic', 'doctors', 'pharmacy', 'health_post'].includes(val)) return 'Hospital';
    if (['university', 'college', 'school', 'kindergarten'].includes(val)) return 'College / School';
    if (['tech_park', 'office', 'commercial', 'industrial'].includes(val)) return 'Office / Hub';
    if (['mall', 'supermarket', 'shop', 'marketplace'].includes(val)) return 'Shopping';
    if (['station', 'subway', 'halt', 'bus_station', 'stop', 'platform'].includes(val)) return 'Metro / Transit';
    if (['airport', 'aerodrome', 'terminal'].includes(val)) return 'Airport';
    if (['hotel', 'restaurant', 'fast_food', 'cafe'].includes(val)) return 'Dining';
    if (val === 'city' || val === 'town' || val === 'village') return 'City / Town';
    return val.charAt(0).toUpperCase() + val.slice(1);
  }

  function getCategoryBadgeStyle(category?: string) {
    if (!category) return { bg: Colors.neutral[100], text: Colors.neutral[600] };
    const cat = category.toLowerCase();
    if (cat.includes('metro') || cat.includes('transit') || cat.includes('station')) {
      return { bg: '#e0e7ff', text: '#4338ca' };
    }
    if (cat.includes('tech park') || cat.includes('office') || cat.includes('hub')) {
      return { bg: '#d1fae5', text: '#065f46' };
    }
    if (cat.includes('hospital') || cat.includes('health') || cat.includes('clinic')) {
      return { bg: '#ffe4e6', text: '#9f1239' };
    }
    if (cat.includes('colony') || cat.includes('area') || cat.includes('residential')) {
      return { bg: '#e0f2fe', text: '#075985' };
    }
    if (cat.includes('street') || cat.includes('road')) {
      return { bg: '#fef3c7', text: '#92400e' };
    }
    if (cat.includes('education') || cat.includes('college') || cat.includes('school')) {
      return { bg: '#f3e8ff', text: '#6b21a8' };
    }
    if (cat.includes('airport')) {
      return { bg: '#fce7f3', text: '#9d174d' };
    }
    return { bg: Colors.neutral[100], text: Colors.neutral[600] };
  }

  // Automatic online address geocoding via Photon (OSM) with Nominatim & Expo fallback
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        setIsSearchingOnline(true);
        const parsedResults: LocationResult[] = [];

        // 1. Primary: Nominatim with User-Agent & Indian address formatting
        try {
          const nomQuery = trimmed.toLowerCase().includes(activeCity.toLowerCase())
            ? trimmed
            : `${trimmed}, ${activeCity}`;
          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nomQuery)}&format=json&addressdetails=1&limit=10&countrycodes=in`;
          const nomRes = await fetch(nomUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'LoRideApp/1.0' },
          });
          if (nomRes.ok) {
            const nomData = await nomRes.json();
            if (Array.isArray(nomData) && nomData.length > 0) {
              nomData.forEach((item: any, idx: number) => {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lon);
                if (isNaN(lat) || isNaN(lng)) return;

                const rawName = item.name || item.display_name?.split(',')[0] || trimmed;
                const addr = item.address || {};
                const locality = addr.suburb || addr.neighbourhood || addr.city_district;

                let displayName = rawName;
                if (locality && !displayName.toLowerCase().includes(locality.toLowerCase())) {
                  displayName = `${displayName}, ${locality}`;
                }

                parsedResults.push({
                  name: displayName,
                  address: item.display_name || `${activeCity}, India`,
                  lat,
                  lng,
                  placeId: `nom_${item.place_id || idx}`,
                  category: formatOsmCategory(item.type, item.class) as any,
                });
              });
            }
          }
        } catch (nomErr: any) {
          if (nomErr.name === 'AbortError') return;
        }

        // 2. Secondary: Native expo-location geocodeAsync if needed
        if (parsedResults.length < 3 && !controller.signal.aborted) {
          try {
            const geocoded = await Location.geocodeAsync(`${trimmed}, ${activeCity}`);
            if (geocoded && geocoded.length > 0) {
              for (const item of geocoded.slice(0, 3)) {
                const exists = parsedResults.some((r) => Math.abs(r.lat - item.latitude) < 0.002 && Math.abs(r.lng - item.longitude) < 0.002);
                if (!exists) {
                  let placeTitle = trimmed;
                  try {
                    const rev = await Location.reverseGeocodeAsync({ latitude: item.latitude, longitude: item.longitude });
                    if (rev && rev[0]) {
                      const r = rev[0];
                      placeTitle = [r.name || r.street, r.subregion || r.district || r.city].filter(Boolean).join(', ') || trimmed;
                    }
                  } catch {}
                  parsedResults.push({
                    name: placeTitle,
                    address: `${trimmed}, ${activeCity}, India`,
                    lat: item.latitude,
                    lng: item.longitude,
                    placeId: `expo_${item.latitude}_${item.longitude}`,
                    category: 'Colony / Area' as any,
                  });
                }
              }
            }
          } catch {}
        }

        // 3. Fallback: Native expo-location geocodeAsync if still empty
        if (parsedResults.length === 0 && !controller.signal.aborted) {
          try {
            const geocoded = await Location.geocodeAsync(`${trimmed}, ${activeCity}, India`);
            if (geocoded && geocoded.length > 0) {
              geocoded.slice(0, 3).forEach((item, idx) => {
                parsedResults.push({
                  name: `${trimmed} (${activeCity})`,
                  address: `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}, ${activeCity}`,
                  lat: item.latitude,
                  lng: item.longitude,
                  placeId: `expo_${idx}`,
                  category: 'Address' as any,
                });
              });
            }
          } catch (expoErr) {
            // ignore
          }
        }

        if (!controller.signal.aborted) {
          setOnlineResults(parsedResults);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setOnlineResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingOnline(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeCity, initialLat, initialLng]);

  // Merge local curated places + online places into one comprehensive suggestions list
  const combinedPlaces: DisplayPlace[] = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return cityPlaces.map((cp) => ({
        name: cp.name,
        address: cp.address,
        lat: cp.lat,
        lng: cp.lng,
        category: cp.category || 'Metro Stop',
        placeId: `metro_${cp.name}`,
      }));
    }

    const merged: DisplayPlace[] = [];
    const seenNames = new Set<string>();

    // 1. Any matching curated metro stops first
    filteredLocalPlaces.forEach((lp) => {
      const key = lp.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        merged.push({
          name: lp.name,
          address: lp.address,
          lat: lp.lat,
          lng: lp.lng,
          category: lp.category || 'Metro Stop',
          placeId: `local_${lp.name}`,
        });
      }
    });

    // 2. All online address search results
    onlineResults.forEach((op) => {
      const key = op.name.toLowerCase().trim();
      // Skip if exact duplicate
      if (!seenNames.has(key)) {
        seenNames.add(key);
        merged.push({
          name: op.name,
          address: op.address || `${activeCity}, India`,
          lat: op.lat,
          lng: op.lng,
          category: op.category || 'Address',
          placeId: op.placeId || `online_${op.lat}_${op.lng}`,
        });
      }
    });

    return merged;
  }, [searchQuery, filteredLocalPlaces, onlineResults, cityPlaces, activeCity]);

  // Reverse geocode when map coordinates change (with Nominatim fallback)
  async function resolveAddressFromCoords(lat: number, lng: number) {
    setIsResolvingAddress(true);
    try {
      const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (addresses && addresses.length > 0) {
        const a = addresses[0];
        const primary = a.name || a.street || a.district;
        if (primary) {
          const secondary = [a.subregion || a.district, a.city || activeCity].filter(Boolean).join(', ');
          setMapAddress(`${primary}, ${secondary}`);
          setIsResolvingAddress(false);
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { 'User-Agent': 'LoRideApp/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          const parts = data.display_name.split(', ');
          const shortTitle = parts.slice(0, 3).join(', ');
          setMapAddress(shortTitle);
          setIsResolvingAddress(false);
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    setMapAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)} (${activeCity})`);
    setIsResolvingAddress(false);
  }

  // Use current GPS location
  async function handleUseCurrentLocation() {
    setLoadingCurrentLoc(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Location permission is needed to detect your current position.');
        setLoadingCurrentLoc(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      let resolvedName = 'Current Location';
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (rev && rev.length > 0) {
          const a = rev[0];
          resolvedName = [a.name || a.street, a.subregion || a.city].filter(Boolean).join(', ') || 'Current Location';
        }
      } catch (err) {
        // ignore
      }

      const result: LocationResult = {
        name: resolvedName,
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        lat,
        lng,
      };

      onSelect(result);
      setModalVisible(false);
      setSearchQuery('');
    } catch (e) {
      console.log('Location error:', e);
    } finally {
      setLoadingCurrentLoc(false);
    }
  }

  function handleSelectPlace(place: { name: string; address?: string; lat: number; lng: number }) {
    onSelect({
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    });
    setModalVisible(false);
    setSearchQuery('');
    setViewMode('search');
  }

  function handleOpenMap() {
    setViewMode('map');
    resolveAddressFromCoords(mapCenter.lat, mapCenter.lng);
  }

  function handleConfirmMapLocation() {
    onSelect({
      name: mapAddress,
      lat: mapCenter.lat,
      lng: mapCenter.lng,
    });
    setModalVisible(false);
    setViewMode('search');
    setSearchQuery('');
  }

  function handleWebViewMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationChange' && data.lat && data.lng) {
        setMapCenter({ lat: data.lat, lng: data.lng });
        resolveAddressFromCoords(data.lat, data.lng);
      }
    } catch (e) {
      // ignore
    }
  }

  const dotColor = markerColor || Colors.primary[500];

  // Leaflet Map HTML template - works across Android, iOS & Web without native crashes or Google Maps API key
  const leafletHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #f0f9ff;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var lat = ${mapCenter.lat};
    var lng = ${mapCenter.lng};
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([lat, lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var marker = L.marker([lat, lng], { draggable: true }).addTo(map);

    function notifyPosition(newLat, newLng) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'locationChange',
          lat: newLat,
          lng: newLng
        }));
      }
    }

    marker.on('dragend', function() {
      var pos = marker.getLatLng();
      notifyPosition(pos.lat, pos.lng);
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      notifyPosition(e.latlng.lat, e.latlng.lng);
    });

    map.on('moveend', function() {
      var center = map.getCenter();
      marker.setLatLng(center);
      notifyPosition(center.lat, center.lng);
    });
  </script>
</body>
</html>
`;

  return (
    <>
      {/* Input Trigger Button */}
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          setViewMode('search');
          setModalVisible(true);
        }}
        activeOpacity={0.85}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.pickerTextContainer}>
          <Text style={styles.pickerLabelSmall}>{label}</Text>
          <Text
            style={[styles.pickerText, !value && styles.pickerPlaceholder]}
            numberOfLines={1}
          >
            {value || `Enter ${label.toLowerCase()}...`}
          </Text>
        </View>
        {value ? (
          <TouchableOpacity
            style={styles.triggerClearBtn}
            onPress={(e) => {
              e.stopPropagation();
              onSelect({ name: '', address: '', lat: 0, lng: 0 });
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={18} color={Colors.neutral[400]} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : (
          <ChevronRight size={18} color={Colors.neutral[400]} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {/* Uber Style Location Selection Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          {viewMode === 'search' ? (
            /* ================= SEARCH LIST MODE (UBER STYLE) ================= */
            <View style={styles.searchViewContainer}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <X size={22} color={Colors.neutral[800]} strokeWidth={2.4} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Select {label}</Text>
                <View style={{ width: 32 }} />
              </View>

              {/* Search Input Box */}
              <View style={styles.searchBarWrapper}>
                <Search size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={`Search any address, colony, street, landmark, metro...`}
                  placeholderTextColor={Colors.neutral[400]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={true}
                  clearButtonMode="while-editing"
                />
                {isSearchingOnline ? (
                  <ActivityIndicator size="small" color={Colors.primary[600]} />
                ) : searchQuery ? (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={16} color={Colors.neutral[400]} strokeWidth={2} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Suggestions Column */}
              <FlatList
                data={combinedPlaces}
                keyExtractor={(item, index) => `${item.placeId || item.name}-${index}`}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                  <>
                    {/* "Use Current Location" Option */}
                    <TouchableOpacity
                      style={styles.currentLocRow}
                      onPress={handleUseCurrentLocation}
                      disabled={loadingCurrentLoc}
                      activeOpacity={0.7}
                    >
                      <View style={styles.currentLocIconBubble}>
                        {loadingCurrentLoc ? (
                          <ActivityIndicator size="small" color={Colors.primary[600]} />
                        ) : (
                          <Navigation size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                        )}
                      </View>
                      <View style={styles.currentLocTextWrap}>
                        <Text style={styles.currentLocTitle}>Use current location</Text>
                        <Text style={styles.currentLocSub}>Using GPS sensor</Text>
                      </View>
                      <ChevronRight size={16} color={Colors.neutral[400]} />
                    </TouchableOpacity>

                    {/* Quick Option: Use typed custom text */}
                    {searchQuery.trim().length >= 3 && (
                      <TouchableOpacity
                        style={styles.customQueryRow}
                        onPress={() => {
                          const topMatch = combinedPlaces[0];
                          if (topMatch && topMatch.lat && topMatch.lng) {
                            handleSelectPlace({
                              name: searchQuery.trim(),
                              address: topMatch.address || `${activeCity}, India`,
                              lat: topMatch.lat,
                              lng: topMatch.lng,
                            });
                          } else {
                            setMapAddress(`${searchQuery.trim()} (${activeCity})`);
                            handleOpenMap();
                          }
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.placePinBubble, { backgroundColor: Colors.primary[50] }]}>
                          <MapPin size={17} color={Colors.primary[600]} strokeWidth={2.2} />
                        </View>
                        <View style={styles.placeTextWrap}>
                          <Text style={[styles.placeName, { color: Colors.primary[700] }]}>
                            Use "{searchQuery.trim()}"
                          </Text>
                          <Text style={styles.placeAddress}>
                            Select this address or tap to pin exact spot on map
                          </Text>
                        </View>
                        <ChevronRight size={16} color={Colors.primary[500]} />
                      </TouchableOpacity>
                    )}

                    {/* Section Label */}
                    <View style={styles.sectionDividerRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.suggestionsHeader}>
                          {searchQuery.trim()
                            ? `All Locations & Addresses (${combinedPlaces.length})`
                            : `Popular Metro Stops in ${activeCity}`}
                        </Text>
                        {isSearchingOnline && (
                          <View style={styles.liveSearchBadge}>
                            <Text style={styles.liveSearchBadgeText}>Searching...</Text>
                          </View>
                        )}
                      </View>
                      {isSearchingOnline && (
                        <ActivityIndicator size="small" color={Colors.primary[500]} />
                      )}
                    </View>
                  </>
                }
                renderItem={({ item }) => {
                  const badgeStyle = getCategoryBadgeStyle(item.category);
                  return (
                    <TouchableOpacity
                      style={styles.placeItemRow}
                      onPress={() => handleSelectPlace(item)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.placePinBubble}>
                        <MapPin size={17} color={dotColor} strokeWidth={2.2} />
                      </View>
                      <View style={styles.placeTextWrap}>
                        <View style={styles.placeTitleRow}>
                          <Text style={styles.placeName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.category && (
                            <View style={[styles.categoryBadge, { backgroundColor: badgeStyle.bg }]}>
                              <Text style={[styles.categoryBadgeText, { color: badgeStyle.text }]}>
                                {item.category}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.placeAddress} numberOfLines={2}>
                          {item.address}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={Colors.neutral[300]} style={{ marginTop: 6 }} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.noResultsWrap}>
                    <Compass size={32} color={Colors.neutral[300]} strokeWidth={1.5} />
                    <Text style={styles.noResultsTitle}>
                      {isSearchingOnline ? 'Searching online addresses...' : 'No matching locations found'}
                    </Text>
                    <Text style={styles.noResultsSub}>
                      {isSearchingOnline
                        ? 'Connecting to map database...'
                        : 'Try typing a nearby landmark, society, or pin your exact location on the map below.'}
                    </Text>
                    {searchQuery.trim().length > 0 && !isSearchingOnline && (
                      <TouchableOpacity
                        style={styles.useQueryFallbackBtn}
                        onPress={() => {
                          setMapAddress(`${searchQuery.trim()} (${activeCity})`);
                          handleOpenMap();
                        }}
                      >
                        <Map size={16} color={Colors.primary[700]} strokeWidth={2} />
                        <Text style={styles.useQueryFallbackBtnText}>
                          Pin "{searchQuery.trim()}" on Map
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
                ListFooterComponent={
                  /* ================= BOTTOM OF COLUMN: SELECT ON MAP (UBER STYLE) ================= */
                  <View style={styles.bottomMapContainer}>
                    <TouchableOpacity
                      style={styles.chooseOnMapCard}
                      onPress={handleOpenMap}
                      activeOpacity={0.88}
                    >
                      <View style={styles.mapCardIconWrap}>
                        <Map size={22} color={Colors.primary[600]} strokeWidth={2.4} />
                      </View>
                      <View style={styles.mapCardTextWrap}>
                        <Text style={styles.chooseOnMapTitle}>Set location on Map</Text>
                        <Text style={styles.chooseOnMapSub}>
                          Drag pin to choose precise pickup or drop location
                        </Text>
                      </View>
                      <View style={styles.chooseOnMapArrow}>
                        <ChevronRight size={18} color={Colors.primary[600]} strokeWidth={2.4} />
                      </View>
                    </TouchableOpacity>
                  </View>
                }
              />
            </View>
          ) : (
            /* ================= INTERACTIVE LEAFLET MAP MODE ================= */
            <View style={styles.mapViewContainer}>
              {/* Map Top Header */}
              <View style={styles.mapHeader}>
                <TouchableOpacity
                  style={styles.backToSearchBtn}
                  onPress={() => setViewMode('search')}
                  activeOpacity={0.8}
                >
                  <ArrowLeft size={20} color={Colors.neutral[800]} strokeWidth={2.4} />
                  <Text style={styles.backToSearchText}>Search</Text>
                </TouchableOpacity>

                <Text style={styles.mapHeaderTitle}>Pin {label}</Text>

                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.mapCloseBtn}
                >
                  <X size={20} color={Colors.neutral[700]} />
                </TouchableOpacity>
              </View>

              {/* Center Map Helper Prompt */}
              <View style={styles.mapHelperBanner}>
                <Text style={styles.mapHelperText}>📍 Drag marker or tap anywhere to place pin</Text>
              </View>

              {/* Interactive Map powered by WebView Leaflet */}
              <View style={styles.mapWrapper}>
                {Platform.OS !== 'web' ? (
                  <WebView
                    style={styles.fullMap}
                    source={{ html: leafletHtml }}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    renderLoading={() => (
                      <View style={styles.mapLoadingOverlay}>
                        <ActivityIndicator size="large" color={Colors.primary[600]} />
                        <Text style={styles.mapLoadingText}>Loading map...</Text>
                      </View>
                    )}
                  />
                ) : (
                  <View style={styles.mapFallbackContainer}>
                    <Map size={48} color={Colors.primary[500]} />
                    <Text style={styles.mapFallbackTitle}>Map Pinning</Text>
                    <Text style={styles.mapFallbackSub}>
                      Select from popular metro hubs in {activeCity}:
                    </Text>
                    <View style={styles.fallbackGrid}>
                      {cityPlaces.slice(0, 8).map((p, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.fallbackPill}
                          onPress={() => {
                            setMapCenter({ lat: p.lat, lng: p.lng });
                            setMapAddress(p.name);
                          }}
                        >
                          <MapPin size={12} color={Colors.primary[600]} />
                          <Text style={styles.fallbackPillText} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Bottom Sheet Card for Map Mode */}
              <View style={styles.mapBottomCard}>
                <View style={styles.mapAddressHeader}>
                  <View style={[styles.mapAddressDot, { backgroundColor: dotColor }]} />
                  <View style={styles.mapAddressContent}>
                    <Text style={styles.mapAddressLabel}>{label.toUpperCase()}</Text>
                    <Text style={styles.mapAddressTitle} numberOfLines={2}>
                      {isResolvingAddress ? 'Detecting address...' : mapAddress}
                    </Text>
                    <Text style={styles.mapCoordsText}>
                      {mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.confirmMapBtn}
                  onPress={handleConfirmMapLocation}
                  activeOpacity={0.88}
                >
                  <Check size={18} color="#ffffff" strokeWidth={2.5} />
                  <Text style={styles.confirmMapBtnText}>Confirm {label}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger Button
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pickerTextContainer: {
    flex: 1,
  },
  pickerLabelSmall: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: Colors.neutral[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pickerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[900],
  },
  pickerPlaceholder: {
    color: Colors.neutral[400],
    fontFamily: 'Inter-Regular',
  },
  triggerClearBtn: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },

  // Modal Container
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // Search View
  searchViewContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
    letterSpacing: -0.3,
  },

  // Search Bar
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
    paddingVertical: 6,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
  },

  // List Content
  listContent: {
    paddingBottom: Spacing.xxl + 20,
  },

  // Current Location Row
  currentLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  currentLocIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocTextWrap: {
    flex: 1,
  },
  currentLocTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.primary[700],
  },
  currentLocSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[400],
    marginTop: 1,
  },

  // Custom Query Row
  customQueryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary[100],
  },

  // Section Header
  sectionDividerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  suggestionsHeader: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: Colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  liveSearchBadge: {
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  liveSearchBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    color: Colors.primary[700],
  },

  // Place Item Row
  placeItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  placePinBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  placeTextWrap: {
    flex: 1,
  },
  placeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'space-between',
  },
  placeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[900],
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  categoryBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    color: Colors.primary[700],
    letterSpacing: 0.2,
  },
  placeAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.neutral[500],
    marginTop: 3,
    lineHeight: 16,
  },

  // Empty State
  noResultsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  noResultsTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[800],
    marginTop: Spacing.sm,
  },
  noResultsSub: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[400],
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  useQueryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary[50],
    borderWidth: 1,
    borderColor: Colors.primary[200],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    marginTop: Spacing.md,
  },
  useQueryFallbackBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.primary[700],
  },

  // Bottom Column: Set Location on Map (Uber UX)
  bottomMapContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  chooseOnMapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  mapCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCardTextWrap: {
    flex: 1,
  },
  chooseOnMapTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
    marginBottom: 2,
  },
  chooseOnMapSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[500],
  },
  chooseOnMapArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },

  // Map Mode Styles
  mapViewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backToSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backToSearchText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.sm,
    color: Colors.neutral[800],
  },
  mapHeaderTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
  },
  mapCloseBtn: {
    padding: 6,
  },
  mapHelperBanner: {
    backgroundColor: Colors.primary[600],
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapHelperText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#ffffff',
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  fullMap: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f9ff',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapLoadingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.neutral[600],
  },
  mapFallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: Spacing.xl,
  },
  mapFallbackTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.lg,
    color: Colors.neutral[900],
    marginTop: Spacing.md,
  },
  mapFallbackSub: {
    fontFamily: 'Inter-Regular',
    fontSize: FontSizes.xs,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  fallbackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  fallbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary[200],
    maxWidth: 160,
  },
  fallbackPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.primary[700],
  },

  // Map Bottom Sheet
  mapBottomCard: {
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[200],
    ...Shadow.lg,
  },
  mapAddressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  mapAddressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  mapAddressContent: {
    flex: 1,
  },
  mapAddressLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: Colors.neutral[400],
    letterSpacing: 0.5,
  },
  mapAddressTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSizes.md,
    color: Colors.neutral[900],
    marginTop: 2,
  },
  mapCoordsText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  confirmMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary[600],
    borderRadius: Radius.md,
    minHeight: 52,
    paddingVertical: 10,
    ...Shadow.md,
  },
  confirmMapBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: FontSizes.md,
    color: '#ffffff',
  },
});
