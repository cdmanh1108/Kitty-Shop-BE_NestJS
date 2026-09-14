import { RentalConfirmationResDto } from './rental-confirmation.dto';
import { CHARGE_TYPE } from '@modules/rentals/domain/charge-type';
import { DELIVERY_DIRECTION, DELIVERY_METHOD } from '@modules/deliveries/domain/delivery-status';

import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import { ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class CreateRentalItemReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId!: string;
  @ApiProperty({ type: Number, default: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn hoặc bằng $constraint1.' })
  @Max(20, { message: 'Số lượng phải nhỏ hơn hoặc bằng $constraint1.' })
  quantity = 1;
  @ApiPropertyOptional({
    type: Number,
    description: 'Đơn giá thuê mỗi món do admin ghi đè (VNĐ). Nếu để trống, hệ thống dùng giá cấu hình.',
    example: 150000,
  })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Đơn giá thuê ghi đè phải là số hợp lệ.' })
  @Min(0, { message: 'Đơn giá thuê ghi đè phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  unitRentalPrice?: number;
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional physical item selection; otherwise backend auto-allocates.',
  })
  @IsArray({ message: 'Danh sách mã món đồ phải là danh sách.' })
  @IsUUID('4', { each: true, message: 'Danh sách mã món đồ phải là UUID hợp lệ.' })
  @IsOptional()
  inventoryItemIds?: string[];
}

export class RentalChargeReqDto {
  @ApiProperty({ enum: Object.values(CHARGE_TYPE), example: 'ACCESSORY' })
  @IsIn(Object.values(CHARGE_TYPE), { message: 'Loại phụ phí không hợp lệ.' })
  chargeType!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @IsOptional()
  description?: string;
  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Số tiền phải là số hợp lệ.' })
  @Min(0, { message: 'Số tiền phải lớn hơn hoặc bằng $constraint1.' })
  amount!: number;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  quantity = 1;
}

export class RentalDeliveryReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION), default: 'OUTBOUND' })
  @IsIn(Object.values(DELIVERY_DIRECTION), { message: 'Chiều giao dịch không hợp lệ.' })
  direction = 'OUTBOUND';
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD), { message: 'Phương thức không hợp lệ.' })
  method!: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian hẹn phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  scheduledAt?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người nhận phải là chuỗi ký tự.' })
  @IsOptional()
  recipientName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người nhận phải là chuỗi ký tự.' })
  @IsOptional()
  recipientPhone?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' })
  @IsOptional()
  addressLine?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Phường/xã phải là chuỗi ký tự.' })
  @IsOptional()
  ward?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Quận/huyện phải là chuỗi ký tự.' })
  @IsOptional()
  district?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Thành phố phải là chuỗi ký tự.' })
  @IsOptional()
  city?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự.' })
  @IsOptional()
  province?: string;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Phí giao hàng phải là số hợp lệ.' })
  @Min(0, { message: 'Phí giao hàng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  shippingFee = 0;
}

export class RentalCollateralReqDto {
  @ApiProperty({ enum: ['CASH', 'DOCUMENT'] })
  @IsIn(['CASH', 'DOCUMENT'], { message: 'Phương thức không hợp lệ.' })
  method!: 'CASH' | 'DOCUMENT';
  @ApiPropertyOptional({ enum: ['CCCD', 'GPLX'] })
  @IsIn(['CCCD', 'GPLX'], { message: 'Loại giấy tờ không hợp lệ.' })
  @IsOptional()
  documentType?: 'CCCD' | 'GPLX';
}

export class CreateRentalOrderReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã khách hàng phải là UUID hợp lệ.' })
  customerId!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã địa điểm phải là UUID hợp lệ.' })
  @IsOptional()
  locationId?: string;
  @ApiProperty({ example: '2026-09-12T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalStartAt!: string;
  @ApiProperty({ example: '2026-09-14T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalEndAt!: string;
  @ApiProperty({ type: [CreateRentalItemReqDto] })
  @IsArray({ message: 'Danh sách sản phẩm thuê phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách sản phẩm thuê phải có ít nhất $constraint1 phần tử.' })
  @ValidateNested({ each: true, message: 'Danh sách sản phẩm thuê có dữ liệu không hợp lệ.' })
  @Type(() => CreateRentalItemReqDto)
  items!: CreateRentalItemReqDto[];
  @ApiPropertyOptional({ type: [RentalChargeReqDto] })
  @IsArray({ message: 'Danh sách phụ phí phải là danh sách.' })
  @ValidateNested({ each: true, message: 'Danh sách phụ phí có dữ liệu không hợp lệ.' })
  @Type(() => RentalChargeReqDto)
  @IsOptional()
  charges: RentalChargeReqDto[] = [];
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tổng tiền giảm giá phải là số hợp lệ.' })
  @Min(0, { message: 'Tổng tiền giảm giá phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  discountTotal = 0;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú nội bộ phải là chuỗi ký tự.' })
  @IsOptional()
  internalNote?: string;
  @ApiPropertyOptional({ type: RentalDeliveryReqDto })
  @ValidateNested({ message: 'Thông tin giao hàng có dữ liệu không hợp lệ.' })
  @Type(() => RentalDeliveryReqDto)
  @IsOptional()
  delivery?: RentalDeliveryReqDto;
  @ApiPropertyOptional({ type: () => RentalCollateralReqDto })
  @ValidateNested({ message: 'Thông tin đặt cọc có dữ liệu không hợp lệ.' })
  @Type(() => RentalCollateralReqDto)
  @IsOptional()
  collateral?: RentalCollateralReqDto;
}

export class RentalListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã khách hàng phải là UUID hợp lệ.' })
  @IsOptional()
  customerId?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
  @ApiPropertyOptional({ enum: Object.values(RENTAL_STATUS) })
  @IsIn(Object.values(RENTAL_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
  @ApiPropertyOptional({ enum: Object.values(ORDER_PAYMENT_STATUS) })
  @IsIn(Object.values(ORDER_PAYMENT_STATUS), { message: 'Trạng thái thanh toán không hợp lệ.' })
  @IsOptional()
  paymentStatus?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  from?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  until?: string;
}

export class TransitionRentalReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự.' })
  @IsOptional()
  reason?: string;
}

export class RescheduleRentalReqDto {
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalStartAt!: string;
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalEndAt!: string;
}

export class AddRentalChargeReqDto extends RentalChargeReqDto {}

export class ReturnInspectionItemReqDto {
  @ApiProperty({ description: 'ID của món đồ (physical inventory item)' })
  @IsUUID('4', { message: 'Mã món đồ phải là UUID hợp lệ.' })
  inventoryItemId!: string;

  @ApiProperty({
    enum: ['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'],
    example: 'NORMAL',
  })
  @IsIn(['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'], {
    message: 'Tình trạng kiểm tra không hợp lệ.',
  })
  condition!: string;

  @ApiPropertyOptional({ description: 'Ghi chú hiện trạng' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
}

export class ReturnRentalOrderReqDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Thời điểm trả thực tế (mặc định là hiện tại)',
  })
  @IsDateString(undefined, { message: 'Thời gian trả đồ không hợp lệ.' })
  @IsOptional()
  actualReturnedAt?: string;

  @ApiProperty({ type: [ReturnInspectionItemReqDto] })
  @IsArray({ message: 'Danh sách kiểm tra phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Phải có ít nhất 1 món đồ để kiểm tra.' })
  @ValidateNested({ each: true })
  @Type(() => ReturnInspectionItemReqDto)
  inspections!: ReturnInspectionItemReqDto[];

  @ApiPropertyOptional({ type: [RentalChargeReqDto] })
  @IsArray({ message: 'Danh sách phụ phí phải là danh sách.' })
  @ValidateNested({ each: true })
  @Type(() => RentalChargeReqDto)
  @IsOptional()
  manualCharges?: RentalChargeReqDto[];

  @ApiPropertyOptional({ description: 'Ghi chú trả hàng' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
}

export class SettleRentalOrderReqDto {
  @ApiPropertyOptional({ enum: ['CASH', 'BANK_TRANSFER'] })
  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'], { message: 'Phương thức thanh toán không hợp lệ.' })
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  @ApiPropertyOptional({ example: 'Đã hoàn cọc qua tiền mặt' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Xác nhận đã trả lại giấy tờ CCCD/GPLX cho khách (nếu đơn giữ giấy tờ)',
  })
  @IsOptional()
  returnDocumentCollateral?: boolean;
}

export class RentalCustomerResDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
}

export class RentalItemSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() productNameSnapshot!: string;
  @ApiProperty() variantNameSnapshot!: string;
  @ApiProperty() quantity!: number;
}

export class RentalAllocationResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() operationalStatus!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) reservedFrom!: string;
  @ApiProperty({ format: 'date-time' }) reservedUntil!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) releasedAt!: string | null;
}

