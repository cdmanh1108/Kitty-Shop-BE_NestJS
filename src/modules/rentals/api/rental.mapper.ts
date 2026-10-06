import type {
  AddRentalChargeInput,
  CreateRentalItemInput,
  CreateRentalOrderInput,
  RentalChargeInput,
  RentalDeliveryInput,
  RentalListQuery,
  RescheduleRentalInput,
  ReturnRentalOrderInput,
  TransitionRentalInput,
  SettleRentalOrderInput,
} from '../application/rental.contracts';
import type {
  AddRentalChargeReqDto,
  RescheduleRentalReqDto,
  TransitionRentalReqDto,
} from './admin/dto/rental-lifecycle.dto';
import type {
  CreateRentalItemReqDto,
  CreateRentalOrderReqDto,
  RentalChargeReqDto,
  RentalDeliveryReqDto,
} from './admin/dto/rental-creation.dto';
import type { RentalListQueryDto } from './admin/dto/rental-order.dto';
import type { ReturnRentalOrderReqDto } from './admin/dto/rental-return.dto';
import type { SettleRentalOrderReqDto } from './admin/dto/rental-settlement.dto';

export function toSettleRentalOrderInput(dto: SettleRentalOrderReqDto): SettleRentalOrderInput {
  return {
    paymentMethod: dto.paymentMethod,
    note: dto.note,
    returnDocumentCollateral: dto.returnDocumentCollateral,
    feePreviewToken: dto.feePreviewToken,
    feeOverrides: dto.feeOverrides?.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      amount: item.amount,
      reason: item.reason,
    })),
  };
}

export function toAddRentalChargeInput(dto: AddRentalChargeReqDto): AddRentalChargeInput {
  return { ...dto };
}
export function toCreateRentalOrderInput(dto: CreateRentalOrderReqDto): CreateRentalOrderInput {
  return {
    ...dto,
    items: Array.isArray(dto.items) ? dto.items.map(toCreateRentalItemInput) : dto.items,
    charges: Array.isArray(dto.charges) ? dto.charges.map(toRentalChargeInput) : dto.charges,
    delivery: dto.delivery ? toRentalDeliveryInput(dto.delivery) : dto.delivery,
  };
}
export function toCreateRentalItemInput(dto: CreateRentalItemReqDto): CreateRentalItemInput {
  return { ...dto };
}
export function toRentalChargeInput(dto: RentalChargeReqDto): RentalChargeInput {
  return { ...dto };
}
export function toRentalDeliveryInput(dto: RentalDeliveryReqDto): RentalDeliveryInput {
  return { ...dto };
}
export function toRentalListQuery(dto: RentalListQueryDto): RentalListQuery {
  return { ...dto };
}
export function toRescheduleRentalInput(dto: RescheduleRentalReqDto): RescheduleRentalInput {
  return { ...dto };
}
export function toTransitionRentalInput(dto: TransitionRentalReqDto): TransitionRentalInput {
  return { ...dto };
}

export function toReturnRentalOrderInput(dto: ReturnRentalOrderReqDto): ReturnRentalOrderInput {
  return {
    actualReturnedAt: dto.actualReturnedAt ? new Date(dto.actualReturnedAt) : undefined,
    inspections: dto.inspections.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      condition: item.condition as ReturnRentalOrderInput['inspections'][number]['condition'],
      note: item.note,
      lateFeeOverride: item.lateFeeOverride ? { ...item.lateFeeOverride } : undefined,
      charge: item.charge
        ? {
            chargeType: item.charge.chargeType,
            amount: item.charge.amount,
            description: item.charge.reason,
          }
        : undefined,
    })),
    manualCharges: dto.manualCharges?.map((charge) => ({
      chargeType: charge.chargeType,
      description: charge.description,
      amount: charge.amount,
      quantity: charge.quantity,
    })),
    note: dto.note,
    feePreviewToken: dto.feePreviewToken,
  };
}
