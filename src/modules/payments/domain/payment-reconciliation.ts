import type { PaymentAttempt, PaymentCloseReason, PaymentLink, PaymentState } from './payment';

const CLOSED_LINKS = new Set<PaymentLink['status']>(['CANCELLED', 'EXPIRED', 'FAILED']);

export function nextPaymentCheck(
  now: Date,
  expiresAt: Date,
  closeRequested: boolean,
  observation: PaymentLink | null | undefined,
): Date {
  const retryAt = now.getTime() + (observation === undefined ? 45_000 : 75_000);
  return new Date(
    closeRequested || expiresAt <= now ? retryAt : Math.min(retryAt, expiresAt.getTime()),
  );
}

export function canApplySingleTransfer(observation: PaymentLink): boolean {
  return (
    observation.status === 'PAID' &&
    observation.amountPaid === observation.amount &&
    observation.transfers.length === 1
  );
}

export function reconcilePaymentAttempt(
  attempt: Pick<PaymentAttempt, 'state' | 'closeReason' | 'reviewReason' | 'linkId'>,
  observation: PaymentLink | null | undefined,
  credits: { unresolved: boolean; allRefunded: boolean; hasRefund: boolean },
): { state: PaymentState; closeReason?: PaymentCloseReason; reviewReason?: string | null } {
  if (attempt.state === 'PAID') return { state: 'PAID' };

  const terminalLink = !!observation && CLOSED_LINKS.has(observation.status);
  const providerClosed = observation
    ? terminalLink || (observation.status === 'PAID' && credits.hasRefund)
    : observation === null && !attempt.linkId;
  const providerCleared = observation ? credits.allRefunded : providerClosed;
  let closeReason: PaymentCloseReason | undefined;
  if (providerClosed && providerCleared && !credits.unresolved) {
    closeReason =
      attempt.closeReason ??
      (terminalLink ? (observation.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED') : undefined);
  }

  const needsReview = !!observation && observation.amountPaid > 0 && !credits.allRefunded;
  const canResume =
    attempt.state === 'REVIEW' &&
    attempt.reviewReason === 'LINK_MISMATCH' &&
    !attempt.closeReason &&
    !credits.unresolved &&
    observation?.status === 'PENDING' &&
    observation.amountPaid === 0 &&
    observation.transfers.length === 0;
  const state =
    needsReview || (attempt.state === 'REVIEW' && !canResume)
      ? 'REVIEW'
      : observation
        ? 'PENDING'
        : attempt.state;
  const reviewReason = canResume
    ? null
    : needsReview && !attempt.reviewReason
      ? 'INCOMPLETE_PROVIDER_DATA'
      : undefined;
  return { state, closeReason, reviewReason };
}
