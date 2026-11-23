import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import { PaymentService } from '../application/payment.service';
import { PayosAdapter } from '../infrastructure/payos.adapter';

@Public()
@ApiSurface('system')
@ApiTags('System - payOS')
@Controller('webhooks/payos')
export class PayosWebhookController {
  constructor(
    private readonly service: PaymentService,
    private readonly shops: ShopResolver,
    private readonly payos: PayosAdapter,
  ) {}

  @Post()
  @HttpCode(204)
  @ApiBody({ schema: { type: 'object', required: ['data', 'signature'] } })
  @ApiNoContentResponse()
  async receive(@Body() payload: unknown) {
    const transfer = await this.payos.verify(payload);
    if (transfer) await this.service.recordTransfer(await this.shops.resolveShopId(), transfer);
  }
}
