import { ApplicationError } from '@common/errors/application-error';

export class MemberEmailAlreadyUsedError extends ApplicationError {
  constructor() {
    super('Email này đã được sử dụng bởi một thành viên của cửa hàng.');
  }
}

export class MemberRoleSelectionError extends ApplicationError {
  constructor(message = 'Một hoặc nhiều vai trò không tồn tại.', code?: string) {
    super(message, code);
  }
}

export class MemberSelfDeactivationError extends ApplicationError {
  constructor() {
    super('Bạn không thể vô hiệu hóa tư cách thành viên hiện tại của chính mình.');
  }
}

export class MemberNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy thành viên hoặc vai trò.');
  }
}
