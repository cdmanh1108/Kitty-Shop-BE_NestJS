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
    rentalPricing: dto.rentalPricing
      ? {
          defaultRentalPrice: dto.rentalPricing.defaultRentalPrice,
          additionalDayFee: dto.rentalPricing.additionalDayFee,
        }
      : undefined,
    deposit: dto.deposit ? { defaultCashDeposit: dto.deposit.defaultCashDeposit } : undefined,
  };
}
