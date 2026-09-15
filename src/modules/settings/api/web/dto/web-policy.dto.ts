import { ApiProperty } from '@nestjs/swagger';

export class WebRentalPolicyDto {
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

  @ApiProperty({ example: 50000, description: 'Phí phụ thu trễ hạn mỗi ngày trên mỗi món đồ (VND)' })
  lateFeePerItemPerDay!: number;

  @ApiProperty({ example: 30000, description: 'Phí vận chuyển giao đồ tận nơi tiêu chuẩn (VND)' })
  standardShippingFee!: number;
}
