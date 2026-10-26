import { GarminRideStatus } from './garmin-inbox.service';
import { PolarRideStatus } from './polar-inbox.service';
import { WahooRideStatus } from './wahoo-inbox.service';

export interface InboxRide extends GarminRideStatus {
  provider: 'Garmin' | 'Polar' | 'Wahoo';
  key: string;
  name?: string;
}

export function garminRide(ride: GarminRideStatus): InboxRide {
  return { ...ride, provider: 'Garmin', key: `garmin:${ride.id}` };
}

export function polarRide(ride: PolarRideStatus): InboxRide {
  return {
    ...ride, provider: 'Polar', key: `polar:${ride.id}`,
    rideStart: ride.startTime ? Date.parse(ride.startTime) / 1000 : 0,
    lastReceivedAt: ride.startTime, inboxStatus: ride.status
  };
}

export function wahooRide(ride: WahooRideStatus): InboxRide {
  return { ...ride, provider: 'Wahoo', key: `wahoo:${ride.id}`,
    rideStart: ride.startTime ? Date.parse(ride.startTime) / 1000 : 0,
    lastReceivedAt: ride.startTime, inboxStatus: ride.status };
}
