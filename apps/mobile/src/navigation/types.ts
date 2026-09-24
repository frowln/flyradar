import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Board: undefined;
  Atlas: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  AddFlight: { returnOf?: string } | undefined;
  InFlight: { flightId: string };
  POIDetail: { poiId: string; flightId: string };
  FlightSummary: { flightId: string };
  Achievements: undefined;
  Paywall: undefined;
  Settings: undefined;
  People: undefined;
  Person: { userId: string };
};
