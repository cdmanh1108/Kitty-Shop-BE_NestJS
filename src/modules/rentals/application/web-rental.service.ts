import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@database/prisma/prisma.service';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { generateDatedReference } from '@common/utils/reference-number';
import { normalizeCustomerPhone } from '@modules/customers/domain/customer-phone';
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

const STANDARD_SHIPPING_FEE = 30000;

@Injectable()
export class WebRentalService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    private readonly prisma: PrismaService,
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

    if (query.variantId) {
      const variant = await this.repository.getBookableVariant({
        shopId,
        variantId: query.variantId,
        durationDays,
        from,
        until,
      });
      const availableQuantity = variant?.availableInventory.length ?? 0;
      return {
        available: availableQuantity > 0,
        availableQuantity,
      };
    }

    if (query.productId) {
      const variants = await this.prisma.productVariant.findMany({
        where: {
          productId: query.productId,
          shopId,
          status: 'ACTIVE',
          archivedAt: null,
        },
        select: { id: true },
      });

      let totalAvailable = 0;
      for (const v of variants) {
        const variant = await this.repository.getBookableVariant({
          shopId,
          variantId: v.id,
          durationDays,
          from,
          until,
        });
        totalAvailable += variant?.availableInventory.length ?? 0;
      }

      return {
        available: totalAvailable > 0,
        availableQuantity: totalAvailable,
      };
    }

    throw new BadRequestException('Vui lòng cung cấp productId hoặc variantId.');
  }

  async calculateQuote(
    shopId: string,
    req: WebRentalQuoteInput,
  ): Promise<WebRentalQuoteResult> {
    const from = new Date(req.pickupDate);
    const until = new Date(req.returnDate);
    if (isNaN(from.getTime()) || isNaN(until.getTime()) || from >= until) {
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }

    const durationDays = calculateRentalDurationDays(from, until);
    let rentalSubtotal = 0;
    let depositAmount = 0;
    let allAvailable = true;

    for (const item of req.items) {
      let variantId = item.variantId;
      if (!variantId && item.productId) {
        const pv = await this.prisma.productVariant.findFirst({
          where: { productId: item.productId, shopId, status: 'ACTIVE', archivedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (pv) variantId = pv.id;
      }

      if (!variantId) {
        allAvailable = false;
        continue;
      }

      const variant = await this.repository.getBookableVariant({
        shopId,
        variantId,
        durationDays,
        from,
        until,
      });

      if (!variant || variant.ratePrice === null) {
        allAvailable = false;
        continue;
      }

      if (variant.availableInventory.length < item.quantity) {
        allAvailable = false;
      }

      rentalSubtotal += variant.ratePrice * item.quantity;
      depositAmount += variant.depositPerItem * item.quantity;
    }

    const shippingFee = req.deliveryMethod === 'shop_delivery' ? STANDARD_SHIPPING_FEE : 0;
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
  ): Promise<WebCreateOrderResult> {
    const from = new Date(req.pickupDate);
    const until = new Date(req.returnDate);
    if (isNaN(from.getTime()) || isNaN(until.getTime()) || from >= until) {
      throw new BadRequestException('Thời gian bắt đầu thuê phải trước thời gian kết thúc.');
    }

    const durationDays = calculateRentalDurationDays(from, until);

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeCustomerPhone(req.customer.phone);
    } catch {
      throw new BadRequestException('Số điện thoại người thuê không hợp lệ.');
    }

    let customer = await this.prisma.customer.findUnique({
      where: {
        shopId_normalizedPhone: {
          shopId,
          normalizedPhone,
        },
      },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          shopId,
          customerCode: `CUS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
          fullName: req.customer.name.trim(),
          phone: req.customer.phone.trim(),
          normalizedPhone,
          email: req.customer.email?.trim().toLowerCase() || null,
          facebook: req.customer.facebookOrZalo?.trim() || null,
          source: 'WEB',
          status: 'ACTIVE',
        },
      });
    }

    const lines: CreateRentalOrderData['lines'] = [];
    for (const item of req.items) {
      let variantId = item.variantId;
      if (!variantId && item.productId) {
        const pv = await this.prisma.productVariant.findFirst({
          where: { productId: item.productId, shopId, status: 'ACTIVE', archivedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (pv) variantId = pv.id;
      }

      if (!variantId) {
        throw new BadRequestException('Không tìm thấy biến thể sản phẩm hợp lệ.');
      }

      const variant = await this.repository.getBookableVariant({
        shopId,
        variantId,
        durationDays,
        from,
        until,
      });

      if (!variant) {
        throw new NotFoundException(`Sản phẩm không khả dụng để thuê.`);
      }

      if (variant.ratePrice === null) {
        throw new BadRequestException(
          `Sản phẩm ${variant.productName} chưa được cấu hình giá thuê cho ${durationDays} ngày.`,
        );
      }

      if (variant.availableInventory.length < item.quantity) {
        throw new ConflictException(
          `Sản phẩm ${variant.productName} không đủ số lượng có sẵn trong khoảng ngày đã chọn.`,
        );
      }

      const selectedInventory = variant.availableInventory.slice(0, item.quantity);
      const variantName = [variant.variantCode, variant.sizeName, variant.colorName]
        .filter(Boolean)
        .join(' / ');

      lines.push({
        productId: variant.productId,
        variantId: variant.id,
        productName: variant.productName,
        variantName,
        quantity: item.quantity,
        unitRentalPrice: variant.ratePrice,
        depositAmount: variant.depositPerItem * item.quantity,
        lineTotal: variant.ratePrice * item.quantity,
        pricingSnapshot: {
          durationDays,
          unitRentalPrice: variant.ratePrice,
          depositPerItem: variant.depositPerItem,
        },
        inventory: selectedInventory,
      });
    }

    const shippingFee = req.delivery.method === 'shop_delivery' ? STANDARD_SHIPPING_FEE : 0;

    const order = await this.repository.createOrder({
      orderNumber: generateDatedReference('RT'),
      shopId,
      customerId: customer.id,
      rentalStartAt: from,
      rentalEndAt: until,
      discountTotal: 0,
      note: req.customer.note,
      internalNote: 'Đơn tạo từ Web Storefront',
      lines,
      charges:
        shippingFee > 0
          ? [
              {
                chargeType: 'SHIPPING',
                description: 'Phí giao hàng',
                amount: shippingFee,
                quantity: 1,
              },
            ]
          : [],
      delivery: {
        direction: 'OUTBOUND',
        method: req.delivery.method === 'shop_delivery' ? 'DELIVERY' : 'PICKUP',
        recipientName: req.customer.name,
        recipientPhone: req.customer.phone,
        addressLine: req.delivery.address,
        shippingFee,
      },
      collateral: { method: 'CASH' },
    });

    if (!order) {
      throw new ConflictException('Không thể tạo đơn thuê.');
    }

    return {
      orderCode: order.orderNumber,
      totalAmount: Number(order.grandTotal),
      depositAmount: Number(order.depositRequired),
      status: order.status.toLowerCase(),
    };
  }

  async lookupOrder(
    shopId: string,
    req: WebOrderLookupInput,
  ): Promise<WebOrderLookupResult> {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeCustomerPhone(req.phone);
    } catch {
      throw new NotFoundException('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const order = await this.prisma.rentalOrder.findFirst({
      where: {
        shopId,
        orderNumber: req.orderCode.trim(),
      },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              include: {
                media: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!order || order.customer.normalizedPhone !== normalizedPhone) {
      throw new NotFoundException('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const rawPhone = order.customer.phone;
    const maskedPhone =
      rawPhone.length >= 7
        ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}`
        : rawPhone;

    const items = order.items.map((item) => ({
      name: item.productNameSnapshot,
      imageUrl: item.product?.media?.[0]?.url ?? '',
      quantity: item.quantity,
    }));

    const payments = await this.prisma.paymentTransaction.aggregate({
      where: {
        shopId,
        orderId: order.id,
        status: 'COMPLETED',
        voidedAt: null,
        direction: 'INBOUND',
      },
      _sum: { amount: true },
    });

    const paidAmount = payments._sum?.amount ? decimalToNumber(payments._sum.amount) : 0;

    return {
      orderCode: order.orderNumber,
      customerName: order.customer.fullName,
      phoneMasked: maskedPhone,
      pickupDate: order.rentalStartAt.toISOString().slice(0, 10),
      returnDate: order.rentalEndAt.toISOString().slice(0, 10),
      status: order.status.toLowerCase(),
      totalAmount: decimalToNumber(order.grandTotal),
      depositAmount: decimalToNumber(order.depositRequired),
      paidAmount,
      items,
    };
  }
}
