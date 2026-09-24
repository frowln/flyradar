import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  /** `takeoff`: open the "when did you take off?" sheet for this flight. */
  Board: { takeoff?: string } | undefined;
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
  Licenses: undefined;
  People: undefined;
  Person: { userId: string };
};
