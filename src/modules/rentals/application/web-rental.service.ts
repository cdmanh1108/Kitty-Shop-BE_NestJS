import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { generateDatedReference } from '@common/utils/reference-number';
import { normalizeCustomerPhone } from '@modules/customers/domain/customer-phone';
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
import { resolveWebRentalSelection } from './web-rental-selection';

@Injectable()
export class WebRentalService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policyProvider: RentalPolicyProvider,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: CustomerRepository,
  ) {}

  async checkAvailability(
    shopId: string,
    query: WebAvailabilityQueryInput,
  ): Promise<WebAvailabilityResult> {
    const from = new Date(query.pickupDate);
    const until = new Date(query.returnDate);
    if (isNaN(from.getTime()) || isNaN(until.getTime()) || from >= until) {
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }

    const durationDays = calculateRentalDurationDays(from, until);
    if (!query.productId && !query.variantId) {
      throw new BadRequestException('Vui lòng cung cấp productId hoặc variantId.');
    }

    const selection = await resolveWebRentalSelection(this.repository, {
      shopId,
      items: [{ productId: query.productId, variantId: query.variantId, quantity: 1 }],
      durationDays,
      from,
      until,
    });
    if (!selection.valid) return { available: false, availableQuantity: 0 };

    const demand = selection.demands[0];
    if (!demand) return { available: false, availableQuantity: 0 };
    const availableQuantity = demand.variant.availableInventory.length;
    return { available: availableQuantity > 0, availableQuantity };
  }

  async calculateQuote(shopId: string, req: WebRentalQuoteInput): Promise<WebRentalQuoteResult> {
    const from = new Date(req.pickupDate);
    const until = new Date(req.returnDate);
    if (isNaN(from.getTime()) || isNaN(until.getTime()) || from >= until) {
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }

    const policy = await this.policyProvider.getPolicy(shopId);
    const durationDays = calculateRentalDurationDays(from, until);
    const selection = await resolveWebRentalSelection(this.repository, {
      shopId,
      items: req.items,
      durationDays,
      from,
      until,
    });
    if (!selection.valid && selection.reason === 'INVALID_QUANTITY') {
      throw new BadRequestException('Số lượng thuê phải là số nguyên dương.');
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

  async createOrder(shopId: string, req: WebCreateOrderInput): Promise<WebCreateOrderResult> {
    const from = new Date(req.pickupDate);
    const until = new Date(req.returnDate);
    if (isNaN(from.getTime()) || isNaN(until.getTime()) || from >= until) {
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }

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
      if (selection.reason === 'INVALID_QUANTITY') {
        throw new BadRequestException('Số lượng thuê phải là số nguyên dương.');
      }
      throw new NotFoundException('Sản phẩm đã chọn không khả dụng để thuê.');
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeCustomerPhone(req.customer.phone);
    } catch {
      throw new BadRequestException('Số điện thoại người thuê không hợp lệ.');
    }

    let customer = await this.customerRepository.findByNormalizedPhone(shopId, normalizedPhone);

    if (!customer) {
      customer = await this.customerRepository.create(shopId, {
        customerCode: `CUS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
        fullName: req.customer.name.trim(),
        phone: req.customer.phone.trim(),
        normalizedPhone,
        email: req.customer.email?.trim().toLowerCase() || null,
        facebook: req.customer.facebookOrZalo?.trim() || null,
        zalo: null,
        birthday: null,
        gender: null,
        customerType: 'NORMAL',
        status: 'ACTIVE',
        source: 'WEB',
      });
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

    const order = await this.repository.createOrder({
      orderNumber: generateDatedReference('RT'),
      shopId,
      customerId: customer.id,
      rentalStartAt: from,
      rentalEndAt: until,
      discountTotal: 0,
      storefrontEligibility: true,
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

    return {
      orderCode: order.orderNumber,
      totalAmount: Number(order.grandTotal),
      depositAmount: Number(order.depositRequired),
      status: order.status.toLowerCase(),
      paymentStatus: (order.paymentStatus || 'UNPAID').toLowerCase(),
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
