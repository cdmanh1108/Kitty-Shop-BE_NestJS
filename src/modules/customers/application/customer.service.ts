import { CUSTOMER_STATUS } from '../domain/customer-status';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../domain/customer.repository';
import { CustomerPhoneAlreadyExistsError } from '../domain/customer-errors';
import { InvalidCustomerPhoneError, normalizeCustomerPhone } from '../domain/customer-phone';
import type {
  AddCustomerNoteInput,
  CreateCustomerInput,
  CustomerAddressInput,
  CustomerListQuery,
  CustomerLookupQuery,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from './customer.contracts';

@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repository: CustomerRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  list(user: CurrentUser, query: CustomerListQuery) {
    return this.repository.list({ shopId: user.shopId, ...query });
  }

  lookup(user: CurrentUser, query: CustomerLookupQuery) {
    return this.repository.lookup({ shopId: user.shopId, ...query });
  }

  async get(user: CurrentUser, id: string) {
    const customer = await this.repository.findById(user.shopId, id);
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng.');
    return customer;
  }

  async create(user: CurrentUser, input: CreateCustomerInput) {
    const normalizedPhone = this.normalizePhone(input.phone);
    const duplicate = await this.repository.findByNormalizedPhone(user.shopId, normalizedPhone);
    if (duplicate) this.throwPhoneConflict(duplicate.id);
    const customer = await this.withPhoneConflict(() =>
      this.repository.create(user.shopId, {
        customerCode: `CUS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        normalizedPhone,
        email: input.email?.trim().toLowerCase() || null,
        facebook: input.facebook?.trim() || null,
        zalo: input.zalo?.trim() || null,
        birthday: input.birthday ? new Date(input.birthday) : null,
        gender: input.gender ?? null,
        customerType: input.customerType ?? 'NORMAL',
        status: CUSTOMER_STATUS.ACTIVE,
        source: input.source ?? null,
        ...(input.note?.trim()
          ? { initialNote: { content: input.note.trim(), createdBy: user.memberId } }
          : {}),
      }),
    );
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'customer',
      entityId: customer.id,
      newValues: {
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
      },
    });
    return customer;
  }

  async update(user: CurrentUser, id: string, input: UpdateCustomerInput) {
    const normalizedPhone =
      input.phone === undefined ? undefined : this.normalizePhone(input.phone);
    if (normalizedPhone) {
      const duplicate = await this.repository.findByNormalizedPhone(user.shopId, normalizedPhone);
      if (duplicate && duplicate.id !== id) this.throwPhoneConflict(duplicate.id);
    }
    const updated = await this.withPhoneConflict(() =>
      this.repository.update(user.shopId, id, {
        ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim(), normalizedPhone } : {}),
        ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() || null } : {}),
        ...(input.facebook !== undefined ? { facebook: input.facebook.trim() || null } : {}),
        ...(input.zalo !== undefined ? { zalo: input.zalo.trim() || null } : {}),
        ...(input.birthday !== undefined ? { birthday: new Date(input.birthday) } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.customerType !== undefined ? { customerType: input.customerType } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      }),
    );
    if (!updated) throw new NotFoundException('Không tìm thấy khách hàng.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'customer',
      entityId: id,
      newValues: { ...input },
    });
    return updated;
  }

  async addNote(user: CurrentUser, customerId: string, input: AddCustomerNoteInput) {
    await this.get(user, customerId);
    return this.repository.addNote({
      shopId: user.shopId,
      customerId,
      content: input.content,
      isPinned: input.isPinned,
      createdBy: user.memberId,
    });
  }
  async addAddress(user: CurrentUser, customerId: string, input: CustomerAddressInput) {
    const address = await this.repository.addAddress({ shopId: user.shopId, customerId, ...input });
    if (!address) throw new NotFoundException('Không tìm thấy khách hàng.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'customer_address',
      newValues: { customerId, ...input },
    });
    return address;
  }

  async updateAddress(
    user: CurrentUser,
    customerId: string,
    addressId: string,
    input: UpdateCustomerAddressInput,
  ) {
    const address = await this.repository.updateAddress({
      shopId: user.shopId,
      customerId,
      addressId,
      data: input,
    });
    if (!address) throw new NotFoundException('Không tìm thấy địa chỉ khách hàng.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'customer_address',
      entityId: addressId,
      newValues: { ...input },
    });
    return address;
  }

  async deleteAddress(user: CurrentUser, customerId: string, addressId: string) {
    const deleted = await this.repository.deleteAddress(user.shopId, customerId, addressId);
    if (!deleted) throw new NotFoundException('Không tìm thấy địa chỉ khách hàng.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'customer_address',
      entityId: addressId,
    });
    return { deleted: true };
  }

  private normalizePhone(phone: string): string {
    try {
      return normalizeCustomerPhone(phone);
    } catch (error) {
      if (error instanceof InvalidCustomerPhoneError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  private throwPhoneConflict(existingCustomerId?: string): never {
    throw new ConflictException({
      code: 'CUSTOMER_PHONE_ALREADY_EXISTS',
      message: 'Số điện thoại khách hàng đã tồn tại.',
      existingCustomerId,
    });
  }

  private async withPhoneConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof CustomerPhoneAlreadyExistsError) {
        this.throwPhoneConflict(error.existingCustomerId);
      }
      throw error;
    }
  }
}
