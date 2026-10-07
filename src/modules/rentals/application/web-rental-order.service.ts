import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { generateDatedReference } from '@common/utils/reference-number';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  BOOKING_CUSTOMER_RESOLVER,
  InvalidCustomerPhoneError,
  type BookingCustomerResolver,
} from '@modules/customers/public/booking-customer';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/public/rental-policy';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import { assertOnlineRentalDuration } from '../domain/rental-cycle-pricing';
import {
  rentalBillableQuantity,
  resolveRentalLinePricing,
} from '../domain/rental-pricing-snapshot';
import {
  RENTAL_AVAILABILITY_READER,
  type RentalAvailabilityReader,
} from '../domain/ports/rental-availability.port';
import {
  RENTAL_CREATION_REPOSITORY,
  type CreateRentalOrderData,
  type RentalCreationRepository,
} from '../domain/ports/rental-creation.port';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import type {
  WebCreateOrderInput,
  WebCreateOrderResult,
  WebCheckoutOwnerContext,
} from './web-rental.contracts';
import { resolveWebRentalSelection } from './web-rental-selection';
import { RENTAL_BILLING_ROLE } from '../domain/rental-accessories';
import {
  parseWebRentalDateRangeInput,
  assertWebRentalItemsInput,
  throwForInvalidWebRentalSelection,
} from './web-rental-input';
import {
  isStoredWebRentalCreateResult,
  toWebRentalCreateResult,
} from '../domain/web-rental-create-result';
import {
  InvalidRentalCustomerDetailsError,
  RentalAuthenticationRequiredError,
  InvalidRentalInputError,
  InvalidRentalIdempotencyKeyError,
  RentalCreationConflictError,
  RentalIdempotencyConflictError,
  RentalInventoryConflictError,
  RentalIdempotencyReplayUnavailableError,
  RentalNotFoundError,
  UnsupportedRentalCollateralError,
} from './rental.errors';
import { WEB_CHECKOUT_PAYMENT_PREFERENCES } from '../domain/web-payment-preference';

const WEB_CREATE_IDEMPOTENCY_SCOPE = 'web-rental-order.create.v1';
const WEB_CREATE_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { readonly [key: string]: StableJsonValue }
  | readonly StableJsonValue[];

