export const VERIFICATION_CODE_SENDER = Symbol('VERIFICATION_CODE_SENDER');
export const VERIFICATION_CODE_GENERATOR = Symbol('VERIFICATION_CODE_GENERATOR');

export interface VerificationCodeSender {
  send(destination: string, code: string, challengeId: string): Promise<void>;
}

export class VerificationCodeDeliveryError extends Error {
  constructor(readonly reason: 'provider_rejected' | 'provider_unavailable') {
    super('Verification code delivery failed');
    this.name = 'VerificationCodeDeliveryError';
  }
}

export interface VerificationCodeGenerator {
  generate(): string;
}
