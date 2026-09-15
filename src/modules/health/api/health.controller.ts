import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { HealthService } from '../application/health.service';

class LiveHealthResDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
}

class ReadyHealthResDto extends LiveHealthResDto {
  @ApiProperty({ example: 'up' }) database!: string;
}

@ApiSurface('system')
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiOkResponse({ type: LiveHealthResDto })
  live() {
    return this.service.live();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including PostgreSQL' })
  @ApiOkResponse({ type: ReadyHealthResDto })
  ready() {
    return this.service.ready();
  }
}
