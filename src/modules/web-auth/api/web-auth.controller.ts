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
import type { WebTokenResult } from '../application/web-auth.contracts';
import { WebRegistrationService } from '../application/web-registration.service';
import { WebSessionService } from '../application/web-session.service';
import { WebAuthCookies } from './web-auth-cookies';
import { WebJwtAuthGuard, WebAuthOriginGuard, type WebAuthRequest } from '../public';
import {
  WebCredentialsDto,
  WebVerifyOtpDto,
  WebResendOtpDto,
  WebChallengeDto,
  WebProfileDto,
  WebVerifiedDto,
  WebLogoutDto,
} from './web-auth.dto';

const profile = (user: WebProfile): WebProfileDto => ({
  id: user.id,
  email: user.email,
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
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
    private readonly registration: WebRegistrationService,
    private readonly session: WebSessionService,
    private readonly cookies: WebAuthCookies,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    operationId: 'registerWebUser',
    summary: 'Register a storefront account with email and password.',
  })
  @ApiCreatedResponse({ type: WebChallengeDto })
  @ApiConflictResponse({ type: ErrorResDto })
  @ApiResponse({
    status: 503,
    type: ErrorResDto,
    description:
      'Verification delivery unavailable; account remains pending and resend can recover',
  })
  register(@Body() input: WebCredentialsDto): Promise<WebChallengeDto> {
    return this.registration.register({ email: input.email, password: input.password });
  }
  @Post('verify-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'verifyWebRegistrationOtp',
    summary: 'Verify the registration email; sign-in is separate.',
  })
  @ApiOkResponse({ type: WebVerifiedDto })
  verify(@Body() input: WebVerifyOtpDto): Promise<WebVerifiedDto> {
    return this.registration.verify(input.challengeId, input.otp);
  }

  @Post('resend-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    operationId: 'resendWebRegistrationOtp',
    summary: 'Resend a verification code using the active challenge ID.',
  })
  @ApiOkResponse({ type: WebChallengeDto })
  @ApiResponse({ status: 503, type: ErrorResDto })
  resend(@Body() input: WebResendOtpDto): Promise<WebChallengeDto> {
    return this.registration.resend(input.challengeId);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    operationId: 'loginWebUser',
    summary: 'Sign in with email and password.',
  })
  @ApiOkResponse({ type: WebProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async login(
    @Body() input: WebCredentialsDto,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<WebProfileDto> {
    const tokens = await this.session.login(
      { email: input.email, password: input.password },
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
    const tokens = await this.session.refresh(this.cookies.readRefresh(request), {
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
  me(
    @Req() request: WebAuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): WebProfileDto {
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
    await this.session.logout(this.cookies.readRefresh(request));
    response.clearCookie(this.cookies.accessName, this.cookies.accessOptions);
    response.clearCookie(this.cookies.refreshName, this.cookies.refreshOptions);
    response.setHeader('Cache-Control', 'no-store');
    return { success: true };
  }
  private setTokens(
    response: Response,
    tokens: Pick<
      WebTokenResult,
      'accessToken' | 'accessExpiresAt' | 'refreshToken' | 'refreshExpiresAt'
    >,
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
