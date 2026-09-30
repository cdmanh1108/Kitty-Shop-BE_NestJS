import { BadRequestException } from '@nestjs/common';
import type { WebRentalQuoteInput } from './web-rental.contracts';
import {
  assertWebRentalItems,
  parseWebRentalDateRange,
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_MAX_QUANTITY_PER_ITEM,
  WEB_RENTAL_MAX_TOTAL_QUANTITY,
  WebRentalInputValidationError,
} from './web-rental-input-validation';
import type { WebRentalSelectionFailure } from './web-rental-selection';

export function parseWebRentalDateRangeInput(input: { pickupDate: string; returnDate: string }) {
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

export function assertWebRentalItemsInput(items: WebRentalQuoteInput['items']): void {
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

export function throwForInvalidWebRentalSelection(reason: WebRentalSelectionFailure): void {
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
