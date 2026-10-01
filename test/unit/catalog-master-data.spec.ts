import type { AuditPort } from '@modules/audit/domain/audit.port';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { CurrentUser } from '@common/types/current-user';
import { ColorService } from '@modules/catalog/application/color.service';
import { SizeService } from '@modules/catalog/application/size.service';
import type { CatalogColorRepository } from '@modules/catalog/domain/catalog-color.repository';
import type { CatalogSizeRepository } from '@modules/catalog/domain/catalog-size.repository';
import {
  CATALOG_ERROR_CODE,
  CatalogColorError,
  CatalogSizeError,
} from '@modules/catalog/domain/catalog-errors';
import {
  normalizeColorCode,
  normalizeColorName,
  normalizeHexColor,
  normalizeSizeCode,
  normalizeSizeName,
  normalizeSizeSortOrder,
} from '@modules/catalog/domain/catalog-master-data.rules';
import { CreateSizeReqDto } from '@modules/catalog/api/admin/dto/size.dto';

const user: CurrentUser = {
  userId: 'user-1',
  memberId: 'member-1',
  shopId: 'shop-1',
  email: 'admin@kitty.local',
  fullName: 'Admin',
  permissions: ['catalog.manage'],
};

function expectErrorCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code} to be thrown.`);
}

describe('Catalog master-data rules', () => {
  it.each([
    ['color', () => normalizeColorCode(' red '), 'RED'],
    ['size', () => normalizeSizeCode(' xl '), 'XL'],
  ])('normalizes %s code', (_entity, normalize, expected) => {
    expect(normalize()).toBe(expected);
  });

  it.each([
    ['color', () => normalizeColorName('  Đỏ đô  ')],
    ['size', () => normalizeSizeName('  Cỡ lớn  ')],
  ])('trims %s display name', (_entity, normalize) => {
    expect(normalize()).toMatch(/^(Đỏ đô|Cỡ lớn)$/);
  });

  it.each(['RED COLOR', 'XL-1', '@RED', '', 'A'.repeat(51)])(
    'rejects invalid color code %s',
    (code) => {
      expectErrorCode(() => normalizeColorCode(code), CATALOG_ERROR_CODE.COLOR_CODE_INVALID);
    },
  );

  it.each(['RED COLOR', 'XL-1', '@RED', '', 'A'.repeat(51)])(
    'rejects invalid size code %s',
    (code) => {
      expectErrorCode(() => normalizeSizeCode(code), CATALOG_ERROR_CODE.SIZE_CODE_INVALID);
    },
  );

  it.each(['', '   ', 'x'.repeat(101)])('rejects invalid color name %p', (name) => {
    expect(() => normalizeColorName(name)).toThrow(CatalogColorError);
  });

  it.each(['', '   ', 'x'.repeat(101)])('rejects invalid size name %p', (name) => {
    expect(() => normalizeSizeName(name)).toThrow(CatalogSizeError);
  });

  it('normalizes optional color hex values and rejects non-RGB forms', () => {
    expect(normalizeHexColor('#ff0000')).toBe('#FF0000');
    expect(normalizeHexColor(' ')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
    for (const value of ['#FFF', 'FFF', 'FF0000', 'red', '#GG0000']) {
      expectErrorCode(() => normalizeHexColor(value), CATALOG_ERROR_CODE.COLOR_HEX_INVALID);
    }
  });

  it('defaults Size sort order to zero and rejects negative or fractional values', () => {
    expect(normalizeSizeSortOrder(undefined)).toBe(0);
    expect([0, 10, 100].map(normalizeSizeSortOrder)).toEqual([0, 10, 100]);
    for (const value of [-1, 1.5, Number.NaN, null as never]) {
      expectErrorCode(
        () => normalizeSizeSortOrder(value),
        CATALOG_ERROR_CODE.SIZE_SORT_ORDER_INVALID,
      );
    }
  });
});

describe('CreateSizeReqDto', () => {
  it('defaults omitted sort order to zero and rejects non-integer or negative values', () => {
    const omitted = plainToInstance(CreateSizeReqDto, { code: 'M', name: 'Medium' });
    expect(omitted.sortOrder).toBe(0);
    expect(validateSync(omitted)).toHaveLength(0);

    for (const sortOrder of [-1, 1.5, null, '', false]) {
      const dto = plainToInstance(CreateSizeReqDto, { code: 'M', name: 'Medium', sortOrder });
      expect(validateSync(dto).length).toBeGreaterThan(0);
    }
  });
});

describe('ColorService and SizeService', () => {
  const colorRecord = {
    id: 'color-1',
    shopId: user.shopId,
    code: 'RED',
    name: 'Đỏ đô',
    hexColor: '#FF0000',
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  const sizeRecord = {
    id: 'size-1',
    shopId: user.shopId,
    code: 'XL',
    name: 'Cỡ lớn',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  let colorRepository: jest.Mocked<CatalogColorRepository>;
  let sizeRepository: jest.Mocked<CatalogSizeRepository>;
  let auditLog: jest.MockedFunction<AuditPort['log']>;
  let createColorMock: jest.MockedFunction<CatalogColorRepository['createColor']>;
  let findColorByIdMock: jest.MockedFunction<CatalogColorRepository['findColorById']>;
  let findColorByCodeMock: jest.MockedFunction<CatalogColorRepository['findColorByCode']>;
  let isColorInUseMock: jest.MockedFunction<CatalogColorRepository['isColorInUse']>;
  let deleteColorMock: jest.MockedFunction<CatalogColorRepository['deleteColor']>;
  let listColorsMock: jest.MockedFunction<CatalogColorRepository['listColors']>;
  let updateColorMock: jest.MockedFunction<CatalogColorRepository['updateColor']>;
  let updateColorStatusMock: jest.MockedFunction<CatalogColorRepository['updateColorStatus']>;
  let createSizeMock: jest.MockedFunction<CatalogSizeRepository['createSize']>;
  let findSizeByIdMock: jest.MockedFunction<CatalogSizeRepository['findSizeById']>;
  let findSizeByCodeMock: jest.MockedFunction<CatalogSizeRepository['findSizeByCode']>;
  let isSizeInUseMock: jest.MockedFunction<CatalogSizeRepository['isSizeInUse']>;
  let deleteSizeMock: jest.MockedFunction<CatalogSizeRepository['deleteSize']>;

  beforeEach(() => {
    createColorMock = jest.fn().mockResolvedValue(colorRecord);
    findColorByIdMock = jest.fn();
    findColorByCodeMock = jest.fn().mockResolvedValue(null);
    isColorInUseMock = jest.fn();
    deleteColorMock = jest.fn();
    listColorsMock = jest.fn();
    updateColorMock = jest.fn();
    updateColorStatusMock = jest.fn();
    colorRepository = {
      listColors: listColorsMock,
      createColor: createColorMock,
      findColorById: findColorByIdMock,
      findColorByCode: findColorByCodeMock,
      updateColor: updateColorMock,
      updateColorStatus: updateColorStatusMock,
      isColorInUse: isColorInUseMock,
      deleteColor: deleteColorMock,
    };
    createSizeMock = jest.fn().mockResolvedValue(sizeRecord);
    findSizeByIdMock = jest.fn();
    findSizeByCodeMock = jest.fn().mockResolvedValue(null);
    isSizeInUseMock = jest.fn();
    deleteSizeMock = jest.fn();
    sizeRepository = {
      createSize: createSizeMock,
      findSizeById: findSizeByIdMock,
      findSizeByCode: findSizeByCodeMock,
      isSizeInUse: isSizeInUseMock,
      deleteSize: deleteSizeMock,
    };
    auditLog = jest.fn().mockResolvedValue(undefined);
  });

  it('normalizes Color before duplicate check and audits persisted business fields', async () => {
    const service = new ColorService(colorRepository, { log: auditLog });
    await expect(
      service.createColor(user, { code: ' red ', name: ' Đỏ đô ', hexColor: '#ff0000' }),
    ).resolves.toBe(colorRecord);

    expect(findColorByCodeMock).toHaveBeenCalledWith(user.shopId, 'RED');
    expect(createColorMock).toHaveBeenCalledWith(user.shopId, {
      code: 'RED',
      name: 'Đỏ đô',
      hexColor: '#FF0000',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'color',
        entityId: colorRecord.id,
        newValues: {
          id: colorRecord.id,
          code: 'RED',
          name: 'Đỏ đô',
          hexColor: '#FF0000',
          isActive: true,
        },
      }),
    );
  });

  it('rejects a duplicate Color code after canonicalization', async () => {
    findColorByCodeMock.mockResolvedValue(colorRecord);
    const service = new ColorService(colorRepository, { log: auditLog });

    await expect(
      service.createColor(user, { code: ' red ', name: 'Đỏ', hexColor: ' ' }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS });
    expect(createColorMock).not.toHaveBeenCalled();
  });

  it('trims management search and scopes list criteria to the current shop', async () => {
    listColorsMock.mockResolvedValue({
      items: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });
    const service = new ColorService(colorRepository, { log: auditLog });

    await service.listColors(user, { page: 2, limit: 10, q: ' RED ', status: 'ALL' });

    expect(listColorsMock).toHaveBeenCalledWith({
      shopId: user.shopId,
      page: 2,
      limit: 10,
      q: 'RED',
      status: 'ALL',
    });
  });

  it('allows an inactive Color to keep its own code and applies only requested update fields', async () => {
    const inactiveColor = { ...colorRecord, isActive: false };
    findColorByIdMock.mockResolvedValue(inactiveColor);
    findColorByCodeMock.mockResolvedValue(inactiveColor);
    updateColorMock.mockResolvedValue({ ...inactiveColor, name: 'Red wine' });
    const service = new ColorService(colorRepository, { log: auditLog });

    await expect(
      service.updateColor(user, inactiveColor.id, { name: ' Red wine ' }),
    ).resolves.toMatchObject({
      name: 'Red wine',
      code: 'RED',
      isActive: false,
    });
    expect(updateColorMock).toHaveBeenCalledWith(user.shopId, inactiveColor.id, {
      name: 'Red wine',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        oldValues: {
          id: inactiveColor.id,
          code: inactiveColor.code,
          name: 'Đỏ đô',
          hexColor: inactiveColor.hexColor,
          isActive: false,
        },
        newValues: {
          id: inactiveColor.id,
          code: inactiveColor.code,
          name: 'Red wine',
          hexColor: inactiveColor.hexColor,
          isActive: false,
        },
      }),
    );
  });

  it('allows the same normalized code on its own record and translates another record duplicate', async () => {
    findColorByIdMock.mockResolvedValue(colorRecord);
    findColorByCodeMock.mockResolvedValue(colorRecord);
    updateColorMock.mockResolvedValue(colorRecord);
    const service = new ColorService(colorRepository, { log: auditLog });

    await expect(service.updateColor(user, colorRecord.id, { code: ' red ' })).resolves.toBe(
      colorRecord,
    );
    expect(updateColorMock).toHaveBeenCalledWith(user.shopId, colorRecord.id, { code: 'RED' });

    findColorByCodeMock.mockResolvedValue({ ...colorRecord, id: 'color-2' });
    await expect(
      service.updateColor(user, colorRecord.id, { code: ' blue ' }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS });
  });

  it('clears hexColor only when explicitly requested and leaves an empty patch unaudited', async () => {
    findColorByIdMock.mockResolvedValue(colorRecord);
    updateColorMock.mockResolvedValue({ ...colorRecord, hexColor: null });
    const service = new ColorService(colorRepository, { log: auditLog });

    await expect(
      service.updateColor(user, colorRecord.id, { hexColor: null }),
    ).resolves.toMatchObject({
      hexColor: null,
    });
    expect(updateColorMock).toHaveBeenCalledWith(user.shopId, colorRecord.id, { hexColor: null });

    auditLog.mockClear();
    await expect(service.updateColor(user, colorRecord.id, {})).resolves.toBe(colorRecord);
    expect(updateColorMock).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('audits only actual Color status transitions', async () => {
    updateColorStatusMock.mockResolvedValue({ color: colorRecord, changed: false });
    const service = new ColorService(colorRepository, { log: auditLog });

    await service.updateColorStatus(user, colorRecord.id, true);
    expect(auditLog).not.toHaveBeenCalled();

    updateColorStatusMock.mockResolvedValue({
      color: { ...colorRecord, isActive: false },
      changed: true,
    });
    await service.updateColorStatus(user, colorRecord.id, false);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STATUS_CHANGE',
        oldValues: {
          id: colorRecord.id,
          code: colorRecord.code,
          name: colorRecord.name,
          hexColor: colorRecord.hexColor,
          isActive: true,
        },
        newValues: {
          id: colorRecord.id,
          code: colorRecord.code,
          name: colorRecord.name,
          hexColor: colorRecord.hexColor,
          isActive: false,
        },
      }),
    );
  });

  it('normalizes Size, defaults sort order and audits persisted business fields', async () => {
    const service = new SizeService(sizeRepository, { log: auditLog });
    await expect(service.createSize(user, { code: ' xl ', name: ' Cỡ lớn ' })).resolves.toBe(
      sizeRecord,
    );

    expect(findSizeByCodeMock).toHaveBeenCalledWith(user.shopId, 'XL');
    expect(createSizeMock).toHaveBeenCalledWith(user.shopId, {
      code: 'XL',
      name: 'Cỡ lớn',
      sortOrder: 0,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'size',
        entityId: sizeRecord.id,
        newValues: {
          id: sizeRecord.id,
          code: 'XL',
          name: 'Cỡ lớn',
          sortOrder: 0,
          isActive: true,
        },
      }),
    );
  });

  it('rejects a duplicate Size code after canonicalization', async () => {
    findSizeByCodeMock.mockResolvedValue(sizeRecord);
    const service = new SizeService(sizeRepository, { log: auditLog });

    await expect(service.createSize(user, { code: ' xl ', name: 'Cỡ lớn' })).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS,
    });
    expect(createSizeMock).not.toHaveBeenCalled();
  });

  it('checks usage before deleting Color and Size', async () => {
    findColorByIdMock.mockResolvedValue(colorRecord);
    isColorInUseMock.mockResolvedValue(true);
    findSizeByIdMock.mockResolvedValue(sizeRecord);
    isSizeInUseMock.mockResolvedValue(true);

    await expect(
      new ColorService(colorRepository, { log: auditLog }).deleteColor(user, colorRecord.id),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_IN_USE });
    await expect(
      new SizeService(sizeRepository, { log: auditLog }).deleteSize(user, sizeRecord.id),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.SIZE_IN_USE });
    expect(deleteColorMock).not.toHaveBeenCalled();
    expect(deleteSizeMock).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});
