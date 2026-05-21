export interface PushSubscriptionKeysDTO {
  p256dh: string;
  auth: string;
}

export interface RegistrarPushSubscriptionDTO {
  endpoint: string;
  expirationTime: number | null;
  keys: PushSubscriptionKeysDTO;
  userAgent?: string;
  deviceLabel?: string;
}

export interface RemoverPushSubscriptionDTO {
  endpoint: string;
}

export interface PushSubscriptionResponse {
  message: string;
}
