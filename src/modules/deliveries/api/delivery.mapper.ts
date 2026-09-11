import type {
  CreateDeliveryInput,
  UpdateDeliveryStatusInput,
} from '../application/delivery.contracts';
import type { CreateDeliveryReqDto, UpdateDeliveryStatusReqDto } from './delivery.dto';

export function toCreateDeliveryInput(dto: CreateDeliveryReqDto): CreateDeliveryInput {
  return { ...dto };
}
export function toUpdateDeliveryStatusInput(
  dto: UpdateDeliveryStatusReqDto,
): UpdateDeliveryStatusInput {
  return { ...dto };
}
