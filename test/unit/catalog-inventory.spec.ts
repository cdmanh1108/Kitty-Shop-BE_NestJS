import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogService } from '@modules/catalog/application/catalog.service';
import type { CatalogRepository } from '@modules/catalog/domain/catalog.repository';
import { CatalogInvariantError } from '@modules/catalog/domain/catalog.repository';
import type { AuditService } from '@modules/audit/application/audit.service';
import type { CurrentUser } from '@common/types/current-user';
import { INVENTORY_STATUS, type InventoryStatus } from '@modules/catalog/domain/catalog-status';

describe('CatalogService - Inventory', () => {
  let service: CatalogService;
  let repository: CatalogRepository;
  let audit: { log: jest.Mock };

  let listInventoryMock: jest.Mock;
  let findInventoryItemMock: jest.Mock;
  let addInventoryItemMock: jest.Mock;
  let updateInventoryStatusMock: jest.Mock;
  let archiveInventoryItemMock: jest.Mock;
  let auditLogMock: jest.Mock;

  const user: CurrentUser = {
    userId: 'user-1',
    shopId: 'shop-1',
    memberId: 'member-1',
    email: 'admin@kitty.local',
    fullName: 'Admin',
    permissions: ['inventory.view', 'inventory.manage'],
  };

  beforeEach(() => {
    listInventoryMock = jest.fn();
    findInventoryItemMock = jest.fn();
    addInventoryItemMock = jest.fn();
    updateInventoryStatusMock = jest.fn();
    archiveInventoryItemMock = jest.fn();
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repository = {
      lookupProducts: jest.fn(),
      inventorySummary: jest.fn(),
      inventoryHistory: jest.fn(),
      listLookups: jest.fn(),
      listCategories: jest.fn(),
      categoryOptions: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      createCategory: jest.fn(),
      createSize: jest.fn(),
      createColor: jest.fn(),
      listProducts: jest.fn(),
      findProduct: jest.fn(),
      createProduct: jest.fn(),
      addVariant: jest.fn(),
      upsertRentalRate: jest.fn(),
      updateProduct: jest.fn(),
      archiveProduct: jest.fn(),
      addProductMedia: jest.fn(),
      removeProductMedia: jest.fn(),
      addInventoryItem: addInventoryItemMock,
      updateInventoryStatus: updateInventoryStatusMock,
      archiveInventoryItem: archiveInventoryItemMock,
      listInventory: listInventoryMock,
      findInventoryItem: findInventoryItemMock,
      findAvailableInventory: jest.fn(),
      listStorefrontCategories: jest.fn(),
      listStorefrontProducts: jest.fn(),
      findStorefrontProductBySlug: jest.fn(),
    };
    audit = {
      log: auditLogMock,
    };
    service = new CatalogService(repository, audit as unknown as AuditService);
  });

  describe('listInventory', () => {
    it('queries inventory with shopId and pagination criteria', async () => {
      const pageResult = {
        items: [
          {
            id: 'item-1',
            shopId: 'shop-1',
            variantId: 'var-1',
            locationId: null,
            sku: 'SP001-M-TRANG-001',
            barcode: null,
            currentStatus: INVENTORY_STATUS.AVAILABLE,
            condition: 'GOOD',
            purchasePrice: null,
            purchaseDate: null,
            acquiredFrom: null,
            totalRentalCount: 0,
            lastRentedAt: null,
            notes: null,
            metadata: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
            variant: {
              id: 'var-1',
              shopId: 'shop-1',
              productId: 'prod-1',
              variantCode: 'SP001-M-TRANG',
              sizeId: 'size-1',
              colorId: 'color-1',
              depositAmountOverride: null,
              status: 'ACTIVE',
              metadata: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              archivedAt: null,
              size: {
                id: 'size-1',
                shopId: 'shop-1',
                code: 'M',
                name: 'Size M',
                sortOrder: 1,
                createdAt: new Date(),
              },
              color: {
                id: 'color-1',
                shopId: 'shop-1',
                code: 'TRANG',
                name: 'Trắng',
                hexColor: '#ffffff',
                createdAt: new Date(),
              },
              product: {
                id: 'prod-1',
                shopId: 'shop-1',
                categoryId: 'cat-1',
                code: 'SP001',
                name: 'Váy Công Chúa Trắng',
                slug: null,
                description: null,
                defaultDepositAmount: '500000',
                replacementValue: null,
                facebookPostUrl: null,
                currency: 'VND',
                status: 'ACTIVE',
                isRentable: true,
                isPublic: true,
                metadata: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
              },
            },
            location: null,
            occupancyStatus: 'FREE' as const,
            allowedManualTransitions: [
              INVENTORY_STATUS.CLEANING,
              INVENTORY_STATUS.REPAIRING,
              INVENTORY_STATUS.DAMAGED,
              INVENTORY_STATUS.LOST,
              INVENTORY_STATUS.RETIRED,
            ],
            currentRental: null,
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      listInventoryMock.mockResolvedValue(pageResult);

      const result = await service.listInventory(user, {
        page: 1,
        limit: 20,
        search: 'SP001',
        status: INVENTORY_STATUS.AVAILABLE,
        productId: 'prod-1',
      });

      expect(listInventoryMock).toHaveBeenCalledWith({
        shopId: 'shop-1',
        page: 1,
        limit: 20,
        search: 'SP001',
        status: INVENTORY_STATUS.AVAILABLE,
        productId: 'prod-1',
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.sku).toBe('SP001-M-TRANG-001');
      expect(result.items[0]?.occupancyStatus).toBe('FREE');
    });
  });

  describe('getInventory', () => {
    it('returns detail if found', async () => {
      const detail = {
        id: 'item-1',
        shopId: 'shop-1',
        variantId: 'var-1',
        locationId: null,
        sku: 'SP001-M-TRANG-001',
        barcode: null,
        currentStatus: INVENTORY_STATUS.AVAILABLE,
        condition: 'GOOD',
        purchasePrice: null,
        purchaseDate: null,
        acquiredFrom: null,
        totalRentalCount: 0,
        lastRentedAt: null,
        notes: null,
        metadata: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        variant: {
          id: 'var-1',
          shopId: 'shop-1',
          productId: 'prod-1',
          variantCode: 'SP001-M-TRANG',
          sizeId: null,
          colorId: null,
          depositAmountOverride: null,
          status: 'ACTIVE',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          archivedAt: null,
          size: null,
          color: null,
          product: {
            id: 'prod-1',
            shopId: 'shop-1',
            categoryId: 'cat-1',
            code: 'SP001',
            name: 'Váy',
            slug: null,
            description: null,
            defaultDepositAmount: '500000',
            replacementValue: null,
            facebookPostUrl: null,
            currency: 'VND',
            status: 'ACTIVE',
            isRentable: true,
            isPublic: true,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
          },
          rentalRates: [],
        },
        location: null,
        occupancyStatus: 'FREE' as const,
        allowedManualTransitions: [
          INVENTORY_STATUS.CLEANING,
          INVENTORY_STATUS.REPAIRING,
          INVENTORY_STATUS.DAMAGED,
          INVENTORY_STATUS.LOST,
          INVENTORY_STATUS.RETIRED,
        ],
        currentRental: null,
        allocations: [],
        statusHistory: [],
      };

      findInventoryItemMock.mockResolvedValue(detail);

      const res = await service.getInventory(user, 'item-1');
      expect(res.id).toBe('item-1');
    });

    it('throws NotFoundException when item does not exist', async () => {
      findInventoryItemMock.mockResolvedValue(null);
      await expect(service.getInventory(user, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addInventory', () => {
    it('creates inventory item under variant and does not modify product quantity', async () => {
      const createdItem = {
        id: 'item-new',
        shopId: 'shop-1',
        variantId: 'var-1',
        locationId: null,
        sku: 'SP001-M-TRANG-002',
        barcode: null,
        currentStatus: INVENTORY_STATUS.AVAILABLE,
        condition: 'GOOD',
        purchasePrice: null,
        purchaseDate: null,
        acquiredFrom: null,
        totalRentalCount: 0,
        lastRentedAt: null,
        notes: 'Mua thêm 1 cái',
        metadata: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      addInventoryItemMock.mockResolvedValue(createdItem);

      const res = await service.addInventory(user, {
        variantId: 'var-1',
        notes: 'Mua thêm 1 cái',
      });

      expect(res.sku).toBe('SP001-M-TRANG-002');
      expect(addInventoryItemMock).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({
          variantId: 'var-1',
          notes: 'Mua thêm 1 cái',
        }),
      );
    });

    it('throws NotFoundException if variant does not exist', async () => {
      addInventoryItemMock.mockResolvedValue(null);
      await expect(
        service.addInventory(user, { variantId: 'non-existent', sku: 'SKU-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps duplicate SKU invariant error to ConflictException', async () => {
      addInventoryItemMock.mockRejectedValue(
        new CatalogInvariantError('Mã SKU "SP001-01" đã tồn tại trong kho của cửa hàng.'),
      );

      await expect(
        service.addInventory(user, { variantId: 'var-1', sku: 'SP001-01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateInventoryStatus', () => {
    it('updates status and logs audit event', async () => {
      const updated = {
        id: 'item-1',
        shopId: 'shop-1',
        variantId: 'var-1',
        locationId: null,
        sku: 'SP001-01',
        barcode: null,
        currentStatus: INVENTORY_STATUS.CLEANING,
        condition: 'GOOD',
        purchasePrice: null,
        purchaseDate: null,
        acquiredFrom: null,
        totalRentalCount: 0,
        lastRentedAt: null,
        notes: null,
        metadata: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      updateInventoryStatusMock.mockResolvedValue(updated);

      const result = await service.updateInventoryStatus(user, 'item-1', {
        status: INVENTORY_STATUS.CLEANING,
        reason: 'Gửi giặt hấp sau khi khách trả',
      });

      expect(result.currentStatus).toBe(INVENTORY_STATUS.CLEANING);
      expect(updateInventoryStatusMock).toHaveBeenCalledWith({
        shopId: 'shop-1',
        id: 'item-1',
        status: INVENTORY_STATUS.CLEANING,
        expectedFromStatus: undefined,
        condition: undefined,
        reason: 'Gửi giặt hấp sau khi khách trả',
        notes: undefined,
        changedBy: 'member-1',
      });
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityType: 'inventory_item',
          entityId: 'item-1',
          newValues: {
            status: INVENTORY_STATUS.CLEANING,
            reason: 'Gửi giặt hấp sau khi khách trả',
          },
        }),
      );
    });

    it('rejects unsupported status enum with BadRequestException', async () => {
      await expect(
        service.updateInventoryStatus(user, 'item-1', {
          status: 'UNSUPPORTED' as unknown as InventoryStatus,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps invariant error for active rental to ConflictException', async () => {
      updateInventoryStatusMock.mockRejectedValue(
        new CatalogInvariantError(
          'Món đồ đang có lịch thuê hoạt động hoặc đang được thuê. Không thể đổi trạng thái thủ công từ kho.',
        ),
      );

      await expect(
        service.updateInventoryStatus(user, 'item-1', {
          status: INVENTORY_STATUS.CLEANING,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps state mismatch invariant error to ConflictException', async () => {
      updateInventoryStatusMock.mockRejectedValue(
        new CatalogInvariantError(
          'Trạng thái món đồ đã thay đổi (thực tế: CLEANING, kỳ vọng: AVAILABLE). Vui lòng tải lại trang.',
        ),
      );

      await expect(
        service.updateInventoryStatus(user, 'item-1', {
          status: INVENTORY_STATUS.LOST,
          expectedFromStatus: INVENTORY_STATUS.AVAILABLE,
          reason: 'Mất',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps missing reason invariant error to BadRequestException', async () => {
      updateInventoryStatusMock.mockRejectedValue(
        new CatalogInvariantError('Cần nhập lý do khi chuyển món đồ sang trạng thái DAMAGED.'),
      );

      await expect(
        service.updateInventoryStatus(user, 'item-1', {
          status: INVENTORY_STATUS.DAMAGED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when item does not exist', async () => {
      updateInventoryStatusMock.mockResolvedValue(null);
      await expect(
        service.updateInventoryStatus(user, 'item-404', {
          status: INVENTORY_STATUS.CLEANING,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveInventoryItem', () => {
    it('archives item and records audit', async () => {
      archiveInventoryItemMock.mockResolvedValue(true);

      const res = await service.archiveInventoryItem(user, 'item-1', 'Đồ cũ hỏng hoàn toàn');
      expect(res.success).toBe(true);
      expect(archiveInventoryItemMock).toHaveBeenCalledWith(
        'shop-1',
        'item-1',
        'Đồ cũ hỏng hoàn toàn',
        'member-1',
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ARCHIVE',
          entityType: 'inventory_item',
          entityId: 'item-1',
        }),
      );
    });

    it('throws NotFoundException if item does not exist', async () => {
      archiveInventoryItemMock.mockResolvedValue(false);
      await expect(service.archiveInventoryItem(user, 'item-404')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException if item has active allocation', async () => {
      archiveInventoryItemMock.mockRejectedValue(
        new CatalogInvariantError(
          'Không thể ngừng sử dụng món đồ đang có lịch đặt hoặc đang được thuê.',
        ),
      );
      await expect(service.archiveInventoryItem(user, 'item-1')).rejects.toThrow(ConflictException);
    });
  });
});
