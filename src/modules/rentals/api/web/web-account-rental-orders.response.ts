import type {
  WebAccountRentalOrderDetail,
  WebAccountRentalOrderListItem,
  WebAccountRentalOrderPage,
} from '../../domain/rental.repository';
import type {
  WebAccountRentalOrderDetailResDto,
  WebAccountRentalOrderListItemResDto,
  WebAccountRentalOrdersListResDto,
} from './dto/web-account-rental-orders.dto';

function toListItem(order: WebAccountRentalOrderListItem): WebAccountRentalOrderListItemResDto {
  return {
    orderCode: order.orderCode,
    createdAt: order.createdAt.toISOString(),
    rentalStartAt: order.rentalStartAt.toISOString(),
    rentalEndAt: order.rentalEndAt.toISOString(),
    status: order.status,
    paymentStatus: order.paymentStatus,
    depositStatus: order.depositStatus,
    grandTotal: order.grandTotal,
    depositRequired: order.depositRequired,
    preferredPaymentMethod: order.preferredPaymentMethod,
    itemCount: order.itemCount,
    itemsPreview: order.itemsPreview.map((item) => ({ ...item })),
  };
}

export function toWebAccountRentalOrdersListResponse(
  page: WebAccountRentalOrderPage,
): WebAccountRentalOrdersListResDto {
  return { items: page.items.map(toListItem), meta: page.meta };
}

export function toWebAccountRentalOrderDetailResponse(
  order: WebAccountRentalOrderDetail,
): WebAccountRentalOrderDetailResDto {
  return {
    ...toListItem(order),
    rentalSubtotal: order.rentalSubtotal,
    chargesTotal: order.chargesTotal,
    discountTotal: order.discountTotal,
    collateralMethod: order.collateralMethod,
    documentType: order.documentType,
    actualReturnedAt: order.actualReturnedAt?.toISOString() ?? null,
    items: order.items.map((item) => ({ ...item })),
    deliveries: order.deliveries.map((delivery) => ({
      ...delivery,
      scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
    })),
    timeline: order.timeline.map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt.toISOString(),
    })),
  };
}
