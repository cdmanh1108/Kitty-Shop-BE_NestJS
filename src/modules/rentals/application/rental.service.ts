import { RentalClaimLostError } from '../domain/rental-errors';
import { generateDatedReference } from '@common/utils/reference-number';
import { RENTAL_STATUS, type RentalStatus } from '@modules/rentals/domain/rental-status';
import { CHARGE_TYPE } from '@modules/rentals/domain/charge-type';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '@common/constants/permissions';
import { CLOCK, type Clock } from '@common/clock/clock';
import { createHash } from 'node:crypto';
import type { JsonSerialized } from '@common/types/json';
import type { RentalOrderDetails } from '../domain/rental.models';
import {
  calculateRentalDurationDays,
  canRescheduleRental,
  RENTAL_TRANSITION_FROM,
} from '../domain/rental-policy';
import {
  RENTAL_REPOSITORY,
  RentalOverlapError,
  type CreateRentalOrderData,
  type RentalRepository,
} from '../domain/rental.repository';
import type {
  AddRentalChargeInput,
  CreateRentalOrderInput,
  RentalListQuery,
  RescheduleRentalInput,
  ReturnRentalOrderInput,
  TransitionRentalInput,
} from './rental.contracts';

const CHARGE_TYPES: ReadonlySet<string> = new Set(Object.values(CHARGE_TYPE));
const RENTAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'nháp',
  RESERVED: 'đã đặt trước',
  CONFIRMED: 'đã xác nhận',
  ACTIVE: 'đang thuê',
  RETURNED: 'đã nhận trả',
  COMPLETED: 'đã hoàn thành',
  CANCELLED: 'đã hủy',
};

@Injectable()
export class RentalService {
  private readonly logger = new Logger(RentalService.name);
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(user: CurrentUser, query: RentalListQuery) {
    if (query.from && query.until) {
      calculateRentalDurationDays(new Date(query.from), new Date(query.until));
    }
    return this.repository.list({
      shopId: user.shopId,
      page: query.page,
      customerId: query.customerId,
      limit: query.limit,
      search: query.search,
      status: query.status,
      paymentStatus: query.paymentStatus,
      from: query.from ? new Date(query.from) : undefined,
      until: query.until ? new Date(query.until) : undefined,
    });
  }

