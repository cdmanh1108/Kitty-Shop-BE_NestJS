import {
  InventorySummaryResDto,
  InventoryHistoryQueryDto,
  InventoryHistoryPageResDto,
} from '../catalog-read.dto';
import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InventoryService } from '../../application/inventory.service';
import {
  AddInventoryReqDto,
  ArchiveInventoryItemReqDto,
  AvailabilityQueryDto,
  InventoryItemResDto,
  InventoryListQueryDto,
  InventoryPageResDto,
  UpdateInventoryStatusReqDto,
} from './dto/inventory.dto';
import {
  toAddInventoryInput,
  toAvailabilityQuery,
  toInventoryListQuery,
  toUpdateInventoryStatusInput,
} from '../catalog.mapper';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOkResponse({ type: InventoryPageResDto })
  listInventory(@CurrentUser() user: CurrentUserType, @Query() query: InventoryListQueryDto) {
    return this.service.listInventory(user, toInventoryListQuery(query));
  }

  @Get('summary')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOkResponse({ type: InventorySummaryResDto })
  inventorySummary(@CurrentUser() user: CurrentUserType) {
    return this.service.inventorySummary(user);
  }

  @Get('history')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOkResponse({ type: InventoryHistoryPageResDto })
  inventoryHistory(@CurrentUser() user: CurrentUserType, @Query() query: InventoryHistoryQueryDto) {
    return this.service.inventoryHistory(user, {
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      inventoryItemId: query.inventoryItemId,
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary: 'Physical inventory detail with status history and unreleased allocations',
  })
  @ApiOkResponse({ type: InventoryItemResDto })
  getInventory(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.getInventory(user, id);
  }

  @Post()
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  @ApiCreatedResponse({ type: InventoryItemResDto })
  async addInventory(@CurrentUser() user: CurrentUserType, @Body() body: AddInventoryReqDto) {
    const item = await this.service.addInventory(user, toAddInventoryInput(body));
    return this.service.getInventory(user, item.id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  @ApiOkResponse({ type: InventoryItemResDto })
  async updateInventoryStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateInventoryStatusReqDto,
  ) {
    await this.service.updateInventoryStatus(user, id, toUpdateInventoryStatusInput(body));
    return this.service.getInventory(user, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Archive/retire physical inventory item safely' })
  @ApiOkResponse({ schema: { properties: { success: { type: 'boolean' } } } })
  archiveInventoryItem(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body?: ArchiveInventoryItemReqDto,
  ) {
    return this.service.archiveInventoryItem(user, id, body?.reason);
  }

  @Get('availability/search')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary: 'Find physical items not allocated in a half-open [from, until) interval',
  })
  @ApiOkResponse({ type: [InventoryItemResDto] })
  availability(@CurrentUser() user: CurrentUserType, @Query() query: AvailabilityQueryDto) {
    return this.service.availability(user, toAvailabilityQuery(query));
  }
}
