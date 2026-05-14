/**
 * Navigation route parameter contracts.
 * Centralized here so screens can import strongly-typed props.
 */

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppTabParamList = {
  Dashboard: undefined;
  Missions: undefined;
  Alerts: undefined;
  OperationalLogTab: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  RoundDetail: { roundId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList {}
  }
}
