import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../application/auth.service';
import {
  AuthUserResDto,
  ChangePasswordReqDto,
  LoginReqDto,
  LoginResDto,
  RefreshTokenReqDto,
} from './auth.dto';
import { toChangePasswordInput, toLoginInput } from './auth.mapper';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiHeader({ name: 'user-agent', required: false })
  @ApiOperation({ summary: 'Admin login' })
  @ApiOkResponse({ type: LoginResDto })
  login(
    @Body() body: LoginReqDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResDto> {
    return this.authService.login(toLoginInput(body), { ipAddress, userAgent });
  }

  @Public()
  @Post('refresh')
  @ApiHeader({ name: 'user-agent', required: false })
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  @ApiOkResponse({ type: LoginResDto })
  refresh(
    @Body() body: RefreshTokenReqDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResDto> {
    return this.authService.refresh(body.refreshToken, { ipAddress, userAgent });
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() body: RefreshTokenReqDto): Promise<{ success: true }> {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Current admin identity and permissions' })
  @ApiOkResponse({ type: AuthUserResDto })
  me(@CurrentUser() user: CurrentUserType): CurrentUserType {
    return this.authService.me(user);
  }
  @Post('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change current admin password and revoke all refresh sessions' })
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() body: ChangePasswordReqDto,
  ): Promise<{ success: true }> {
    return this.authService.changePassword(user, toChangePasswordInput(body));
  }
}
