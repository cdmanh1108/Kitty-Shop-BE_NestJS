import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../application/auth.service';
import { AuthUserResDto, ChangePasswordReqDto, LoginReqDto, LoginResDto } from './auth.dto';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { toChangePasswordInput, toLoginInput } from './auth.mapper';
import { AdminAuthCookies, AdminAuthOriginGuard } from './admin-auth-cookie';

@ApiSurface('admin')
@ApiTags('Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AdminAuthCookies,
  ) {}

  @Public()
  @Post('login')
  @UseGuards(AdminAuthOriginGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'user-agent', required: false })
  @ApiOperation({ summary: 'Admin login' })
  @ApiCreatedResponse({ type: LoginResDto })
  async login(
    @Body() body: LoginReqDto,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResDto> {
    try {
      const session = await this.authService.login(toLoginInput(body), { ipAddress, userAgent });
      this.setRefreshCookie(response, session.tokens.refreshToken, session.tokens.refreshExpiresAt);
      return this.toResponse(session);
    } catch (error) {
      // A failed account switch must not leave a previous browser session restorable.
      response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
      throw error;
    }
  }

  @Public()
  @Post('refresh')
  @UseGuards(AdminAuthOriginGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'user-agent', required: false })
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  @ApiCreatedResponse({ type: LoginResDto })
  @ApiCookieAuth('admin-refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResDto> {
    try {
      const session = await this.authService.refresh(this.cookies.readRefresh(request), {
        ipAddress,
        userAgent,
      });
      this.setRefreshCookie(response, session.tokens.refreshToken, session.tokens.refreshExpiresAt);
      return this.toResponse(session);
    } catch (error) {
      response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(AdminAuthOriginGuard)
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('admin-refresh')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(
    @CurrentUser() user: CurrentUserType,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.logout(user, this.cookies.readRefresh(request));
    response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
    response.setHeader('Cache-Control', 'no-store');
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
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change current admin password and revoke all refresh sessions' })
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() body: ChangePasswordReqDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const result = await this.authService.changePassword(user, toChangePasswordInput(body));
    response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
    return result;
  }

  private setRefreshCookie(response: Response, refreshToken: string, expires: Date): void {
    response.cookie(this.cookies.refreshName, refreshToken, {
      ...this.cookies.refreshOptions,
      expires,
    });
  }

  private toResponse(session: Awaited<ReturnType<AuthService['login']>>): LoginResDto {
    return {
      user: session.user,
      tokens: { accessToken: session.tokens.accessToken, expiresIn: session.tokens.expiresIn },
    };
  }
}
