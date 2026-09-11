import type { UpdateShopInput, UpsertSettingInput } from '../application/settings.contracts';
import type { UpdateShopReqDto, UpsertSettingReqDto } from './settings.dto';

export function toUpdateShopInput(dto: UpdateShopReqDto): UpdateShopInput {
  return { ...dto };
}
export function toUpsertSettingInput(dto: UpsertSettingReqDto): UpsertSettingInput {
  return { ...dto };
}
