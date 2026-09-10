import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { CustomerService } from '../application/customer.service';
import {
  AddCustomerNoteReqDto,
  CustomerAddressReqDto,
  UpdateCustomerAddressReqDto,
  CreateCustomerReqDto,
  CustomerListQueryDto,
  CustomerDetailResDto,
  CustomerPageResDto,
  CustomerResDto,
  UpdateCustomerReqDto,
} from './customer.dto';

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
    return this.service.list(user, query);
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
    return this.service.create(user, body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOkResponse({ type: CustomerResDto })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateCustomerReqDto,
  ) {
    return this.service.update(user, id, body);
  }

  @Post(':id/notes')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  addNote(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: AddCustomerNoteReqDto,
  ) {
    return this.service.addNote(user, id, body);
  }
  @Post(':id/addresses')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  addAddress(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() body: CustomerAddressReqDto) {
    return this.service.addAddress(user, id, body);
  }

  @Patch(':id/addresses/:addressId')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  updateAddress(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Param('addressId') addressId: string, @Body() body: UpdateCustomerAddressReqDto) {
    return this.service.updateAddress(user, id, addressId, body);
  }

  @Delete(':id/addresses/:addressId')
  @Permissions(PERMISSIONS.CUSTOMERS_UPDATE)
  deleteAddress(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Param('addressId') addressId: string) {
    return this.service.deleteAddress(user, id, addressId);
  }

}
