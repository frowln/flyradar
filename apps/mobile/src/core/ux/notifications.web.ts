/** Browser preview: no local notifications. */
export interface AlertData {
  kind: 'sight' | 'flight' | 'takeoff' | 'seat';
  flightId: string;
  poiId?: string;
}
export interface LocalAlert {
  id: string;
  at: Date;
  title: string;
  body: string;
  data?: AlertData;
  category?: string;
}
export interface AlertResponse {
  data: AlertData;
  action: string | null;
}
export async function notificationPermission(_ask: boolean): Promise<boolean> {
  return false;
}
export async function scheduleAlerts(_alerts: LocalAlert[]): Promise<string[]> {
  return [];
}
export async function cancelAlerts(_ids: string[]): Promise<void> {}
export async function registerCategory(_id: string, _actions: Array<{ id: string; title: string }>): Promise<void> {}
export function onNotificationResponse(_handle: (r: AlertResponse) => void): () => void {
  return () => {};
}
