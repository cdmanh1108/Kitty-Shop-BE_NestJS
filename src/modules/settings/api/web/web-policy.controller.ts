import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/tenant/shop-resolver';
import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '../../domain/rental-policy';
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
    description: 'Chính sách cọc, phí trễ hạn và vận chuyển công khai cho storefront',
  })
  async getPolicies(@Req() request: Request): Promise<WebRentalPolicyDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const policy = await this.policyProvider.getPolicy(shopId);
    return {
      depositMethods: policy.deposit.allowedMethods,
      depositDocumentTypes: policy.deposit.allowedDocumentTypes,
      defaultDepositAmount: policy.deposit.defaultCashDeposit,
      lateFeePerItemPerDay: policy.lateReturn.feePerItemPerDay,
      standardShippingFee: policy.delivery.standardShippingFee,
    };
  }
}
