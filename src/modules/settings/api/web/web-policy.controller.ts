import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RENTAL_POLICY_PROVIDER, type RentalPolicyProvider } from '../../domain/rental-policy';
import { WebRentalPolicyDto } from './dto/web-policy.dto';

@Public()
@ApiTags('Web - Policies')
@ApiSurface('web')
@Controller('web')
export class WebPolicyController {
  constructor(
    private readonly shopResolver: ShopResolver,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policyProvider: RentalPolicyProvider,
  ) {}

  @Get('policies')
  @ApiOperation({
    operationId: 'getWebPolicies',
    summary: 'Lấy các điều khoản và chính sách thuê công khai',
  })
  @ApiOkResponse({
    type: WebRentalPolicyDto,
    description: 'Biểu giá thuê, giới hạn đặt online, chính sách cọc và vận chuyển công khai.',
  })
  async getPolicies(): Promise<WebRentalPolicyDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const policy = await this.policyProvider.getPolicy(shopId);
    return {
      rentalPricing: { ...policy.rentalPricing },
      depositMethods: policy.deposit.allowedMethods,
      depositDocumentTypes: policy.deposit.allowedDocumentTypes,
      defaultDepositAmount: policy.deposit.defaultCashDeposit,
      lateFeePerItemPerDay: policy.lateReturn.feePerItemPerDay,
      standardShippingFee: policy.delivery.standardShippingFee,
    };
  }
}
