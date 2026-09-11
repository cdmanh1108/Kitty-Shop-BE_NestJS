import type {
  UpdateRentalPolicyInput,
  UpdateShopInput,
  UpsertSettingInput,
} from '../application/settings.contracts';
import type { UpdateRentalPolicyReqDto } from './rental-policy.dto';
import type { UpdateShopReqDto, UpsertSettingReqDto } from './settings.dto';

export function toUpdateShopInput(dto: UpdateShopReqDto): UpdateShopInput {
  return { ...dto };
}

export function toUpsertSettingInput(dto: UpsertSettingReqDto): UpsertSettingInput {
  return { ...dto };
}

export function toUpdateRentalPolicyInput(dto: UpdateRentalPolicyReqDto): UpdateRentalPolicyInput {
  return {
    rentalPricing: dto.rentalPricing ? { ...dto.rentalPricing } : undefined,
    deposit: dto.deposit
      ? {
          allowedMethods: dto.deposit.allowedMethods ? [...dto.deposit.allowedMethods] : undefined,
          allowedDocumentTypes: dto.deposit.allowedDocumentTypes
            ? [...dto.deposit.allowedDocumentTypes]
            : undefined,
          defaultCashDeposit: dto.deposit.defaultCashDeposit,
          categoryOverrides: dto.deposit.categoryOverrides
            ? dto.deposit.categoryOverrides.map((override) => ({ ...override }))
            : undefined,
        }
      : undefined,
    reschedule: dto.reschedule ? { ...dto.reschedule } : undefined,
    lateReturn: dto.lateReturn ? { ...dto.lateReturn } : undefined,
    specialCleaning: dto.specialCleaning ? { ...dto.specialCleaning } : undefined,
    loyalty: dto.loyalty ? { ...dto.loyalty } : undefined,
  };
}