function stableJson(value: StableJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value as readonly StableJsonValue[];
    return `[${items.map((item) => stableJson(item)).join(',')}]`;
  }
  const record = value as { readonly [key: string]: StableJsonValue };
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
@Injectable()
export class WebRentalOrderService {
  constructor(
    @Inject(RENTAL_CREATION_REPOSITORY) private readonly creation: RentalCreationRepository,
    @Inject(RENTAL_AVAILABILITY_READER) private readonly availability: RentalAvailabilityReader,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policyProvider: RentalPolicyProvider,
    @Inject(BOOKING_CUSTOMER_RESOLVER)
    private readonly customerRepository: BookingCustomerResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createOrder(
    shopId: string,
    req: WebCreateOrderInput,
    rawIdempotencyKey?: string | string[],
    owner: WebCheckoutOwnerContext = { webAccountId: null },
  ): Promise<WebCreateOrderResult> {
    if (!owner.webAccountId || !owner.email) throw new RentalAuthenticationRequiredError();
    if (!WEB_CHECKOUT_PAYMENT_PREFERENCES.includes(req.paymentMethod))
      throw new InvalidRentalInputError(
        'Vui lòng chọn chuyển khoản hoặc tiền mặt.',
        'INVALID_PAYMENT_PREFERENCE',
      );
    const { from, until } = parseWebRentalDateRangeInput(req);
    assertWebRentalItemsInput(req.items);

    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const requestHash = createHash('sha256')
      .update(
        stableJson({
          ownerScope: this.ownerScope(owner.webAccountId),
          command: this.webCommandIdentity(req),
        }),
      )
      .digest('hex');
    const claim = await this.creation.claimIdempotency({
      shopId,
      scope: WEB_CREATE_IDEMPOTENCY_SCOPE,
      key: idempotencyKey,
      requestHash,
      expiresAt: new Date(this.clock.now().getTime() + WEB_CREATE_IDEMPOTENCY_RETENTION_MS),
    });
    if (claim.state === 'HASH_MISMATCH') {
      throw new RentalIdempotencyConflictError(
        'Mã chống trùng đã được sử dụng cho một yêu cầu khác.',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    if (claim.state === 'IN_PROGRESS') {
      throw new RentalIdempotencyConflictError(
        'Yêu cầu này đang được xử lý. Vui lòng thử lại với cùng mã chống trùng.',
        'IDEMPOTENCY_IN_PROGRESS',
      );
    }
    if (claim.state === 'COMPLETED') {
      if (!isStoredWebRentalCreateResult(claim.responseBody)) {
        throw new RentalIdempotencyReplayUnavailableError();
      }
      return claim.responseBody.result;
    }

    try {
      const policy = await this.policyProvider.getPolicy(shopId);
      const durationDays = calculateRentalDurationDays(from, until);
      assertOnlineRentalDuration(durationDays, policy.rentalPricing);
      const billableQuantity = rentalBillableQuantity(req.items);

      // Collateral preference handling - validate upfront
      const collateralMethod = req.collateral?.method ?? 'CASH';
      const documentType = req.collateral?.documentType;

      if (!policy.deposit.allowedMethods.includes(collateralMethod)) {
        throw new UnsupportedRentalCollateralError(
          'Phương thức đặt cọc không được chính sách hỗ trợ.',
        );
      }
      if (collateralMethod === 'DOCUMENT') {
        if (!documentType || !policy.deposit.allowedDocumentTypes.includes(documentType)) {
          throw new UnsupportedRentalCollateralError(
            'Loại giấy tờ đặt cọc không được chính sách hỗ trợ.',
          );
        }
      }

      const selection = await resolveWebRentalSelection(this.availability, {
        shopId,
        items: req.items,
        durationDays,
        from,
        until,
      });
      if (!selection.valid) {
        throwForInvalidWebRentalSelection(selection.reason);
        throw new RentalNotFoundError('Sản phẩm đã chọn không khả dụng để thuê.');
      }

      const lines: CreateRentalOrderData['lines'] = [];
      const allocatedInventoryIds = new Set<string>();
      for (const { variant, quantity, billingRole } of selection.demands) {
        const availableInventory = variant.availableInventory.filter(
          (inventory) => !allocatedInventoryIds.has(inventory.id),
        );
        if (availableInventory.length < quantity) {
          throw new RentalInventoryConflictError(
            `Sản phẩm ${variant.productName} không đủ số lượng có sẵn trong khoảng ngày đã chọn.`,
          );
        }

        const selectedInventory = availableInventory.slice(0, quantity);
        selectedInventory.forEach((inventory) => allocatedInventoryIds.add(inventory.id));
        const variantName = [variant.variantCode, variant.sizeName, variant.colorName]
          .filter(Boolean)
          .join(' / ');

        lines.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.productName,
          variantName,
          quantity,
          billingRole,
          ...resolveRentalLinePricing({
            durationDays,
            billableQuantity,
            policy: policy.rentalPricing,
            quantity,
            depositPerItem: variant.depositPerItem,
            billingRole,
          }),
          inventory: selectedInventory,
        });
      }

      const standardShippingFee = policy.delivery.standardShippingFee;
      const shippingFee = req.delivery.method === 'shop_delivery' ? standardShippingFee : 0;

      // Persist the booking contact independently of the booking
      // transaction, but only after all no-write selection, price, and inventory
      // preflight has passed. A later booking failure can therefore leave one
      // reusable profile, never a partial order.
      let customer: { id: string };
      try {
        customer = await this.customerRepository.resolveForBooking({
          shopId,
          fullName: req.customer.name,
          phone: req.customer.phone,
          email: owner.email,
        });
      } catch (error) {
        if (error instanceof InvalidCustomerPhoneError) {
          throw new InvalidRentalCustomerDetailsError('Số điện thoại người thuê không hợp lệ.');
        }
        throw error;
      }

      const order = await this.creation.createOrder({
        orderNumber: generateDatedReference('RT'),
        shopId,
        customerId: customer.id,
        source: RENTAL_ORDER_SOURCE.ONLINE,
        webAccountId: owner.webAccountId,
        notificationEmail: owner.email,
        rentalStartAt: from,
        rentalEndAt: until,
        discountTotal: 0,
        ...(req.loyaltyRewardId
          ? {
              loyaltyRewardId: req.loyaltyRewardId,
              loyaltyRewardRedeemedAt: this.clock.now(),
            }
          : {}),
        preferredPaymentMethod: req.paymentMethod,
        storefrontEligibility: true,
        idempotency: {
          scope: WEB_CREATE_IDEMPOTENCY_SCOPE,
          key: idempotencyKey,
          claimId: claim.claimId,
          responseFormat: 'WEB_RENTAL_ORDER_CREATE_V1',
        },
        note: req.customer.note,
        internalNote: 'Đơn tạo từ Web Storefront',
        lines,
        // rental-booking owns the delivery-backed SHIPPING charge. Web has no
        // independent supplemental charges, so mirroring shipping here would
        // persist and total the same fee twice.
        charges: [],
        delivery: {
          direction: 'OUTBOUND',
          method: req.delivery.method === 'shop_delivery' ? 'DELIVERY' : 'PICKUP',
          recipientName: req.customer.name,
          recipientPhone: req.customer.phone,
          addressLine: req.delivery.address,
          shippingFee,
        },
        collateral: {
          method: collateralMethod,
          ...(collateralMethod === 'DOCUMENT' && documentType ? { documentType } : {}),
        },
      });

      if (!order) {
        throw new RentalCreationConflictError('Không thể tạo đơn thuê.');
      }

      return toWebRentalCreateResult(order);
    } catch (error) {
      try {
        await this.creation.releaseIdempotency(
          shopId,
          WEB_CREATE_IDEMPOTENCY_SCOPE,
          idempotencyKey,
          claim.claimId,
        );
      } catch {
        // Owner-fenced cleanup is best effort; stale recovery remains available.
      }
      throw error;
    }
  }

  private requireIdempotencyKey(value: string | string[] | undefined): string {
    if (value === undefined) {
      throw new InvalidRentalIdempotencyKeyError(
        'Yêu cầu phải có một Idempotency-Key hợp lệ.',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    if (Array.isArray(value) || typeof value !== 'string') {
      throw new InvalidRentalIdempotencyKeyError(
        'Idempotency-Key phải có đúng một giá trị.',
        'IDEMPOTENCY_KEY_INVALID',
      );
    }
    if (!/^[\x21-\x7e]{1,255}$/.test(value)) {
      throw new InvalidRentalIdempotencyKeyError(
        'Idempotency-Key phải có từ 1 đến 255 ký tự ASCII không có khoảng trắng.',
        'IDEMPOTENCY_KEY_INVALID',
      );
    }
    return value;
  }

  private webCommandIdentity(req: WebCreateOrderInput): StableJsonValue {
    return {
      version: 2,
      command: {
        customer: {
          name: req.customer.name,
          phone: req.customer.phone,
          note: req.customer.note ?? null,
        },
        pickupDate: req.pickupDate,
        returnDate: req.returnDate,
        items: req.items.map((item) => ({
          productId: item.productId ?? null,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
          // Preserve hashes for old paid-only requests; free/paid intent is never interchangeable.
          ...(item.billingRole === RENTAL_BILLING_ROLE.FREE_ACCESSORY
            ? { billingRole: item.billingRole }
            : {}),
        })),
        delivery: {
          method: req.delivery.method,
          address: req.delivery.address ?? null,
        },
        paymentMethod: req.paymentMethod,
        collateral: {
          method: req.collateral?.method ?? 'CASH',
          documentType: req.collateral?.documentType ?? null,
        },
        ...(req.loyaltyRewardId ? { loyaltyRewardId: req.loyaltyRewardId } : {}),
      },
    };
  }

  private ownerScope(webAccountId: string | null): string {
    return webAccountId ? `web-account:${webAccountId}` : 'guest';
  }
}
