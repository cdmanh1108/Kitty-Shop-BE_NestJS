import { fixedClock } from './fixtures/rental.fixture';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import * as ts from 'typescript';
import type { AuditPort } from '../src/modules/audit/domain/audit.port';
import type { CurrentUser } from '../src/common/types/current-user';
import { paginateMeta } from '../src/common/types/pagination';
import { CreateRentalOrderReqDto, RentalListQueryDto } from '../src/modules/rentals/api/rental.dto';
import {
  toCreateRentalOrderInput,
  toRentalListQuery,
} from '../src/modules/rentals/api/rental.mapper';
import { RentalService } from '../src/modules/rentals/application/rental.service';
import type { RentalRepository } from '../src/modules/rentals/domain/rental.repository';
import { ReportService } from '../src/modules/reports/application/report.service';
import type { ReportRepository } from '../src/modules/reports/domain/report.repository';
import { toPerformanceQuery } from '../src/modules/reports/api/report.mapper';
import { PerformanceQueryDto } from '../src/modules/reports/api/report.dto';

const user: CurrentUser = {
  userId: 'user',
  memberId: 'member',
  shopId: 'shop',
  email: null,
  fullName: 'Admin',
  permissions: [],
};
function rentalRepository(): jest.Mocked<RentalRepository> {
  return {
    customerExists: jest.fn().mockResolvedValue(true),
    locationExists: jest.fn().mockResolvedValue(true),
    getBookableVariant: jest.fn(),
    createOrder: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    getStatus: jest.fn(),
    getSchedule: jest.fn(),
    transition: jest.fn(),
    reschedule: jest.fn(),
    addCharge: jest.fn(),
    receiveCollateral: jest.fn(),
    returnCollateral: jest.fn(),
    claimIdempotency: jest.fn(),
    releaseIdempotency: jest.fn(),
  };
}
const audit = (): AuditPort => ({ log: () => Promise.resolve() });

