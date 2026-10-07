import type { AuditPort } from '@modules/audit/domain/audit.port';
import type { CurrentUser } from '@common/types/current-user';
import {
  DEFAULT_RENTAL_POLICY,
  type RentalPolicy,
} from '../../src/modules/settings/domain/rental-policy';
import { InvalidShopSettingsError } from '../../src/modules/settings/domain/rental-policy.errors';
import type { SettingsRepository } from '../../src/modules/settings/domain/settings.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { toRentalPolicyAuditSnapshot } from '../../src/modules/settings/application/settings-audit.mapper';

describe('SettingsService - Rental Policy orchestration', () => {
  let repository: jest.Mocked<SettingsRepository>;
  let audit: jest.Mocked<AuditPort>;
  let service: SettingsService;
  let getRentalPolicyMock: jest.MockedFunction<SettingsRepository['getRentalPolicy']>;
  let saveRentalPolicyMock: jest.MockedFunction<SettingsRepository['saveRentalPolicy']>;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;

  const mockUser: CurrentUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    memberId: '22222222-2222-2222-2222-222222222222',
    shopId: '33333333-3333-3333-3333-333333333333',
    email: 'admin@kitty.vn',
    fullName: 'Admin',
    permissions: ['settings.view', 'settings.manage'],
  };

  beforeEach(() => {
    getRentalPolicyMock = jest.fn();
    saveRentalPolicyMock = jest.fn();
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repository = {
      list: jest.fn(),
      upsert: jest.fn(),
      getShop: jest.fn(),
      updateShop: jest.fn(),
      getRentalPolicy: getRentalPolicyMock,
      saveRentalPolicy: saveRentalPolicyMock,
    };
    audit = { log: auditLogMock };
    service = new SettingsService(repository, audit);
  });

  it('blocks generic settings writes from bypassing validated policy updates', async () => {
    const upsert = jest.fn();
    repository.upsert = upsert;
    await expect(service.upsert(mockUser, 'rental_policy', { value: {} })).rejects.toMatchObject({
      code: 'RENTAL_POLICY_REQUIRES_VALIDATED_UPDATE',
      message: 'Vui lòng cập nhật quy tắc kinh doanh tại mục chính sách thuê.',
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('loads defaults and returns the persisted timestamp without writing', async () => {
    getRentalPolicyMock.mockResolvedValue(null);

    const policy = await service.getRentalPolicy(mockUser);

    expect(policy).toEqual({ ...DEFAULT_RENTAL_POLICY, updatedAt: undefined });
    expect(getRentalPolicyMock).toHaveBeenCalledWith(mockUser.shopId);
    expect(saveRentalPolicyMock).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('provides a complete policy to RentalPolicyProvider consumers', async () => {
    getRentalPolicyMock.mockResolvedValue(null);

    const policy = await service.getPolicy(mockUser.shopId);

    expect(policy).toEqual(DEFAULT_RENTAL_POLICY);
    expect(getRentalPolicyMock).toHaveBeenCalledWith(mockUser.shopId);
  });

  it('persists only editable values and audits their before/after snapshot', async () => {
    getRentalPolicyMock.mockResolvedValue(null);
    const savedDate = new Date('2026-09-11T12:00:00.000Z');
    const operationOrder: string[] = [];
    const savedPolicy: RentalPolicy = {
      ...DEFAULT_RENTAL_POLICY,
      rentalPricing: { ...DEFAULT_RENTAL_POLICY.rentalPricing, defaultRentalPrice: 60_000 },
      deposit: { ...DEFAULT_RENTAL_POLICY.deposit, defaultCashDeposit: 250_000 },
    };
    saveRentalPolicyMock.mockImplementation(() => {
      operationOrder.push('save');
      return Promise.resolve({ policy: savedPolicy, updatedAt: savedDate });
    });
    auditLogMock.mockImplementation(() => {
      operationOrder.push('audit');
      return Promise.resolve();
    });

    const result = await service.updateRentalPolicy(mockUser, {
      rentalPricing: { defaultRentalPrice: 60_000 },
      deposit: { defaultCashDeposit: 250_000 },
    });

    expect(result.rentalPricing.defaultRentalPrice).toBe(60_000);
    expect(result.specialCleaning).toEqual(DEFAULT_RENTAL_POLICY.specialCleaning);
    expect(result.deposit.defaultCashDeposit).toBe(250_000);
    expect(result.updatedAt).toBe(savedDate.toISOString());
    expect(saveRentalPolicyMock).toHaveBeenCalledWith(
      mockUser.shopId,
      expect.objectContaining({
        rentalPricing: { ...DEFAULT_RENTAL_POLICY.rentalPricing, defaultRentalPrice: 60_000 },
        deposit: { ...DEFAULT_RENTAL_POLICY.deposit, defaultCashDeposit: 250_000 },
      }),
      mockUser.memberId,
    );
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: mockUser.shopId,
        actorUserId: mockUser.userId,
        actorMemberId: mockUser.memberId,
        action: 'UPDATE',
        entityType: 'rental_policy',
        entityId: mockUser.shopId,
        oldValues: toRentalPolicyAuditSnapshot(DEFAULT_RENTAL_POLICY),
        newValues: toRentalPolicyAuditSnapshot(savedPolicy),
      }),
    );
    expect(operationOrder).toEqual(['save', 'audit']);
  });

  it('does not persist or audit a policy that fails domain validation', async () => {
    getRentalPolicyMock.mockResolvedValue(null);

    await expect(
      service.updateRentalPolicy(mockUser, {
        rentalPricing: { defaultRentalPrice: -1 },
      }),
    ).rejects.toThrow(InvalidShopSettingsError);

    expect(saveRentalPolicyMock).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });
});
