import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  AddFlight: undefined;
  FlightDetail: { flightId: string };
  InFlight: { flightId: string };
  POIDetail: { poiId: string; flightId: string };
  FlightSummary: { flightId: string };
  Collection: undefined;
  Paywall: undefined;
  Wrapped: undefined;
  Settings: undefined;
  Browse: undefined;
  Simulator: undefined;
  WorldMap: undefined;
  Referral: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type AddFlightScreenProps = NativeStackScreenProps<RootStackParamList, 'AddFlight'>;
export type FlightDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'FlightDetail'>;
export type InFlightScreenProps = NativeStackScreenProps<RootStackParamList, 'InFlight'>;
export type POIDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'POIDetail'>;
export type FlightSummaryScreenProps = NativeStackScreenProps<RootStackParamList, 'FlightSummary'>;
export type CollectionScreenProps = NativeStackScreenProps<RootStackParamList, 'Collection'>;
export type PaywallScreenProps = NativeStackScreenProps<RootStackParamList, 'Paywall'>;
export type WrappedScreenProps = NativeStackScreenProps<RootStackParamList, 'Wrapped'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type BrowseScreenProps = NativeStackScreenProps<RootStackParamList, 'Browse'>;
export type SimulatorScreenProps = NativeStackScreenProps<RootStackParamList, 'Simulator'>;
export type WorldMapScreenProps = NativeStackScreenProps<RootStackParamList, 'WorldMap'>;
export type ReferralScreenProps = NativeStackScreenProps<RootStackParamList, 'Referral'>;
