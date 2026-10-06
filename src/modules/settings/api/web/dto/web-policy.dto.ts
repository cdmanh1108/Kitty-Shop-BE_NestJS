import { ApiProperty } from '@nestjs/swagger';
import { RentalPricingPolicyDto } from '../../rental-policy.dto';

export class WebRentalPolicyDto {
  @ApiProperty({
    type: RentalPricingPolicyDto,
    description: 'Biểu giá thuê chung và giới hạn đặt qua website.',
  })
  rentalPricing!: RentalPricingPolicyDto;

  @ApiProperty({
    example: ['CASH', 'DOCUMENT'],
    description: 'Các hình thức cọc hợp lệ (tiền mặt hoặc giấy tờ tuỳ thân)',
  })
  depositMethods!: string[];

  @ApiProperty({
    example: ['CCCD', 'GPLX'],
    description: 'Các loại giấy tờ tuỳ thân được chấp nhận giữ cọc',
  })
  depositDocumentTypes!: string[];

  @ApiProperty({ example: 200000, description: 'Tiền cọc mặc định cho sản phẩm (VND)' })
  defaultDepositAmount!: number;

  @ApiProperty({
    example: 50000,
    description:
      'Phí phụ thu trễ hạn của chính sách hiện hành (VND / món / ngày); lưu riêng với biểu giá chu kỳ.',
  })
  lateFeePerItemPerDay!: number;

  @ApiProperty({ example: 30000, description: 'Phí vận chuyển giao đồ tận nơi tiêu chuẩn (VND)' })
  standardShippingFee!: number;
}