export class RentalItemResDto extends RentalItemSummaryResDto {
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl?: string | null;
  @ApiProperty({ type: String }) unitRentalPrice!: string;
  @ApiProperty({ type: String }) depositAmount!: string;
  @ApiProperty({ type: String }) lineTotal!: string;
  @ApiProperty({ type: [RentalAllocationResDto] }) allocations!: RentalAllocationResDto[];
}

export class RentalChargeResDto {
  @ApiProperty() id!: string;
  @ApiProperty() chargeType!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() currency!: string;
}

export class RentalPaymentResDto {
  @ApiProperty() source!: string;
  @ApiProperty({ type: String, nullable: true }) createdBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() transactionNumber!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ format: 'date-time' }) paidAt!: string;
}

export class RentalDeliveryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() method!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) scheduledAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientName!: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) addressLine!: string | null;
  @ApiProperty({ type: String }) shippingFee!: string;
}

export class RentalStatusHistoryResDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}

export class RentalOrderListItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty({ format: 'date-time' }) rentalStartAt!: string;
  @ApiProperty({ format: 'date-time' }) rentalEndAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() depositStatus!: string;
  @ApiProperty({ type: String, example: '500000.00' }) grandTotal!: string;
  @ApiProperty({ type: RentalCustomerResDto }) customer!: RentalCustomerResDto;
  @ApiProperty() itemCount!: number;
  @ApiProperty() productCount!: number;
}

