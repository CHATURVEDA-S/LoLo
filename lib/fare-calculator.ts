/**
 * Dynamic Fare and Route Distance Calculator for Lo_Ride.
 * 
 * Implements real-time distance-tiered and traffic-aware pricing:
 * - Bike: ₹7.00 to ₹9.00 / km (e.g. ~3 km peak: ₹9.00/km, ~6 km: ₹8.00-₹8.50/km)
 * - Car: ₹10.50 to ₹16.50 / km (e.g. short trip peak: ₹16.50/km, medium: ₹12.00-₹14.50/km, long: ₹10.50/km)
 * - Any vehicle: balanced commuter rate
 */

export interface FareCalculationOptions {
  distanceKm?: number;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  vehicleType?: 'car' | 'bike' | 'any' | string;
  city?: string;
  departureTime?: string | Date;
}

export interface FareCalculationResult {
  distanceKm: number;
  ratePerKm: number;
  isPeakHour: boolean;
  trafficStatus: 'normal' | 'peak';
  trafficDescription: string;
  suggestedFare: number;
  currency: string;
}

/**
 * Calculates straight-line distance using Haversine formula and converts to
 * realistic road distance using urban curvature factor (1.28x).
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLine = R * c;

  // Road curvature factor in Indian cities (~1.28x)
  const roadDistance = straightLine * 1.28;
  return Math.round(roadDistance * 10) / 10;
}

/**
 * Checks if the given date/time falls within peak traffic rush hours.
 * Morning Peak: 08:00 - 11:00 AM
 * Evening Peak: 17:00 - 21:00 PM (5 PM - 9 PM)
 */
export function isPeakTrafficHour(dateInput?: string | Date): boolean {
  const date = dateInput ? new Date(dateInput) : new Date();
  const hours = date.getHours();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  if (isWeekend) {
    // Weekend evening rush: 18:00 - 21:30
    return hours >= 18 && hours < 22;
  }

  // Weekday morning rush (8am to 11am) & evening rush (5pm to 9pm)
  return (hours >= 8 && hours < 11) || (hours >= 17 && hours < 21);
}

/**
 * Computes suggested fare based on live distance, vehicle type, and peak traffic:
 * 
 * CAR: ₹10.50 to ₹16.50 / km (decreased by ₹1.50)
 * - Short trip (≤ 4 km): Peak ₹16.50 / km, Normal ₹13.50 / km
 * - Medium trip (4 to 8 km): Peak ₹14.50 / km, Normal ₹12.00 / km
 * - Long trip (> 8 km): Peak ₹12.50 / km, Normal ₹10.50 / km
 * 
 * BIKE: ₹7.00 to ₹9.00 / km (decreased by ₹1.50)
 * - Short trip (≤ 4 km): Peak ₹9.00 / km, Normal ₹7.50 / km
 * - Medium trip (4 to 8 km): Peak ₹8.50 / km, Normal ₹8.00 / km
 * - Long trip (> 8 km): Peak ₹7.50 / km, Normal ₹7.00 / km
 */
export function calculateFare(options: FareCalculationOptions): FareCalculationResult {
  let distanceKm = options.distanceKm ?? 0;

  if (
    (!distanceKm || distanceKm <= 0) &&
    options.originLat &&
    options.originLng &&
    options.destLat &&
    options.destLng
  ) {
    distanceKm = calculateDistanceKm(
      options.originLat,
      options.originLng,
      options.destLat,
      options.destLng
    );
  }

  const isPeak = isPeakTrafficHour(options.departureTime);
  const vehicle = options.vehicleType?.toLowerCase() || 'car';
  const isBike = vehicle === 'bike';

  let ratePerKm: number;
  let minFare: number;

  if (isBike) {
    minFare = 15;
    // Bike: ₹7.00 to ₹9.00 / km (reduced by ₹1.50)
    if (distanceKm <= 4) {
      ratePerKm = isPeak ? 9.00 : 7.50;
    } else if (distanceKm <= 8) {
      ratePerKm = isPeak ? 8.50 : 8.00;
    } else {
      ratePerKm = isPeak ? 7.50 : 7.00;
    }
  } else {
    // Car: ₹10.50 to ₹16.50 / km (reduced by ₹1.50)
    minFare = 50;
    if (distanceKm <= 4) {
      ratePerKm = isPeak ? 16.50 : 13.50;
    } else if (distanceKm <= 8) {
      ratePerKm = isPeak ? 14.50 : 12.00;
    } else {
      ratePerKm = isPeak ? 12.50 : 10.50;
    }
  }

  const trafficStatus: 'normal' | 'peak' = isPeak ? 'peak' : 'normal';
  const trafficDescription = isPeak ? 'Peak Traffic' : 'Normal Traffic';

  // Calculate fare with half-rupee precision or whole rupee
  let rawFare = distanceKm * ratePerKm;
  let suggestedFare = Math.round(rawFare * 2) / 2;

  if (suggestedFare < minFare && distanceKm > 0) {
    suggestedFare = minFare;
  } else if (distanceKm <= 0) {
    suggestedFare = 0;
  }

  return {
    distanceKm,
    ratePerKm,
    isPeakHour: isPeak,
    trafficStatus,
    trafficDescription,
    suggestedFare,
    currency: '₹',
  };
}
