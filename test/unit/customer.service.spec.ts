import { CustomerService } from '../../src/modules/customers/application/customer.service';
import type { CustomerRepository } from '../../src/modules/customers/domain/customer.repository';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { CustomerDetails } from '../../src/modules/customers/domain/customer.models';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('CustomerService Unit Tests', () => {
  let service: CustomerService;
  let repo: CustomerRepository;
  let audit: AuditPort;

  let findByIdMock: jest.MockedFunction<CustomerRepository['findById']>;
  let createMock: jest.MockedFunction<CustomerRepository['create']>;
  let updateMock: jest.MockedFunction<CustomerRepository['update']>;
  let addNoteMock: jest.MockedFunction<CustomerRepository['addNote']>;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;

  const fixedTime = new Date('2026-10-01T12:00:00.000Z');

  const currentUser: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'user@example.com',
    fullName: 'Test Staff',
    permissions: ['customers.manage'],
  };

  const sampleCustomer: NonNullable<CustomerDetails> = {
    id: 'cust-1',
    customerCode: 'CUS-20261001-001',
    fullName: 'Nguyen Van A',
    phone: '0901234567',
    facebook: null,
    zalo: null,
    addresses: [],
    notes: [],
    stats: {
      completedRentalCount: 0,
      totalPaid: 0,
      depositHeld: 0,
      lastRentalAt: null,
    },
  };

  beforeEach(() => {
    findByIdMock = jest.fn().mockResolvedValue(sampleCustomer);
    createMock = jest.fn().mockResolvedValue(sampleCustomer);
    updateMock = jest.fn().mockResolvedValue(sampleCustomer);
    addNoteMock = jest.fn().mockResolvedValue({
      id: 'note-1',
      shopId: 'shop-1',
      customerId: 'cust-1',
      content: 'Customer requested discount',
      isPinned: false,
      createdBy: 'member-1',
      createdAt: fixedTime,
      updatedAt: fixedTime,
    });
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repo = {
      list: jest.fn(),
      lookup: jest.fn(),
      findByNormalizedPhone: jest.fn().mockResolvedValue(null),
      findById: findByIdMock,
      create: createMock,
      update: updateMock,
      addNote: addNoteMock,
      addAddress: jest.fn(),
      updateAddress: jest.fn(),
      deleteAddress: jest.fn().mockResolvedValue(true),
    };

    audit = {
      log: auditLogMock,
    };

    service = new CustomerService(repo, audit);
  });

  describe('get', () => {
    it('throws NotFoundException if customer does not exist in shop', async () => {
      findByIdMock.mockResolvedValueOnce(null);

      await expect(service.get(currentUser, 'non-existent')).rejects.toThrow(
        new NotFoundException('Customer not found'),
      );
      expect(findByIdMock).toHaveBeenCalledWith('shop-1', 'non-existent');
    });

    it('returns customer details when found', async () => {
      const result = await service.get(currentUser, 'cust-1');

      expect(result).toEqual(sampleCustomer);
      expect(findByIdMock).toHaveBeenCalledWith('shop-1', 'cust-1');
    });
  });

  describe('create', () => {
    it('creates customer with normalized phone and logs audit event', async () => {
      const result = await service.create(currentUser, {
        fullName: '  Nguyen Van A  ',
        phone: '  090-123-4567  ',
        email: 'VanA@Example.COM',
      });

      expect(result).toBeDefined();
      expect(createMock).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({
          fullName: 'Nguyen Van A',
          phone: '090-123-4567',
          normalizedPhone: '0901234567',
          email: 'vana@example.com',
          status: 'ACTIVE',
        }),
      );

      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          action: 'CREATE',
          entityType: 'customer',
          entityId: sampleCustomer.id,
        }),
      );
    });

    it('rejects invalid phone input', async () => {
      await expect(
        service.create(currentUser, { fullName: 'Customer', phone: 'not-a-phone' }),
      ).rejects.toThrow(BadRequestException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('rejects an existing normalized phone in the same shop', async () => {
      repo.findByNormalizedPhone = jest.fn().mockResolvedValue({
        id: 'cust-existing',
        fullName: 'Existing',
        phone: '0912345678',
      });

      await expect(
        service.create(currentUser, { fullName: 'Duplicate', phone: '+84 912 345 678' }),
      ).rejects.toThrow(ConflictException);
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException if customer does not exist in shop', async () => {
      updateMock.mockResolvedValueOnce(null);

      await expect(
        service.update(currentUser, 'non-existent', { fullName: 'Updated Name' }),
      ).rejects.toThrow(new NotFoundException('Customer not found'));
    });

    it('updates customer and logs audit event', async () => {
      const result = await service.update(currentUser, 'cust-1', {
        fullName: 'Updated Name',
        phone: '0909999999',
      });

      expect(result).toBeDefined();
      expect(updateMock).toHaveBeenCalledWith(
        'shop-1',
        'cust-1',
        expect.objectContaining({
          fullName: 'Updated Name',
          phone: '0909999999',
          normalizedPhone: '0909999999',
        }),
      );

      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          action: 'UPDATE',
          entityType: 'customer',
          entityId: 'cust-1',
        }),
      );
    });
  });

  describe('addNote', () => {
    it('throws NotFoundException if customer does not exist', async () => {
      findByIdMock.mockResolvedValueOnce(null);

      await expect(
        service.addNote(currentUser, 'non-existent', { content: 'Some note', isPinned: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('adds note for existing customer', async () => {
      const result = await service.addNote(currentUser, 'cust-1', {
        content: 'Customer requested discount',
        isPinned: false,
      });

      expect(result).toBeDefined();
      expect(addNoteMock).toHaveBeenCalledWith({
        shopId: 'shop-1',
        customerId: 'cust-1',
        content: 'Customer requested discount',
        isPinned: false,
        createdBy: 'member-1',
      });
    });
  });
});
