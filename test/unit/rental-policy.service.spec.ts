import { BadRequestException } from '@nestjs/common';
import type { AuditPort } from '@modules/audit/domain/audit.port';
import type { CurrentUser } from '@common/types/current-user';
import type { RentalPolicy } from '../../src/modules/settings/domain/rental-policy';
import type { SettingsRepository } from '../../src/modules/settings/domain/settings.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';

describe('SettingsService - Rental Policy', () => {
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
    audit = {
      log: auditLogMock,
    };
    service = new SettingsService(repository, audit);
  });

  describe('getRentalPolicy / getPolicy', () => {
    it('prevents generic settings writes from bypassing policy validation', async () => {
      const upsert = jest.fn();
      repository.upsert = upsert;
      await expect(service.upsert(mockUser, 'rental_policy', { value: {} })).rejects.toThrow(
        BadRequestException,
      );
      expect(upsert).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });
    it('returns deterministic defaults when no persisted policy exists', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      const policy = await service.getRentalPolicy(mockUser);

      expect(policy.rentalPricing.defaultRentalPrice).toBe(50_000);
      expect(policy.deposit.defaultCashDeposit).toBe(200_000);
      expect(policy.deposit.allowedMethods).toEqual(['CASH', 'DOCUMENT']);
      expect(policy.deposit.allowedDocumentTypes).toEqual(['CCCD', 'GPLX']);
      expect(policy.reschedule.maxDaysFromBooking).toBe(20);
      expect(policy.lateReturn.feePerItemPerDay).toBe(10_000);
      expect(policy.lateReturn.newRentalChargeFromLateDay).toBe(3);
      expect(policy.specialCleaning.feeMin).toBe(30_000);
      expect(policy.specialCleaning.feeMax).toBe(50_000);
      expect(policy.loyalty.enabled).toBe(true);
      expect(policy.loyalty.rentalsRequired).toBe(5);
      expect(policy.loyalty.rewardRentalValue).toBe(50_000);
      expect(policy.loyalty.stackableWithPromotions).toBe(false);
      expect(policy.updatedAt).toBeUndefined();
    });

    it('returns persisted overrides merged with defaults', async () => {
      const updatedAt = new Date('2026-09-11T10:00:00.000Z');
      const persistedCustom: Partial<RentalPolicy> = {
        rentalPricing: { defaultRentalPrice: 70_000 },
        deposit: {
          allowedMethods: ['CASH'],
          allowedDocumentTypes: ['CCCD'],
          defaultCashDeposit: 250_000,
          categoryOverrides: [{ categoryId: 'cat-ba-ba', cashAmount: 300_000 }],
        },
      };

      getRentalPolicyMock.mockResolvedValue({
        policy: persistedCustom as RentalPolicy,
        updatedAt,
      });

      const policy = await service.getRentalPolicy(mockUser);

      expect(policy.rentalPricing.defaultRentalPrice).toBe(70_000);
      expect(policy.deposit.defaultCashDeposit).toBe(250_000);
      expect(policy.deposit.allowedMethods).toEqual(['CASH']);
      expect(policy.deposit.categoryOverrides).toEqual([
        { categoryId: 'cat-ba-ba', cashAmount: 300_000 },
      ]);
      // Defaults preserved for uncustomized parts:
      expect(policy.reschedule.maxDaysFromBooking).toBe(20);
      expect(policy.lateReturn.feePerItemPerDay).toBe(10_000);
      expect(policy.specialCleaning.feeMin).toBe(30_000);
      expect(policy.updatedAt).toBe('2026-09-11T10:00:00.000Z');
    });

    it('scopes query to the authenticated user shopId', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await service.getRentalPolicy(mockUser);

      expect(getRentalPolicyMock).toHaveBeenCalledWith(mockUser.shopId);
    });
  });

  describe('updateRentalPolicy', () => {
    it('updates valid partial policy and emits audit log', async () => {
      getRentalPolicyMock.mockResolvedValue(null);
      const savedDate = new Date('2026-09-11T12:00:00.000Z');

      saveRentalPolicyMock.mockImplementation((_shopId, policy) =>
        Promise.resolve({
          policy,
          updatedAt: savedDate,
        }),
      );

      const result = await service.updateRentalPolicy(mockUser, {
        rentalPricing: { defaultRentalPrice: 60_000 },
        specialCleaning: { feeMin: 35_000, feeMax: 60_000 },
      });

      expect(result.rentalPricing.defaultRentalPrice).toBe(60_000);
      expect(result.specialCleaning.feeMin).toBe(35_000);
      expect(result.specialCleaning.feeMax).toBe(60_000);
      expect(result.deposit.defaultCashDeposit).toBe(200_000); // Unchanged default
      expect(result.updatedAt).toBe(savedDate.toISOString());

      expect(saveRentalPolicyMock).toHaveBeenCalledWith(
        mockUser.shopId,
        expect.objectContaining({
          rentalPricing: { defaultRentalPrice: 60_000 },
          specialCleaning: { feeMin: 35_000, feeMax: 60_000 },
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
        }),
      );
    });

    it('rejects negative default rental price', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await expect(
        service.updateRentalPolicy(mockUser, {
          rentalPricing: { defaultRentalPrice: -1000 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects specialCleaning feeMax < feeMin', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await expect(
        service.updateRentalPolicy(mockUser, {
          specialCleaning: { feeMin: 50_000, feeMax: 30_000 },
        }),
      ).rejects.toThrow('Special cleaning maximum fee cannot be less than minimum fee');
    });

    it('rejects zero or negative rentalsRequired in loyalty', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await expect(
        service.updateRentalPolicy(mockUser, {
          loyalty: { rentalsRequired: 0 } as unknown as RentalPolicy['loyalty'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate category overrides', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await expect(
        service.updateRentalPolicy(mockUser, {
          deposit: {
            categoryOverrides: [
              { categoryId: 'cat-1', cashAmount: 200_000 },
              { categoryId: 'cat-1', cashAmount: 300_000 },
            ],
          },
        }),
      ).rejects.toThrow('Duplicate category override detected for categoryId: cat-1');
    });

    it('rejects invalid deposit methods', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      await expect(
        service.updateRentalPolicy(mockUser, {
          deposit: {
            allowedMethods: ['CRYPTO' as unknown as 'CASH'],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('RentalPolicyProvider implementation', () => {
    it('provides complete policy via getPolicy for consumers', async () => {
      getRentalPolicyMock.mockResolvedValue(null);

      const policy = await service.getPolicy('any-shop-id');

      expect(policy).toBeDefined();
      expect(policy.rentalPricing.defaultRentalPrice).toBe(50_000);
      expect(policy.reschedule.maxDaysFromBooking).toBe(20);
      expect(policy.lateReturn.newRentalChargeFromLateDay).toBe(3);
    });
  });
});
