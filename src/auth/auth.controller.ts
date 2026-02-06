import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { Public } from '../common/decorators/public.decorator';
import {
  ThrottleAuth,
  ThrottleRegistration,
} from '../common/decorators/throttle-auth.decorator';

// Extend Express Request to include user from OAuth strategies
interface OAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: string;
  isNewUser: boolean;
  needsCompanySetup: boolean;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) { }

  @Public()
  @ThrottleRegistration()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user and company' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @ThrottleAuth()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent if account exists',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ============================================
  // GOOGLE OAUTH
  // ============================================

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleAuthCallback(
    @Req() req: Request & { user: OAuthUser },
    @Res() res: Response,
  ) {
    return this.handleOAuthCallback(req, res, 'google');
  }

  // ============================================
  // MICROSOFT OAUTH
  // ============================================

  @Public()
  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  @ApiOperation({ summary: 'Initiate Microsoft OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Microsoft OAuth' })
  async microsoftAuth() {
    // Guard redirects to Microsoft
  }

  @Public()
  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  @ApiExcludeEndpoint()
  async microsoftAuthCallback(
    @Req() req: Request & { user: OAuthUser },
    @Res() res: Response,
  ) {
    return this.handleOAuthCallback(req, res, 'microsoft');
  }

  // ============================================
  // SHARED OAUTH CALLBACK HANDLER
  // ============================================

  private async handleOAuthCallback(
    req: Request & { user: OAuthUser },
    res: Response,
    provider: 'google' | 'microsoft',
  ) {
    try {
      const user = req.user;

      if (!user) {
        const frontendUrl = this.configService.get<string>('frontend.url');
        return res.redirect(
          `${frontendUrl}/login?error=oauth_failed&provider=${provider}`,
        );
      }

      // Generate tokens
      const result = await this.authService.handleOAuthCallback(user);

      // Redirect to frontend with tokens in query params
      const frontendUrl = this.configService.get<string>('frontend.url');
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isNewUser: String(result.isNewUser),
        needsCompanySetup: String(result.needsCompanySetup),
      });

      return res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
    } catch (error) {
      console.error(`OAuth ${provider} callback error:`, error);
      const frontendUrl = this.configService.get<string>('frontend.url');
      const errorMessage =
        error instanceof Error ? error.message : 'Authentication failed';
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}&provider=${provider}`,
      );
    }
  }
}
