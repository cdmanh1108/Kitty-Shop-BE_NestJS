import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../domain/customer.repository';
import type {
  AddCustomerNoteReqDto,
  CustomerAddressReqDto,
  UpdateCustomerAddressReqDto,
  CreateCustomerReqDto,
  CustomerListQueryDto,
  UpdateCustomerReqDto,
} from '../api/customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repository: CustomerRepository,
    private readonly audit: AuditService,
  ) {}

  list(user: CurrentUser, query: CustomerListQueryDto) {
    return this.repository.list({ shopId: user.shopId, ...query });
  }

  async get(user: CurrentUser, id: string) {
    const customer = await this.repository.findById(user.shopId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(user: CurrentUser, input: CreateCustomerReqDto) {
    const customer = await this.repository.create(user.shopId, {
      customerCode: `CUS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      normalizedPhone: input.phone.replace(/\D/g, ''),
      email: input.email?.toLowerCase() ?? null,
      facebook: input.facebook ?? null,
      zalo: input.zalo ?? null,
      birthday: input.birthday ? new Date(input.birthday) : null,
      gender: input.gender ?? null,
      customerType: input.customerType ?? 'NORMAL',
      status: 'ACTIVE',
      source: input.source ?? null,
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'customer',
      entityId: customer.id,
      newValues: { customerCode: customer.customerCode, fullName: customer.fullName, phone: customer.phone },
    });
    return customer;
  }

  async update(user: CurrentUser, id: string, input: UpdateCustomerReqDto) {
    const updated = await this.repository.update(user.shopId, id, {
      ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone.trim(), normalizedPhone: input.phone.replace(/\D/g, '') }
        : {}),
      ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
      ...(input.facebook !== undefined ? { facebook: input.facebook } : {}),
      ...(input.zalo !== undefined ? { zalo: input.zalo } : {}),
      ...(input.birthday !== undefined ? { birthday: new Date(input.birthday) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.customerType !== undefined ? { customerType: input.customerType } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
    if (!updated) throw new NotFoundException('Customer not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'customer',
      entityId: id,
      newValues: input,
    });
    return updated;
  }

  async addNote(user: CurrentUser, customerId: string, input: AddCustomerNoteReqDto) {
    await this.get(user, customerId);
    return this.repository.addNote({
      shopId: user.shopId,
      customerId,
      content: input.content,
      isPinned: input.isPinned,
      createdBy: user.memberId,
    });
  }
  async addAddress(user: CurrentUser, customerId: string, input: CustomerAddressReqDto) {
    const address = await this.repository.addAddress({ shopId: user.shopId, customerId, ...input });
    if (!address) throw new NotFoundException('Customer not found');
    await this.audit.log({ shopId: user.shopId, actorUserId: user.userId, actorMemberId: user.memberId, action: 'CREATE', entityType: 'customer_address', newValues: { customerId, ...input } });
    return address;
  }

  async updateAddress(user: CurrentUser, customerId: string, addressId: string, input: UpdateCustomerAddressReqDto) {
    const address = await this.repository.updateAddress({ shopId: user.shopId, customerId, addressId, data: input });
    if (!address) throw new NotFoundException('Customer address not found');
    await this.audit.log({ shopId: user.shopId, actorUserId: user.userId, actorMemberId: user.memberId, action: 'UPDATE', entityType: 'customer_address', entityId: addressId, newValues: input });
    return address;
  }

  async deleteAddress(user: CurrentUser, customerId: string, addressId: string) {
    const deleted = await this.repository.deleteAddress(user.shopId, customerId, addressId);
    if (!deleted) throw new NotFoundException('Customer address not found');
    await this.audit.log({ shopId: user.shopId, actorUserId: user.userId, actorMemberId: user.memberId, action: 'DELETE', entityType: 'customer_address', entityId: addressId });
    return { deleted: true };
  }

}
