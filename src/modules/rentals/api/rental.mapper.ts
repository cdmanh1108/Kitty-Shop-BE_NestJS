import type {
  AddRentalChargeInput,
  CreateRentalItemInput,
  CreateRentalOrderInput,
  RentalChargeInput,
  RentalDeliveryInput,
  RentalListQuery,
  RescheduleRentalInput,
  TransitionRentalInput,
} from '../application/rental.contracts';
import type {
  AddRentalChargeReqDto,
  CreateRentalItemReqDto,
  CreateRentalOrderReqDto,
  RentalChargeReqDto,
  RentalDeliveryReqDto,
  RentalListQueryDto,
  RescheduleRentalReqDto,
  TransitionRentalReqDto,
} from './rental.dto';

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
