import { PERMISSIONS } from '@common/constants/permissions';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SizeService } from '../../application/size.service';
import {
  toCreateSizeInput,
  toSizeListQuery,
  toSizeResponse,
  toUpdateSizeInput,
} from '../catalog.mapper';
import {
  CreateSizeReqDto,
  SizeManagementPageResDto,
  SizeManagementResDto,
  UpdateSizeReqDto,
  UpdateSizeStatusReqDto,
} from './dto/size.dto';
import { SizeListQueryDto } from './dto/size-query.dto';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminSizeController {
  constructor(private readonly service: SizeService) {}

  @Post('sizes')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: SizeManagementResDto })
  @ApiBadRequestResponse({ description: 'Thông tin kích cỡ không hợp lệ.' })
  @ApiConflictResponse({ description: 'SIZE_CODE_ALREADY_EXISTS.' })
  async createSize(@CurrentUser() user: CurrentUserType, @Body() body: CreateSizeReqDto) {
    return toSizeResponse(await this.service.createSize(user, toCreateSizeInput(body)));
  }

  @Get('sizes')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: SizeManagementPageResDto })
  @ApiBadRequestResponse({
    description: 'Bộ lọc danh sách hoặc thông tin phân trang không hợp lệ.',
  })
  listSizes(@CurrentUser() user: CurrentUserType, @Query() query: SizeListQueryDto) {
    return this.service.listSizes(user, toSizeListQuery(query));
  }

  @Get('sizes/:id')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: SizeManagementResDto })
  @ApiNotFoundResponse({ description: 'SIZE_NOT_FOUND.' })
  async getSize(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return toSizeResponse(await this.service.getSize(user, id));
  }

  @Patch('sizes/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: SizeManagementResDto })
  @ApiBadRequestResponse({ description: 'Thông tin kích cỡ không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'SIZE_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'SIZE_CODE_ALREADY_EXISTS.' })
  async updateSize(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateSizeReqDto,
  ) {
    return toSizeResponse(await this.service.updateSize(user, id, toUpdateSizeInput(body)));
  }

  @Patch('sizes/:id/status')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: SizeManagementResDto })
  @ApiBadRequestResponse({ description: 'Trạng thái kích cỡ không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'SIZE_NOT_FOUND.' })
  async updateSizeStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateSizeStatusReqDto,
  ) {
    return toSizeResponse(await this.service.updateSizeStatus(user, id, body.isActive));
  }

  @Delete('sizes/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ schema: { properties: { deleted: { type: 'boolean' } } } })
  @ApiNotFoundResponse({ description: 'SIZE_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'SIZE_IN_USE.' })
  deleteSize(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.deleteSize(user, id);
  }
}
