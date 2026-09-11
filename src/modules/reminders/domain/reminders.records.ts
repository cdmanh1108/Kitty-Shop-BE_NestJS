import type { JsonValue } from '@common/types/json';

export interface ReminderRecord {
  id: string;
  shopId: string;
  orderId: string | null;
  customerId: string | null;
  dedupeKey: string;
  type: string;
  scheduledFor: Date;
  status: string;
  priority: number;
  title: string;
  content: string | null;
  metadata: JsonValue | null;
  createdAt: Date;
  processedAt: Date | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
}
