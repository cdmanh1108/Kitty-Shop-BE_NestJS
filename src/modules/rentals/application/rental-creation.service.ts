import { RentalClaimLostError } from '../domain/rental-errors';
import { CHARGE_TYPE } from '../domain/charge-type';
import { generateDatedReference } from '@common/utils/reference-number';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '@common/clock/clock';
import { createHash } from 'node:crypto';
import type { JsonSerialized } from '@common/types/json';
import type { RentalOrderDetails } from '../domain/rental.models';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  RENTAL_AVAILABILITY_READER,
  RENTAL_CREATION_VALIDATOR,
  RENTAL_CREATION_REPOSITORY,
  RentalOverlapError,
  type CreateRentalOrderData,
  type RentalAvailabilityReader,
  type RentalCreationValidator,
  type RentalCreationRepository,
} from '../domain/rental.repository';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import type { CreateRentalOrderInput } from './rental.contracts';

const CHARGE_TYPES: ReadonlySet<string> = new Set(Object.values(CHARGE_TYPE));
@Injectable()
export class RentalCreationService {
  private readonly logger = new Logger(RentalCreationService.name);
  constructor(
    @Inject(RENTAL_CREATION_REPOSITORY) private readonly creation: RentalCreationRepository,
    @Inject(RENTAL_CREATION_VALIDATOR) private readonly creationValidator: RentalCreationValidator,
    @Inject(RENTAL_AVAILABILITY_READER) private readonly availability: RentalAvailabilityReader,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(user: CurrentUser, input: CreateRentalOrderInput, idempotencyKey?: string) {
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc thuê.');
    if (!(await this.creationValidator.customerExists(user.shopId, input.customerId))) {
      throw new NotFoundException('Khách hàng không tồn tại hoặc đã ngừng hoạt động.');
    }
    if (
      input.locationId &&
      !(await this.creationValidator.locationExists(user.shopId, input.locationId))
    ) {
      throw new NotFoundException('Địa điểm cửa hàng không tồn tại hoặc đã ngừng hoạt động.');
    }

    const variantIds = input.items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Mỗi biến thể sản phẩm chỉ được xuất hiện một lần trong đơn thuê.',
      );
    }

    for (const charge of input.charges) {
      if (!CHARGE_TYPES.has(charge.chargeType)) {
        throw new BadRequestException(`Loại phụ phí không hợp lệ: ${charge.chargeType}.`);
      }
    }

    const durationDays = calculateRentalDurationDays(start, end);
    const scope = 'rental-order.create';
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let claimId: string | undefined;

    if (idempotencyKey) {
      if (idempotencyKey.length > 255)
        throw new BadRequestException('Mã chống trùng yêu cầu không được dài quá 255 ký tự.');
      const claim = await this.creation.claimIdempotency({
        shopId: user.shopId,
        scope,
        key: idempotencyKey,
        requestHash,
        expiresAt: new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000),
      });
      if (claim.state === 'HASH_MISMATCH') {
        throw new ConflictException(
          'Mã chống trùng đã được sử dụng cho một yêu cầu khác. Vui lòng gửi lại với mã mới.',
        );
      }
      if (claim.state === 'COMPLETED')
        return claim.responseBody as JsonSerialized<RentalOrderDetails>;
      if (claim.state === 'IN_PROGRESS') {
        throw new ConflictException('Yêu cầu này đang được xử lý. Vui lòng chờ và thử lại.');
      }
      claimId = claim.claimId;
    }

    try {
      const lines: CreateRentalOrderData['lines'] = [];
      for (const item of input.items) {
        const variant = await this.availability.getBookableVariant({
          shopId: user.shopId,
          variantId: item.variantId,
          durationDays,
          from: start,
          until: end,
        });
        if (!variant)
          throw new NotFoundException(`Biến thể ${item.variantId} không được phép cho thuê.`);
        const effectiveUnitPrice =
          item.unitRentalPrice !== undefined && item.unitRentalPrice !== null
            ? item.unitRentalPrice
            : variant.ratePrice;

        if (effectiveUnitPrice === null || effectiveUnitPrice < 0) {
          throw new BadRequestException(
            `Chưa cấu hình giá thuê ${durationDays} ngày cho biến thể ${variant.variantCode}. Vui lòng nhập giá thuê ghi đè.`,
          );
        }

        const byId = new Map(
          variant.availableInventory.map((inventory) => [inventory.id, inventory]),
        );
        let selected: Array<{ id: string; sku: string }>;
        if (item.inventoryItemIds?.length) {
          if (item.inventoryItemIds.length !== item.quantity) {
            throw new BadRequestException('Số món đồ được chọn phải bằng số lượng thuê.');
          }
          selected = item.inventoryItemIds.map((id) => {
            const inventory = byId.get(id);
            if (!inventory) {
              throw new ConflictException(
                `Món đồ ${id} không còn trống trong khoảng thời gian này.`,
              );
            }
            return inventory;
          });
        } else {
          selected = variant.availableInventory.slice(0, item.quantity);
        }
        if (selected.length < item.quantity) {
          throw new ConflictException(
            `Biến thể ${variant.variantCode} chỉ còn ${variant.availableInventory.length} món đồ có thể cho thuê.`,
          );
        }

        const variantName = [variant.variantCode, variant.sizeName, variant.colorName]
          .filter(Boolean)
          .join(' / ');
        lines.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.productName,
          variantName,
          quantity: item.quantity,
          unitRentalPrice: effectiveUnitPrice,
          depositAmount: variant.depositPerItem * item.quantity,
          lineTotal: effectiveUnitPrice * item.quantity,
          pricingSnapshot: {
            durationDays,
            unitRentalPrice: effectiveUnitPrice,
            depositPerItem: variant.depositPerItem,
          },
          inventory: selected,
        });
      }

      const order = await this.creation.createOrder({
        orderNumber: generateDatedReference('RT'),
        shopId: user.shopId,
        customerId: input.customerId,
        source: RENTAL_ORDER_SOURCE.OFFLINE,
        webAccountId: null,
        locationId: input.locationId,
        rentalStartAt: start,
        rentalEndAt: end,
        discountTotal: input.discountTotal,
        note: input.note,
        internalNote: input.internalNote,
        createdBy: user.memberId,
        idempotency:
          idempotencyKey && claimId ? { scope, key: idempotencyKey, claimId } : undefined,
        lines,
        charges: input.charges,
        delivery: input.delivery
          ? {
              ...input.delivery,
              scheduledAt: input.delivery.scheduledAt
                ? new Date(input.delivery.scheduledAt)
                : undefined,
            }
          : undefined,
        collateral: input.collateral,
      });

      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'CREATE',
        entityType: 'rental_order',
        entityId: order?.id,
        newValues: {
          rentalStartAt: input.rentalStartAt,
          rentalEndAt: input.rentalEndAt,
          itemCount: input.items.length,
        },
      });

      return order;
    } catch (error) {
      if (idempotencyKey && claimId) {
        try {
          await this.creation.releaseIdempotency(user.shopId, scope, idempotencyKey, claimId);
        } catch (releaseError) {
          this.logger.error({
            event: 'rental.idempotency.release.failed',
            shopId: user.shopId,
            error: releaseError instanceof Error ? releaseError : new Error('Lỗi không xác định.'),
          });
        }
      }
      if (error instanceof RentalOverlapError || error instanceof RentalClaimLostError)
        throw new ConflictException(error.message);
      throw error;
    }
  }
}
