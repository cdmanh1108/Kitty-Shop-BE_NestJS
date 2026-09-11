import type { ChangePasswordInput, LoginInput } from '../application/auth.contracts';
import type { ChangePasswordReqDto, LoginReqDto } from './auth.dto';

export function toChangePasswordInput(dto: ChangePasswordReqDto): ChangePasswordInput {
  return { ...dto };
}
export function toLoginInput(dto: LoginReqDto): LoginInput {
  return { ...dto };
}
