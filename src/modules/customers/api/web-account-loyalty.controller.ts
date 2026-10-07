import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  CurrentWebUser,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
  type WebAuthPrincipal,
} from '@modules/web-auth/public';
import { CustomerLoyaltyService } from '../application/customer-loyalty.service';
import { CustomerLoyaltySummaryResDto } from './customer-loyalty.dto';

@Public()
@ApiTags('Web - Account Loyalty')
@ApiSurface('web')
@Controller('web/account/loyalty')
@UseGuards(WebJwtAuthGuard, WebAuthOriginGuard)
export class WebAccountLoyaltyController {
  constructor(private readonly loyalty: CustomerLoyaltyService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'getWebAccountLoyaltySummary',
    summary: 'Get loyalty progress and available rewards for the authenticated web account',
  })
  @ApiOkResponse({ type: CustomerLoyaltySummaryResDto })
  get(@CurrentWebUser() user: WebAuthPrincipal) {
    return this.loyalty.forWebAccount(user.id);
  }
}