export class ReturnPreviewItemDto {
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantTitle!: string;
}

export class ReturnPreviewResDto {
  @ApiProperty({ format: 'date-time' }) rentalEndAt!: string;
  @ApiProperty({ format: 'date-time' }) actualReturnedAt!: string;
  @ApiProperty() lateDays!: number;
  @ApiProperty() dailyLateFeePerSet!: number;
  @ApiProperty({ type: String, example: '20000.00' }) lateFee!: string;
  @ApiProperty({ type: String, example: '0.00' }) additionalRentalFee!: string;
  @ApiProperty({ type: [ReturnPreviewItemDto] }) items!: ReturnPreviewItemDto[];
}

export class RentalReturnInspectionResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty({
    enum: ['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'],
  })
  condition!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
}

export class RentalReturnResDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({ format: 'date-time' }) returnedAt!: string;
  @ApiProperty() receivedBy!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty() lateDays!: number;
  @ApiProperty({ type: String, example: '20000.00' }) lateFee!: string;
  @ApiProperty({ type: String, example: '0.00' }) additionalRentalFee!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: [RentalReturnInspectionResDto] })
  inspections!: RentalReturnInspectionResDto[];
}

export class RentalSettlementDetailsResDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({ format: 'date-time' }) settledAt!: string;
  @ApiProperty() settledBy!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ enum: ['REFUND', 'COLLECTION', 'BALANCED', 'COLLATERAL_ONLY'] })
  settlementType!: string;
  @ApiProperty({ type: String, example: '0.00' }) amount!: string;
  @ApiProperty({ type: String, example: '300000.00' }) depositAmount!: string;
  @ApiProperty({ type: String, example: '70000.00' }) totalCharges!: string;
  @ApiProperty({ type: String, example: '230000.00' }) refundAmount!: string;
  @ApiProperty({ type: String, example: '0.00' }) amountDue!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceKey!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceFilename!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceMimeType!: string | null;
  @ApiProperty({ type: Number, nullable: true }) evidenceSize!: number | null;
}

export class RentalSettlementResDto {
  @ApiProperty({ type: String }) depositAvailable!: string;
  @ApiProperty({ type: String }) depositReceived!: string;
  @ApiProperty({ type: String }) refundAmount!: string;
  @ApiProperty({ type: String }) amountStillDue!: string;
  @ApiProperty({ enum: ['PENDING', 'REFUND_DUE', 'AMOUNT_DUE', 'BALANCED', 'SETTLED'] })
  settlementStatus!: string;
}

export class RentalOrderResDto extends RentalOrderListItemResDto {
  @ApiProperty({ type: () => RentalConfirmationResDto, nullable: true })
  confirmation!: RentalConfirmationResDto | null;
  @ApiProperty({ type: [RentalItemResDto] }) items!: RentalItemResDto[];
  @ApiProperty({ type: String, example: '450000.00' }) rentalSubtotal!: string;
  @ApiProperty({ type: String, example: '50000.00' }) chargesTotal!: string;
  @ApiProperty({ type: String, example: '0.00' }) discountTotal!: string;
  @ApiProperty({ type: String, example: '1000000.00' }) depositRequired!: string;
  @ApiProperty() collateralMethod!: string;
  @ApiProperty({ type: String, nullable: true }) documentType!: string | null;
  @ApiProperty() collateralStatus!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) collateralReceivedAt!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) collateralReturnedAt!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) actualReturnedAt!:
    | string
    | null;
  @ApiProperty({ type: String, example: '250000.00' }) paidAmount!: string;
  @ApiProperty({ type: String, example: '250000.00' }) remainingAmount!: string;
  @ApiProperty({ type: () => RentalSettlementResDto }) settlement!: RentalSettlementResDto;
  @ApiProperty({ type: () => RentalReturnResDto, nullable: true })
  returnRecord!: RentalReturnResDto | null;
  @ApiProperty({ type: () => RentalSettlementDetailsResDto, nullable: true })
  settlementDetails!: RentalSettlementDetailsResDto | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) internalNote!: string | null;
  @ApiProperty({ type: [RentalChargeResDto] }) charges!: RentalChargeResDto[];
  @ApiProperty({ type: [RentalPaymentResDto] }) payments!: RentalPaymentResDto[];
  @ApiProperty({ type: [RentalDeliveryResDto] }) deliveries!: RentalDeliveryResDto[];
  @ApiProperty({ type: [RentalStatusHistoryResDto] }) statusHistory!: RentalStatusHistoryResDto[];
}

export class RentalOrderPageResDto {
  @ApiProperty({ type: [RentalOrderListItemResDto] }) items!: RentalOrderListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
