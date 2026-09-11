import type { CreateMemberInput, UpdateMemberInput } from '../application/member.contracts';
import type { CreateMemberReqDto, UpdateMemberReqDto } from './member.dto';

export function toCreateMemberInput(dto: CreateMemberReqDto): CreateMemberInput {
  return { ...dto };
}
export function toUpdateMemberInput(dto: UpdateMemberReqDto): UpdateMemberInput {
  return { ...dto };
}
