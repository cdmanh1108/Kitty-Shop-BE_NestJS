import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpCode,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import type { Request, Response } from 'express';
import type { WebProfile } from '../domain/web-auth.repository';
import { WebAuthService } from '../application/web-auth.service';
import {
  WebAuthCookies,
  WebJwtAuthGuard,
  WebAuthOriginGuard,
  type WebRequest,
} from './web-jwt-auth';
import {
  WebCredentialsDto,
  WebPhoneDto,
  WebVerifyOtpDto,
  WebChallengeDto,
  WebProfileDto,
  WebVerifiedDto,
  WebLogoutDto,
} from './web-auth.dto';

const profile = (user: WebProfile): WebProfileDto => ({
  id: user.id,
  phone: user.phone,
  phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
});

@ApiTags('Web - Auth')
@ApiSurface('web')
@Public() // Dedicated Web JWT guard protects /me; Admin bearer authentication stays separate.
@Controller('web/auth')
@UseGuards(WebAuthOriginGuard)
@ApiBadRequestResponse({ type: ErrorResDto })
@ApiForbiddenResponse({ type: ErrorResDto })
@ApiTooManyRequestsResponse({ type: ErrorResDto })
export class WebAuthController {
  constructor(
    private readonly auth: WebAuthService,
    private readonly cookies: WebAuthCookies,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ operationId: 'registerWebUser', summary: 'Đăng ký tài khoản chờ xác thực' })
  @ApiCreatedResponse({ type: WebChallengeDto })
  @ApiConflictResponse({ type: ErrorResDto })
  @ApiResponse({
    status: 503,
    type: ErrorResDto,
    description: 'SMS unavailable; account remains pending and resend can recover',
  })
  register(@Body() input: WebCredentialsDto): Promise<WebChallengeDto> {
    return this.auth.register({ phone: input.phone, password: input.password });
  }
  @Post('verify-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'verifyWebRegistrationOtp',
    summary: 'Xác thực số điện thoại; không đăng nhập tự động',
  })
  @ApiOkResponse({ type: WebVerifiedDto })
  verify(@Body() input: WebVerifyOtpDto): Promise<WebVerifiedDto> {
    return this.auth.verify(input.challengeId, input.otp);
  }

  @Post('resend-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    operationId: 'resendWebRegistrationOtp',
    summary: 'Gửi lại OTP cho tài khoản chờ xác thực',
  })
  @ApiOkResponse({ type: WebChallengeDto })
  @ApiResponse({ status: 503, type: ErrorResDto })
  resend(@Body() input: WebPhoneDto): Promise<WebChallengeDto> {
    return this.auth.resend(input.phone);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'loginWebUser',
    summary: 'Đăng nhập bằng số điện thoại và mật khẩu',
  })
  @ApiOkResponse({ type: WebProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async login(
    @Body() input: WebCredentialsDto,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<WebProfileDto> {
    const tokens = await this.auth.login(
      { phone: input.phone, password: input.password },
      { ipAddress, userAgent },
    );
    this.setTokens(response, tokens);
    return profile(tokens.user);
  }
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    operationId: 'refreshWebAuth',
    summary: 'Rotate Web refresh token and renew access JWT cookies',
  })
  @ApiOkResponse({ type: WebProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<WebProfileDto> {
    const tokens = await this.auth.refresh(this.cookies.readRefresh(request), {
      ipAddress,
      userAgent,
    });
    this.setTokens(response, tokens);
    return profile(tokens.user);
  }
  @Get('me')
  @UseGuards(WebJwtAuthGuard)
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'getWebCurrentUser', summary: 'Hồ sơ tài khoản đang đăng nhập' })
  @ApiOkResponse({ type: WebProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  me(@Req() request: WebRequest, @Res({ passthrough: true }) response: Response): WebProfileDto {
    response.setHeader('Cache-Control', 'no-store');
    // Guard always supplies a validated principal.
    return profile(request.webUser!);
  }
  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth('web-refresh')
  @ApiOperation({ operationId: 'logoutWebUser', summary: 'Thu hồi session hiện tại' })
  @ApiOkResponse({ type: WebLogoutDto })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebLogoutDto> {
    await this.auth.logout(this.cookies.readRefresh(request));
    response.clearCookie(this.cookies.accessName, this.cookies.accessOptions);
    response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
    response.setHeader('Cache-Control', 'no-store');
    return { success: true };
  }
  private setTokens(
    response: Response,
    tokens: {
      accessToken: string;
      accessExpiresAt: Date;
      refreshToken: string;
      refreshExpiresAt: Date;
    },
  ): void {
    response.setHeader('Cache-Control', 'no-store');
    response.cookie(this.cookies.accessName, tokens.accessToken, {
      ...this.cookies.accessOptions,
      expires: tokens.accessExpiresAt,
    });
    response.cookie(this.cookies.refreshName, tokens.refreshToken, {
      ...this.cookies.refreshOptions,
      expires: tokens.refreshExpiresAt,
    });
  }
}
