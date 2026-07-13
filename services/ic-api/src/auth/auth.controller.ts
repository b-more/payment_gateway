import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService, type LoginResult } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitGuard } from '../api/rate-limit.guard';
import {
  clearAuthCookies,
  parseCookies,
  refreshCookieName,
  setAuthCookies,
  type Realm,
} from './cookies';
import { CurrentPrincipal, type AuthedPortalRequest, type Principal } from './principal';
import { getClientIp, getHeader } from '../api/request-context';
import { UnauthorizedError, ValidationError } from '../money/errors';
import { LoginDto, VerifyOtpDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { realmToScope } from './realm';

// Portal auth (§7.1). Realm-parameterized: /v1/auth/admin/* and /v1/auth/merchant/*
// use separate sessions (SEC-A4). Tokens are delivered as httpOnly cookies.
@ApiTags('auth')
@Controller('auth/:realm')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Password login — issues an email OTP challenge' })
  async login(
    @Param('realm') realm: string,
    @Body() dto: LoginDto,
    @Req() req: AuthedPortalRequest,
  ): Promise<LoginResult> {
    return this.auth.login({
      realm: toRealm(realm),
      email: dto.email,
      password: dto.password,
      ip: getClientIp(req),
    });
  }

  @Post('verify-otp')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Verify the OTP and start a session' })
  async verifyOtp(
    @Param('realm') realm: string,
    @Body() dto: VerifyOtpDto,
    @Req() req: AuthedPortalRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: { id: string; email: string; roles: string[] } }> {
    const r = toRealm(realm);
    const result = await this.auth.verifyOtp({
      realm: r,
      challengeId: dto.challengeId,
      code: dto.code,
      ip: getClientIp(req),
      userAgent: getHeader(req, 'user-agent') ?? null,
    });
    setAuthCookies(res, r, result.accessToken, result.refreshToken);
    return { user: { id: result.user.id, email: result.user.email, roles: result.user.roles } };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Request a password reset code by email' })
  async forgotPassword(
    @Param('realm') realm: string,
    @Body() dto: ForgotPasswordDto,
  ): Promise<LoginResult> {
    return this.auth.forgotPassword({ realm: toRealm(realm), email: dto.email });
  }

  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Reset the password using the emailed code' })
  async resetPassword(
    @Param('realm') realm: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<{ ok: true }> {
    return this.auth.resetPassword({
      realm: toRealm(realm),
      challengeId: dto.challengeId,
      code: dto.code,
      newPassword: dto.newPassword,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the session (new access + refresh)' })
  async refresh(
    @Param('realm') realm: string,
    @Req() req: AuthedPortalRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const r = toRealm(realm);
    const refreshToken = parseCookies(getHeader(req, 'cookie'))[refreshCookieName(r)];
    if (!refreshToken) throw new UnauthorizedError();
    const tokens = await this.auth.refresh({
      realm: r,
      refreshToken,
      ip: getClientIp(req),
      userAgent: getHeader(req, 'user-agent') ?? null,
    });
    setAuthCookies(res, r, tokens.accessToken, tokens.refreshToken);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log out (revoke the refresh session)' })
  async logout(
    @Param('realm') realm: string,
    @Req() req: AuthedPortalRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const r = toRealm(realm);
    const refreshToken = parseCookies(getHeader(req, 'cookie'))[refreshCookieName(r)];
    if (refreshToken) await this.auth.logout({ refreshToken });
    clearAuthCookies(res, r);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Current authenticated principal' })
  me(@Param('realm') realm: string, @CurrentPrincipal() principal: Principal): Principal {
    if (principal.scope !== realmToScope(toRealm(realm))) {
      throw new UnauthorizedError(); // token realm must match the path (SEC-A4)
    }
    return principal;
  }
}

function toRealm(realm: string): Realm {
  if (realm === 'admin' || realm === 'merchant') return realm;
  throw new ValidationError(`unknown realm: ${realm}`);
}
