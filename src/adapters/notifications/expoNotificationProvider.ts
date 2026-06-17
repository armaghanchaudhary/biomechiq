// src/adapters/notifications/expoNotificationProvider.ts
// NotificationProvider adapter backed by expo-notifications. Handles permission
// prompts, immediate local notifications, and Expo push-token registration.

import * as Notifications from 'expo-notifications';
import type { NotificationProvider } from '@/ports';

/**
 * The slice of expo-notifications this adapter depends on, declared locally so the
 * adapter can be exercised with a fake in unit tests (Expo native modules can't
 * load under vitest).
 */
export interface ExpoNotificationsLike {
  getPermissionsAsync(): Promise<{ status: string; granted?: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string; granted?: boolean }>;
  scheduleNotificationAsync(request: {
    content: { title: string; body: string };
    trigger: null;
  }): Promise<string>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
}

export interface ExpoNotificationProviderOptions {
  /** EAS projectId required by getExpoPushTokenAsync on SDK 49+. */
  projectId?: string;
}

const GRANTED = 'granted';

export class ExpoNotificationProvider implements NotificationProvider {
  private readonly api: ExpoNotificationsLike;
  private readonly projectId?: string;

  constructor(
    api: ExpoNotificationsLike = Notifications as unknown as ExpoNotificationsLike,
    options: ExpoNotificationProviderOptions = {},
  ) {
    this.api = api;
    this.projectId = options.projectId;
  }

  async requestPermission(): Promise<boolean> {
    const existing = await this.api.getPermissionsAsync();
    if (this.isGranted(existing)) return true;
    const requested = await this.api.requestPermissionsAsync();
    return this.isGranted(requested);
  }

  async notify(title: string, body: string): Promise<void> {
    await this.api.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // null trigger => deliver immediately
    });
  }

  async registerForPush(): Promise<string | null> {
    if (!(await this.requestPermission())) return null;
    try {
      const token = await this.api.getExpoPushTokenAsync(
        this.projectId ? { projectId: this.projectId } : undefined,
      );
      return token.data ?? null;
    } catch {
      // Push tokens are unavailable on simulators / web; degrade gracefully.
      return null;
    }
  }

  private isGranted(status: { status: string; granted?: boolean }): boolean {
    return status.granted === true || status.status === GRANTED;
  }
}
