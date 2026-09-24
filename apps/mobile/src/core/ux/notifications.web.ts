/** Browser preview: no local notifications. */
export interface LocalAlert {
  id: string;
  at: Date;
  title: string;
  body: string;
}
export async function notificationPermission(_ask: boolean): Promise<boolean> {
  return false;
}
export async function scheduleAlerts(_alerts: LocalAlert[]): Promise<string[]> {
  return [];
}
export async function cancelAlerts(_ids: string[]): Promise<void> {}