describe('transport to application contracts', () => {
  const request = () =>
    plainToInstance(CreateRentalOrderReqDto, {
      customerId: 'customer',
      rentalStartAt: '2026-09-12T10:00:00+07:00',
      rentalEndAt: '2026-09-13T10:00:00+07:00',
      items: [{ variantId: 'variant', quantity: 1 }],
      delivery: { method: 'CUSTOMER_PICKUP' },
    });

  it('maps nested DTO instances to plain inputs without changing defaults or idempotency bytes', () => {
    const dto = request();
    const input = toCreateRentalOrderInput(dto);
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(input.items[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(input.delivery)).toBe(Object.prototype);
    expect(input).not.toBe(dto);
    expect(input.items).not.toBe(dto.items);
    expect(JSON.stringify(input)).toBe(JSON.stringify(dto));
    expect(input.charges).toEqual([]);
    expect(input.discountTotal).toBe(0);
    expect(input.delivery?.shippingFee).toBe(0);
  });

  it('preserves validated query defaults, offset timestamps and tenant scope', async () => {
    const repository = rentalRepository();
    const result = { items: [], meta: paginateMeta(2, 20, 0) };
    repository.list.mockResolvedValue(result);
    const query = plainToInstance(RentalListQueryDto, {
      page: '2',
      from: '2026-09-12T10:00:00+07:00',
    });
    const service = new RentalService(repository, audit(), fixedClock);
    expect(await service.list(user, toRentalListQuery(query))).toBe(result);
    expect(repository.list.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        shopId: 'shop',
        page: 2,
        limit: 20,
        from: new Date('2026-09-12T03:00:00Z'),
        until: undefined,
      }),
    );
  });

  it('replays the stored response with the same hash and performs no order write', async () => {
    const repository = rentalRepository();
    repository.claimIdempotency.mockResolvedValue({ state: 'COMPLETED', responseBody: null });
    const dto = request();
    const service = new RentalService(repository, audit(), fixedClock);
    await expect(service.create(user, toCreateRentalOrderInput(dto), 'retry')).resolves.toBeNull();
    expect(repository.claimIdempotency.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        shopId: user.shopId,
        scope: 'rental-order.create',
        key: 'retry',
        requestHash: createHash('sha256').update(JSON.stringify(dto)).digest('hex'),
      }),
    );
    expect(repository.createOrder.mock.calls).toHaveLength(0);
  });

  it('keeps the existing missing-order and invalid schedule errors', async () => {
    const repository = rentalRepository();
    repository.get.mockResolvedValue(null);
    const service = new RentalService(repository, audit(), fixedClock);
    await expect(service.get(user, 'missing')).rejects.toThrow('Rental order not found');
    const input = toCreateRentalOrderInput(request());
    input.rentalEndAt = input.rentalStartAt;
    await expect(service.create(user, input)).rejects.toThrow('rentalStartAt must be earlier');
    expect(repository.createOrder.mock.calls).toHaveLength(0);
  });

  it('retains report money strings and date conversion without remapping output', async () => {
    const rows = [
      { id: 'p', code: 'P001', name: 'Product', rentalCount: 2, bookedRevenue: '100000.00' },
    ];
    const repository: jest.Mocked<ReportRepository> = {
      shopTimezone: jest.fn(),
      revenue: jest.fn(),
      productPerformance: jest.fn().mockResolvedValue(rows),
      customerPerformance: jest.fn(),
    };
    const dto = plainToInstance(PerformanceQueryDto, {
      from: '2026-09-01T00:00:00+07:00',
      until: '2026-09-02T00:00:00+07:00',
      limit: '3',
    });
    const result = await new ReportService(repository, {
      now: () => new Date(),
    }).productPerformance(user, toPerformanceQuery(dto));
    expect(result).toBe(rows);
    expect(repository.productPerformance.mock.calls[0]?.[0]).toEqual({
      shopId: 'shop',
      from: new Date(dto.from!),
      until: new Date(dto.until!),
      limit: 3,
    });
    expect(JSON.stringify(result)).toBe(JSON.stringify(rows));
  });

  it('preserves empty pagination semantics', () => {
    expect(paginateMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('does not reinterpret optional null arrays accepted by transport validation', () => {
    const dto = plainToInstance(CreateRentalOrderReqDto, {
      customerId: 'customer',
      rentalStartAt: '2026-09-12',
      rentalEndAt: '2026-09-13',
      items: [{ variantId: 'variant' }],
      charges: null,
    });
    expect(JSON.stringify(toCreateRentalOrderInput(dto))).toBe(JSON.stringify(dto));
  });
});

describe('inner-layer import guard', () => {
  it('keeps transport/infrastructure dependencies and unknown results out of inner contracts', () => {
    const violations: string[] = [];
    function scan(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(file);
          continue;
        }
        if (!file.endsWith('.ts') || !/[\\/](application|domain)[\\/]/.test(file)) continue;
        const source = readFileSync(file, 'utf8');
        if (source.includes('@modules/audit/application/audit.service'))
          violations.push(file + ': concrete audit dependency');
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const domain = /[\\/]domain[\\/]/.test(file);
        function visit(node: ts.Node) {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const target = node.moduleSpecifier.text;
            if (
              /\/api\/|\.dto$|swagger|class-validator|class-transformer|@prisma|\/infrastructure\//.test(
                target,
              ) ||
              (domain && /@nestjs|\/application\//.test(target))
            )
              violations.push(`${file}: ${target}`);
          }
          if (node.kind === ts.SyntaxKind.UnknownKeyword || node.kind === ts.SyntaxKind.AnyKeyword)
            violations.push(`${file}: untyped contract`);
          ts.forEachChild(node, visit);
        }
        visit(ast);
      }
    }
    scan(join(process.cwd(), 'src/modules'));
    expect(violations).toEqual([]);
  });
});
