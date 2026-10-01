import { ApplicationError, type ApplicationErrorKind } from '@common/errors/application-error';

export const WEB_AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_EMAIL: 'Email không hợp lệ.',
  INVALID_PASSWORD: 'Mật khẩu phải có từ 8 đến 64 ký tự và tối đa 72 byte UTF-8.',
  EMAIL_ALREADY_REGISTERED: 'Email này đã được đăng ký. Vui lòng đăng nhập để tiếp tục.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác.',
  EMAIL_NOT_VERIFIED: 'Email của tài khoản này chưa được xác minh.',
  ACCOUNT_DISABLED: 'Tài khoản này đã bị vô hiệu hóa.',
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  OTP_CHALLENGE_NOT_FOUND: 'Không tìm thấy yêu cầu xác minh. Vui lòng yêu cầu mã mới.',
  OTP_EXPIRED: 'Mã xác minh đã hết hạn. Vui lòng yêu cầu mã mới.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã thử quá nhiều lần. Vui lòng yêu cầu mã mới.',
  OTP_CONSUMED: 'Mã xác minh đã được sử dụng. Vui lòng yêu cầu mã mới.',
  OTP_INVALID: 'Mã xác minh không chính xác.',
  OTP_RESEND_TOO_SOON: 'Vui lòng đợi trước khi yêu cầu mã xác minh khác.',
  VERIFICATION_DELIVERY_FAILED: 'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.',
  EMAIL_ALREADY_VERIFIED: 'Email này đã được xác minh. Vui lòng đăng nhập.',
};

export class WebAuthApplicationError extends ApplicationError {
  readonly kind: ApplicationErrorKind;

  constructor(code: string) {
    const kind = webAuthErrorKind(code);
    super(WEB_AUTH_ERROR_MESSAGES[code] ?? 'Không thể hoàn tất yêu cầu.', code, undefined, {
      exposeOnServerError: code === 'VERIFICATION_DELIVERY_FAILED',
    });
    this.kind = kind;
  }
}

function webAuthErrorKind(code: string): ApplicationErrorKind {
  switch (code) {
    case 'EMAIL_ALREADY_REGISTERED':
      return 'CONFLICT';
    case 'INVALID_CREDENTIALS':
    case 'AUTH_REQUIRED':
      return 'UNAUTHORIZED';
    case 'ACCOUNT_DISABLED':
    case 'EMAIL_NOT_VERIFIED':
      return 'FORBIDDEN';
    case 'OTP_RESEND_TOO_SOON':
      return 'TOO_MANY_REQUESTS';
    case 'VERIFICATION_DELIVERY_FAILED':
      return 'UNAVAILABLE';
    default:
      return 'VALIDATION';
  }
}

export function webAuthError(code: string): never {
  throw new WebAuthApplicationError(code);
}
