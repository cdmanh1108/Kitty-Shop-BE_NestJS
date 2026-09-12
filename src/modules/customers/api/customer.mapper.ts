import type {
  AddCustomerNoteInput,
  CreateCustomerInput,
  CustomerAddressInput,
  CustomerListQuery,
  CustomerLookupQuery,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from '../application/customer.contracts';
import type {
  AddCustomerNoteReqDto,
  CreateCustomerReqDto,
  CustomerAddressReqDto,
  CustomerListQueryDto,
  CustomerLookupQueryDto,
  UpdateCustomerAddressReqDto,
  UpdateCustomerReqDto,
} from './customer.dto';

export function toAddCustomerNoteInput(dto: AddCustomerNoteReqDto): AddCustomerNoteInput {
  return { content: dto.content, isPinned: dto.isPinned ?? false };
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
export function toCustomerLookupQuery(dto: CustomerLookupQueryDto): CustomerLookupQuery {
  return { search: dto.search?.trim() || undefined, limit: dto.limit ?? 20 };
}
export function toUpdateCustomerInput(dto: UpdateCustomerReqDto): UpdateCustomerInput {
  return { ...dto };
}
