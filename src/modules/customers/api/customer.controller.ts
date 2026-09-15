import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CustomerService } from '../application/customer.service';
import {
  AddCustomerNoteReqDto,
  CreateCustomerReqDto,
  CustomerAddressReqDto,
  CustomerAddressResDto,
  CustomerDetailResDto,
  CustomerListQueryDto,
  CustomerLookupItemResDto,
  CustomerLookupQueryDto,
  CustomerNoteResDto,
  CustomerPageResDto,
  CustomerResDto,
  UpdateCustomerAddressReqDto,
  UpdateCustomerReqDto,
} from './customer.dto';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import {
  toAddCustomerNoteInput,
  toCreateCustomerInput,
  toCustomerAddressInput,
  toCustomerListQuery,
  toCustomerLookupQuery,
  toUpdateCustomerAddressInput,
  toUpdateCustomerInput,
} from './customer.mapper';

@ApiSurface('admin')
@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  @Permissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Search and list customers' })
  @ApiOkResponse({ type: CustomerPageResDto })
  list(@CurrentUser() user: CurrentUserType, @Query() query: CustomerListQueryDto) {
    return this.service.list(user, toCustomerListQuery(query));
  }

  @Get('lookup')
  @Permissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Search lightweight customer options' })
  @ApiOkResponse({ type: [CustomerLookupItemResDto] })
  lookup(@CurrentUser() user: CurrentUserType, @Query() query: CustomerLookupQueryDto) {
    return this.service.lookup(user, toCustomerLookupQuery(query));
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOkResponse({ type: CustomerDetailResDto })
  get(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @Permissions(PERMISSIONS.CUSTOMERS_CREATE)
  @ApiCreatedResponse({ type: CustomerResDto })
  create(@CurrentUser() user: CurrentUserType, @Body() body: CreateCustomerReqDto) {
    return this.service.create(user, toCreateCustomerInput(body));
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOkResponse({ type: CustomerResDto })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateCustomerReqDto,
  ) {
    return this.service.update(user, id, toUpdateCustomerInput(body));
  }

  @Post(':id/notes')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiCreatedResponse({ type: CustomerNoteResDto })
  addNote(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: AddCustomerNoteReqDto,
  ) {
    return this.service.addNote(user, id, toAddCustomerNoteInput(body));
  }
  @Post(':id/addresses')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiCreatedResponse({ type: CustomerAddressResDto })
  addAddress(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: CustomerAddressReqDto,
  ) {
    return this.service.addAddress(user, id, toCustomerAddressInput(body));
  }

  @Patch(':id/addresses/:addressId')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOkResponse({ type: CustomerAddressResDto })
  updateAddress(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() body: UpdateCustomerAddressReqDto,
  ) {
    return this.service.updateAddress(user, id, addressId, toUpdateCustomerAddressInput(body));
  }

  @Delete(':id/addresses/:addressId')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  deleteAddress(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    return this.service.deleteAddress(user, id, addressId);
  }
}
