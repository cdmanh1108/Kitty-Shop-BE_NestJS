import type {
  AddCustomerNoteInput,
  CreateCustomerInput,
  CustomerAddressInput,
  CustomerListQuery,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from '../application/customer.contracts';
import type {
  AddCustomerNoteReqDto,
  CreateCustomerReqDto,
  CustomerAddressReqDto,
  CustomerListQueryDto,
  UpdateCustomerAddressReqDto,
  UpdateCustomerReqDto,
} from './customer.dto';

export function toAddCustomerNoteInput(dto: AddCustomerNoteReqDto): AddCustomerNoteInput {
  return { ...dto };
}
export function toCustomerAddressInput(dto: CustomerAddressReqDto): CustomerAddressInput {
  return { ...dto };
}
export function toUpdateCustomerAddressInput(
  dto: UpdateCustomerAddressReqDto,
): UpdateCustomerAddressInput {
  return { ...dto };
}
export function toCreateCustomerInput(dto: CreateCustomerReqDto): CreateCustomerInput {
  return { ...dto };
}
export function toCustomerListQuery(dto: CustomerListQueryDto): CustomerListQuery {
  return { ...dto };
}
export function toUpdateCustomerInput(dto: UpdateCustomerReqDto): UpdateCustomerInput {
  return { ...dto };
}