  async get(user: CurrentUser, id: string) {
    const order = await this.repository.get(user.shopId, id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    return order;
  }

  async create(user: CurrentUser, input: CreateRentalOrderInput, idempotencyKey?: string) {
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc thuê.');
    if (!(await this.repository.customerExists(user.shopId, input.customerId))) {
      throw new NotFoundException('Khách hàng không tồn tại hoặc đã ngừng hoạt động.');
    }
    if (
      input.locationId &&
      !(await this.repository.locationExists(user.shopId, input.locationId))
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
      const claim = await this.repository.claimIdempotency({
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
        const variant = await this.repository.getBookableVariant({
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

      const order = await this.repository.createOrder({
        orderNumber: generateDatedReference('RT'),
        shopId: user.shopId,
        customerId: input.customerId,
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
          await this.repository.releaseIdempotency(user.shopId, scope, idempotencyKey, claimId);
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

  start(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(
      user,
      id,
      RENTAL_TRANSITION_FROM.ACTIVE,
      RENTAL_STATUS.ACTIVE,
      input.reason,
    );
  }

  cancel(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(
      user,
      id,
      RENTAL_TRANSITION_FROM.CANCELLED,
      RENTAL_STATUS.CANCELLED,
      input.reason,
    );
  }

  async returnCollateral(user: CurrentUser, id: string) {
    const order = await this.repository.returnCollateral(user.shopId, id, user.memberId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'COLLATERAL_RETURNED',
      entityType: 'rental_order',
      entityId: id,
    });
    return order;
  }

  async reschedule(user: CurrentUser, id: string, input: RescheduleRentalInput) {
    const current = await this.repository.getSchedule(user.shopId, id);
    if (!current) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (!canRescheduleRental(current.status)) {
      throw new BadRequestException('Chỉ có thể đổi lịch đơn đã đặt trước hoặc đã xác nhận.');
    }
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc thuê.');
    if (
      calculateRentalDurationDays(current.rentalStartAt, current.rentalEndAt) !==
      calculateRentalDurationDays(start, end)
    ) {
      throw new BadRequestException(
        'Thay đổi số ngày thuê cần tính lại giá. Vui lòng giữ nguyên số ngày thuê hoặc tạo lại đơn với giá mới.',
      );
    }
    try {
      const order = await this.repository.reschedule({
        shopId: user.shopId,
        orderId: id,
        from: start,
        until: end,
        changedBy: user.memberId,
      });
      if (!order)
        throw new BadRequestException('Không thể đổi lịch đơn thuê ở trạng thái hiện tại.');
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'RESCHEDULE',
        entityType: 'rental_order',
        entityId: id,
        newValues: { ...input },
      });
      return order;
    } catch (error) {
      if (error instanceof RentalOverlapError) throw new ConflictException(error.message);
      throw error;
    }
  }

  async addCharge(user: CurrentUser, id: string, input: AddRentalChargeInput) {
    if (!CHARGE_TYPES.has(input.chargeType))
      throw new BadRequestException('Loại phụ phí không hợp lệ.');
    const current = await this.repository.get(user.shopId, id);
    if (!current) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (current.status === RENTAL_STATUS.COMPLETED || current.status === RENTAL_STATUS.CANCELLED) {
      throw new BadRequestException('Không thể thêm phụ phí cho đơn thuê đã đóng hoặc đã hủy.');
    }
    if (current.settlement) {
      throw new BadRequestException('Không thể thêm phụ phí sau khi đã kết toán đơn thuê.');
    }
    const order = await this.repository.addCharge({
      shopId: user.shopId,
      orderId: id,
      chargeType: input.chargeType,
      description: input.description,
      amount: input.amount,
      quantity: input.quantity,
      createdBy: user.memberId,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'ADD_CHARGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { ...input },
    });
    return order;
  }

  async getReturnPreview(user: CurrentUser, id: string, returnedAt?: Date) {
    this.authorizeReturn(user);
    const order = await this.repository.get(user.shopId, id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    const preview = await this.repository.getReturnPreview(user.shopId, id, returnedAt);
    const items = order.items.flatMap((item) =>
      item.allocations.map((alloc) => ({
        inventoryItemId: alloc.inventoryItemId,
        sku: alloc.inventoryItem.sku,
        productName: item.productNameSnapshot,
        variantTitle: item.variantNameSnapshot,
      })),
    );
    return {
      rentalEndAt: preview.dueAt.toISOString(),
      actualReturnedAt: preview.actualReturnedAt.toISOString(),
      lateDays: preview.lateDays,
      dailyLateFeePerSet: preview.dailyLateFeePerSet,
      lateFee: preview.lateFee,
      additionalRentalFee: preview.additionalRental,
      items,
    };
  }

  async receiveReturn(user: CurrentUser, id: string, input: ReturnRentalOrderInput) {
    this.authorizeReturn(user);
    const order = await this.repository.get(user.shopId, id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (order.status !== RENTAL_STATUS.ACTIVE) {
      throw new BadRequestException('Chỉ có thể nhận trả cho đơn thuê đang hoạt động (ACTIVE).');
    }
    const result = await this.repository.receiveReturn({
      shopId: user.shopId,
      orderId: id,
      actualReturnedAt: input.actualReturnedAt,
      actorMemberId: user.memberId,
      actorUserId: user.userId,
      actorName: user.fullName,
      items: input.inspections.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        condition: item.condition,
        note: item.note,
      })),
      manualCharges: input.manualCharges,
      note: input.note,
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'RECEIVE_RETURN',
      entityType: 'rental_order',
      entityId: id,
      newValues: {
        actualReturnedAt: input.actualReturnedAt ? input.actualReturnedAt.toISOString() : null,
        itemCount: input.inspections.length,
        note: input.note ?? null,
      },
    });
    return result;
  }

  private authorizeReturn(user: CurrentUser) {
    if (!user.permissions?.includes(PERMISSIONS.RENTALS_RETURN)) {
      throw new ForbiddenException('Bạn không có quyền nhận trả đồ.');
    }
  }

  private async transition(
    user: CurrentUser,
    id: string,
    allowedFrom: RentalStatus[],
    toStatus: RentalStatus,
    reason?: string,
  ) {
    const currentStatus = await this.repository.getStatus(user.shopId, id);
    if (!currentStatus) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (!allowedFrom.some((status) => status === currentStatus)) {
      throw new BadRequestException({
        code: 'RENTAL_TRANSITION_NOT_ALLOWED',
        message: `Không thể chuyển đơn thuê từ trạng thái ${RENTAL_STATUS_LABELS[currentStatus] ?? 'không hợp lệ'} sang ${RENTAL_STATUS_LABELS[toStatus] ?? 'không hợp lệ'}.`,
      });
    }
    const order = await this.repository.transition({
      shopId: user.shopId,
      orderId: id,
      fromStatuses: allowedFrom,
      toStatus,
      changedBy: user.memberId,
      reason,
    });
    if (!order)
      throw new ConflictException(
        'Trạng thái đơn thuê vừa được thay đổi. Vui lòng tải lại và thử lại.',
      );
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { fromStatus: currentStatus, toStatus, reason },
    });
    return order;
  }
}
