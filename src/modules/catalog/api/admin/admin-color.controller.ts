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
import { ColorService } from '../../application/color.service';
import {
  toColorResponse,
  toColorListQuery,
  toCreateColorInput,
  toUpdateColorInput,
} from '../catalog.mapper';
import {
  ColorManagementPageResDto,
  ColorManagementResDto,
  CreateColorReqDto,
  UpdateColorReqDto,
  UpdateColorStatusReqDto,
} from './dto/color.dto';
import { ColorListQueryDto } from './dto/color-query.dto';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminColorController {
  constructor(private readonly service: ColorService) {}

  @Post('colors')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: ColorManagementResDto })
  @ApiBadRequestResponse({ description: 'Thông tin màu sắc không hợp lệ.' })
  @ApiConflictResponse({ description: 'COLOR_CODE_ALREADY_EXISTS.' })
  async createColor(@CurrentUser() user: CurrentUserType, @Body() body: CreateColorReqDto) {
    return toColorResponse(await this.service.createColor(user, toCreateColorInput(body)));
  }

  @Get('colors')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ColorManagementPageResDto })
  @ApiBadRequestResponse({
    description: 'Bộ lọc danh sách hoặc thông tin phân trang không hợp lệ.',
  })
  listColors(@CurrentUser() user: CurrentUserType, @Query() query: ColorListQueryDto) {
    return this.service.listColors(user, toColorListQuery(query));
  }

  @Get('colors/:id')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ColorManagementResDto })
  @ApiNotFoundResponse({ description: 'COLOR_NOT_FOUND.' })
  async getColor(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return toColorResponse(await this.service.getColor(user, id));
  }

  @Patch('colors/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: ColorManagementResDto })
  @ApiBadRequestResponse({ description: 'Thông tin màu sắc không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'COLOR_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'COLOR_CODE_ALREADY_EXISTS.' })
  async updateColor(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateColorReqDto,
  ) {
    return toColorResponse(await this.service.updateColor(user, id, toUpdateColorInput(body)));
  }

  @Patch('colors/:id/status')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: ColorManagementResDto })
  @ApiBadRequestResponse({ description: 'Trạng thái màu sắc không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'COLOR_NOT_FOUND.' })
  async updateColorStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateColorStatusReqDto,
  ) {
    return toColorResponse(await this.service.updateColorStatus(user, id, body.isActive));
  }

  @Delete('colors/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ schema: { properties: { deleted: { type: 'boolean' } } } })
  @ApiNotFoundResponse({ description: 'COLOR_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'COLOR_IN_USE.' })
  deleteColor(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.deleteColor(user, id);
  }
}
