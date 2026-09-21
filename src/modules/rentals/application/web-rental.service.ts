import {
  BadRequestException,
  ConflictException,
  Inject,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { generateDatedReference } from '@common/utils/reference-number';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  InvalidCustomerPhoneError,
  normalizeCustomerPhone,
} from '@modules/customers/domain/customer-phone';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '@modules/customers/domain/customer.repository';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/domain/rental-policy';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  RENTAL_REPOSITORY,
  type CreateRentalOrderData,
  type RentalRepository,
} from '../domain/rental.repository';
import type {
  WebAvailabilityQueryInput,
  WebAvailabilityResult,
  WebCreateOrderInput,
  WebCreateOrderResult,
  WebOrderLookupInput,
  WebOrderLookupResult,
  WebRentalQuoteInput,
  WebRentalQuoteResult,
} from './web-rental.contracts';
import { resolveWebRentalSelection, type WebRentalSelectionFailure } from './web-rental-selection';
import {
  assertWebRentalItems,
  parseWebRentalDateRange,
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_MAX_QUANTITY_PER_ITEM,
  WEB_RENTAL_MAX_TOTAL_QUANTITY,
  WebRentalInputValidationError,
} from './web-rental-input-validation';
import {
  isStoredWebRentalCreateResult,
  toWebRentalCreateResult,
} from '../domain/web-rental-create-result';

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
export class WebRentalService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policyProvider: RentalPolicyProvider,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: CustomerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async checkAvailability(
    shopId: string,
    query: WebAvailabilityQueryInput,
  ): Promise<WebAvailabilityResult> {
    const { from, until } = this.parseDateRange(query);
    this.assertItems([{ productId: query.productId, variantId: query.variantId, quantity: 1 }]);

    const durationDays = calculateRentalDurationDays(from, until);

    const selection = await resolveWebRentalSelection(this.repository, {
      shopId,
      items: [{ productId: query.productId, variantId: query.variantId, quantity: 1 }],
      durationDays,
      from,
      until,
    });
    if (!selection.valid) {
      this.throwForInvalidSelection(selection.reason);
      return { available: false, availableQuantity: 0 };
    }

    const demand = selection.demands[0];
    if (!demand) return { available: false, availableQuantity: 0 };
    const availableQuantity = demand.variant.availableInventory.length;
    return { available: availableQuantity > 0, availableQuantity };
  }

  async calculateQuote(shopId: string, req: WebRentalQuoteInput): Promise<WebRentalQuoteResult> {
    const { from, until } = this.parseDateRange(req);
    this.assertItems(req.items);

    const policy = await this.policyProvider.getPolicy(shopId);
    const durationDays = calculateRentalDurationDays(from, until);
    const selection = await resolveWebRentalSelection(this.repository, {
      shopId,
      items: req.items,
      durationDays,
      from,
      until,
    });
    if (!selection.valid) {
      this.throwForInvalidSelection(selection.reason);
    }
    let rentalSubtotal = 0;
    let depositAmount = 0;
    let allAvailable = selection.valid;

    if (selection.valid) {
      for (const { variant, quantity } of selection.demands) {
        if (variant.ratePrice === null) {
          allAvailable = false;
          continue;
        }
        if (variant.availableInventory.length < quantity) allAvailable = false;
        rentalSubtotal += variant.ratePrice * quantity;
        depositAmount += variant.depositPerItem * quantity;
      }
    }

    const standardShippingFee = policy.delivery.standardShippingFee;
    const shippingFee = req.deliveryMethod === 'shop_delivery' ? standardShippingFee : 0;
    const totalAmount = rentalSubtotal + shippingFee;

    return {
      durationDays,
      rentalSubtotal,
      depositAmount,
      shippingFee,
      totalAmount,
      currency: 'VND',
      available: allAvailable,
    };
  }

  async createOrder(
    shopId: string,
    req: WebCreateOrderInput,
    rawIdempotencyKey?: string | string[],
  ): Promise<WebCreateOrderResult> {
    const { from, until } = this.parseDateRange(req);
    this.assertItems(req.items);

    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const requestHash = createHash('sha256')
      .update(stableJson(this.webCommandIdentity(req)))
      .digest('hex');
    const claim = await this.repository.claimIdempotency({
      shopId,
      scope: WEB_CREATE_IDEMPOTENCY_SCOPE,
      key: idempotencyKey,
      requestHash,
      expiresAt: new Date(this.clock.now().getTime() + WEB_CREATE_IDEMPOTENCY_RETENTION_MS),
    });
    if (claim.state === 'HASH_MISMATCH') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Mã chống trùng đã được sử dụng cho một yêu cầu khác.',
      });
    }
    if (claim.state === 'IN_PROGRESS') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'Yêu cầu này đang được xử lý. Vui lòng thử lại với cùng mã chống trùng.',
      });
    }
    if (claim.state === 'COMPLETED') {
      if (!isStoredWebRentalCreateResult(claim.responseBody)) {
        throw new InternalServerErrorException({
          code: 'IDEMPOTENCY_REPLAY_INVALID',
          message: 'Không thể khôi phục kết quả yêu cầu đã hoàn tất.',
        });
      }
      return claim.responseBody.result;
    }

    try {
      const policy = await this.policyProvider.getPolicy(shopId);
      const durationDays = calculateRentalDurationDays(from, until);

      // Collateral preference handling - validate upfront
      const collateralMethod = req.collateral?.method ?? 'CASH';
      const documentType = req.collateral?.documentType;

      if (!policy.deposit.allowedMethods.includes(collateralMethod)) {
        throw new BadRequestException('Phương thức đặt cọc không được chính sách hỗ trợ.');
      }
      if (collateralMethod === 'DOCUMENT') {
        if (!documentType || !policy.deposit.allowedDocumentTypes.includes(documentType)) {
          throw new BadRequestException('Loại giấy tờ đặt cọc không được chính sách hỗ trợ.');
        }
      }

      const selection = await resolveWebRentalSelection(this.repository, {
        shopId,
        items: req.items,
        durationDays,
        from,
        until,
      });
      if (!selection.valid) {
        this.throwForInvalidSelection(selection.reason);
        throw new NotFoundException('Sản phẩm đã chọn không khả dụng để thuê.');
      }

      const lines: CreateRentalOrderData['lines'] = [];
      for (const { variant, quantity } of selection.demands) {
        if (variant.ratePrice === null) {
          throw new BadRequestException(
            `Sản phẩm ${variant.productName} chưa được cấu hình giá thuê cho ${durationDays} ngày.`,
          );
        }

        if (variant.availableInventory.length < quantity) {
          throw new ConflictException(
            `Sản phẩm ${variant.productName} không đủ số lượng có sẵn trong khoảng ngày đã chọn.`,
          );
        }

        const selectedInventory = variant.availableInventory.slice(0, quantity);
        const variantName = [variant.variantCode, variant.sizeName, variant.colorName]
          .filter(Boolean)
          .join(' / ');

        lines.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.productName,
          variantName,
          quantity,
          unitRentalPrice: variant.ratePrice,
          depositAmount: variant.depositPerItem * quantity,
          lineTotal: variant.ratePrice * quantity,
          pricingSnapshot: {
            durationDays,
            unitRentalPrice: variant.ratePrice,
            depositPerItem: variant.depositPerItem,
          },
          inventory: selectedInventory,
        });
      }

      const standardShippingFee = policy.delivery.standardShippingFee;
      const shippingFee = req.delivery.method === 'shop_delivery' ? standardShippingFee : 0;

      // C13 deliberately persists a valid guest profile independently of the booking
      // transaction, but only after all no-write selection, price, and inventory
      // preflight has passed. A later booking failure can therefore leave one
      // reusable profile, never a partial order.
      let customer: { id: string };
      try {
        customer = await this.customerRepository.resolveForBooking({
          shopId,
          fullName: req.customer.name,
          phone: req.customer.phone,
          email: req.customer.email,
          facebook: req.customer.facebookOrZalo,
        });
      } catch (error) {
        if (error instanceof InvalidCustomerPhoneError) {
          throw new BadRequestException('Số điện thoại người thuê không hợp lệ.');
        }
        throw error;
      }

      const order = await this.repository.createOrder({
        orderNumber: generateDatedReference('RT'),
        shopId,
        customerId: customer.id,
        rentalStartAt: from,
        rentalEndAt: until,
        discountTotal: 0,
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
        throw new ConflictException('Không thể tạo đơn thuê.');
      }

      return toWebRentalCreateResult(order);
    } catch (error) {
      try {
        await this.repository.releaseIdempotency(
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
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Yêu cầu phải có một Idempotency-Key hợp lệ.',
      });
    }
    if (Array.isArray(value) || typeof value !== 'string') {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key phải có đúng một giá trị.',
      });
    }
    if (!/^[\x21-\x7e]{1,255}$/.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key phải có từ 1 đến 255 ký tự ASCII không có khoảng trắng.',
      });
    }
    return value;
  }

  private parseDateRange(input: { pickupDate: string; returnDate: string }) {
    try {
      return parseWebRentalDateRange(input);
    } catch (error) {
      if (!(error instanceof WebRentalInputValidationError)) throw error;
      if (error.code === 'INVALID_CALENDAR_DATE') {
        throw new BadRequestException(
          'Ngày thuê phải là ngày lịch hợp lệ theo định dạng YYYY-MM-DD.',
        );
      }
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }
  }

  private assertItems(items: WebRentalQuoteInput['items']): void {
    try {
      assertWebRentalItems(items);
    } catch (error) {
      if (!(error instanceof WebRentalInputValidationError)) throw error;
      switch (error.code) {
        case 'INVALID_SELECTION':
          throw new BadRequestException('Vui lòng cung cấp productId hoặc variantId.');
        case 'INVALID_QUANTITY':
          throw new BadRequestException(
            `Số lượng thuê mỗi dòng phải là số nguyên từ 1 đến ${WEB_RENTAL_MAX_QUANTITY_PER_ITEM}.`,
          );
        case 'TOTAL_QUANTITY_EXCEEDED':
          throw new BadRequestException(
            `Tổng số lượng thuê không được vượt quá ${WEB_RENTAL_MAX_TOTAL_QUANTITY} món.`,
          );
        case 'TOO_MANY_ITEMS':
          throw new BadRequestException(
            `Đơn thuê không được có quá ${WEB_RENTAL_MAX_ITEM_COUNT} dòng sản phẩm.`,
          );
        default:
          throw error;
      }
    }
  }

  private throwForInvalidSelection(reason: WebRentalSelectionFailure): void {
    if (reason === 'INVALID_QUANTITY') {
      throw new BadRequestException('Số lượng thuê phải là số nguyên dương.');
    }
    if (reason === 'MISSING_SELECTION') {
      throw new BadRequestException('Vui lòng cung cấp productId hoặc variantId.');
    }
    if (reason === 'PRODUCT_VARIANT_MISMATCH') {
      throw new BadRequestException('productId không khớp với variantId đã chọn.');
    }
  }

  private webCommandIdentity(req: WebCreateOrderInput): StableJsonValue {
    return {
      version: 1,
      command: {
        customer: {
          name: req.customer.name,
          phone: req.customer.phone,
          email: req.customer.email ?? null,
          facebookOrZalo: req.customer.facebookOrZalo ?? null,
          note: req.customer.note ?? null,
        },
        pickupDate: req.pickupDate,
        returnDate: req.returnDate,
        items: req.items.map((item) => ({
          productId: item.productId ?? null,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
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
      },
    };
  }

  async lookupOrder(shopId: string, req: WebOrderLookupInput): Promise<WebOrderLookupResult> {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeCustomerPhone(req.phone);
    } catch {
      throw new NotFoundException('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const order = await this.repository.lookupStorefrontOrder(shopId, req.orderCode);

    if (!order || order.customerNormalizedPhone !== normalizedPhone) {
      throw new NotFoundException('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const rawPhone = order.customerPhone;
    const maskedPhone =
      rawPhone.length >= 7 ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}` : rawPhone;

    return {
      orderCode: order.orderNumber,
      customerName: order.customerFullName,
      phoneMasked: maskedPhone,
      pickupDate: order.rentalStartAt.toISOString().slice(0, 10),
      returnDate: order.rentalEndAt.toISOString().slice(0, 10),
      status: order.status,
      totalAmount: order.grandTotal,
      depositAmount: order.depositRequired,
      paidAmount: order.paidAmount,
      items: order.items,
    };
  }
}
