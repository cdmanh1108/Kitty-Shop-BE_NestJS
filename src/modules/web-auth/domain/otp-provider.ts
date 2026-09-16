export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
/** Auth owns challenge verification; adapters own code generation and SMS delivery. */
export interface OtpProvider {
  generateCode(): string;
  send(phone: string, code: string, challengeId: string): Promise<void>;
}
