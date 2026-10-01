import { ApplicationError } from '@common/errors/application-error';

export class MemberEmailAlreadyUsedError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super('Email này đã được sử dụng bởi một thành viên của cửa hàng.');
  }
}

export class MemberRoleSelectionError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor(message = 'Một hoặc nhiều vai trò không tồn tại.', code?: string) {
    super(message, code);
  }
}

export class MemberSelfDeactivationError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor() {
    super('Bạn không thể vô hiệu hóa tư cách thành viên hiện tại của chính mình.');
  }
}

export class MemberNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy thành viên hoặc vai trò.');
  }
}
