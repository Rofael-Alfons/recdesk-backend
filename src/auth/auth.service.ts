import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';

// OAuth profile interface used by both Google and Microsoft strategies
export interface OAuthProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export type OAuthProvider = 'google' | 'microsoft';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds =
      this.configService.get<number>('bcrypt.saltRounds') || 12;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Create company and user in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create company
      const company = await prisma.company.create({
        data: {
          name: dto.companyName,
          domain: dto.companyDomain?.toLowerCase(),
          mode: dto.companyMode || 'FULL_ATS',
        },
      });

      // Create user as admin
      const user = await prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'ADMIN',
          companyId: company.id,
        },
        include: { company: true },
      });

      return user;
    });

    // Generate tokens
    const tokens = await this.generateTokens(result);

    return {
      user: {
        id: result.id,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName,
        role: result.role,
        company: {
          id: result.company.id,
          name: result.company.name,
          mode: result.company.mode,
          plan: result.company.plan,
        },
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Check if user has a password (OAuth-only users don't)
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google or Microsoft.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        company: {
          id: user.company.id,
          name: user.company.name,
          mode: user.company.mode,
          plan: user.company.plan,
        },
      },
      ...tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: { include: { company: true } } },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (new Date() > refreshToken.expiresAt) {
      // Use deleteMany to avoid error if already deleted
      await this.prisma.refreshToken.deleteMany({
        where: { id: refreshToken.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!refreshToken.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Delete old refresh token (use deleteMany to avoid error if already deleted)
    await this.prisma.refreshToken.deleteMany({
      where: { id: refreshToken.id },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(refreshToken.user);

    return {
      user: {
        id: refreshToken.user.id,
        email: refreshToken.user.email,
        firstName: refreshToken.user.firstName,
        lastName: refreshToken.user.lastName,
        role: refreshToken.user.role,
        company: {
          id: refreshToken.user.company.id,
          name: refreshToken.user.company.name,
          mode: refreshToken.user.company.mode,
          plan: refreshToken.user.company.plan,
        },
      },
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    companyId: string;
    role: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };

    const accessExpirationSeconds =
      this.configService.get<number>('jwt.accessExpirationSeconds') || 900;
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpirationSeconds,
    });

    // Generate refresh token
    const refreshToken = uuidv4();
    const refreshExpirationSeconds =
      this.configService.get<number>('jwt.refreshExpirationSeconds') || 604800;
    const expiresAt = new Date(Date.now() + refreshExpirationSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return {
        message:
          'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Invalidate any existing reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // TODO: Send email with reset link
    // For now, log the token (in production, this would be sent via email only)
    const frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;

    console.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);

    return {
      message:
        'If an account exists with this email, a password reset link has been sent.',
      // Only include in development
      ...(process.env.NODE_ENV !== 'production' && { resetLink }),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.used) {
      throw new BadRequestException('This reset link has already been used');
    }

    if (new Date() > resetToken.expiresAt) {
      throw new BadRequestException('Reset link has expired');
    }

    if (!resetToken.user.isActive) {
      throw new BadRequestException('Account is deactivated');
    }

    // Hash new password
    const saltRounds =
      this.configService.get<number>('bcrypt.saltRounds') || 12;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    // Update password and mark token as used in a transaction
    await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId: resetToken.userId },
      });
    });

    return {
      message:
        'Password has been reset successfully. Please login with your new password.',
    };
  }

  /**
   * Validate OAuth user - find existing user or create new one
   * Handles account linking if user exists with same email
   */
  async validateOAuthUser(
    profile: OAuthProfile,
    provider: OAuthProvider,
  ): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId: string;
    isNewUser: boolean;
    needsCompanySetup: boolean;
  }> {
    const email = profile.email.toLowerCase();
    const providerIdField = provider === 'google' ? 'googleId' : 'microsoftId';

    // First, try to find user by provider ID
    let user = await this.prisma.user.findFirst({
      where: { [providerIdField]: profile.id },
      include: { company: true },
    });

    if (user) {
      // User found by provider ID - return existing user
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Update avatar if changed
      if (profile.avatarUrl && user.avatarUrl !== profile.avatarUrl) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: profile.avatarUrl },
        });
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        isNewUser: false,
        needsCompanySetup: false,
      };
    }

    // Try to find user by email (for account linking)
    user = await this.prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (user) {
      // User exists with this email - link the OAuth provider
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Link the OAuth provider to existing account
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          [providerIdField]: profile.id,
          avatarUrl: profile.avatarUrl || user.avatarUrl,
        },
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        isNewUser: false,
        needsCompanySetup: false,
      };
    }

    // New user - create account with a temporary company
    // They'll need to complete company setup on first login
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create a temporary company for the user
      const company = await prisma.company.create({
        data: {
          name: `${profile.firstName}'s Company`,
          mode: 'FULL_ATS',
        },
      });

      // Create the user
      const newUser = await prisma.user.create({
        data: {
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          [providerIdField]: profile.id,
          avatarUrl: profile.avatarUrl,
          role: 'ADMIN',
          companyId: company.id,
        },
        include: { company: true },
      });

      return newUser;
    });

    return {
      id: result.id,
      email: result.email,
      firstName: result.firstName,
      lastName: result.lastName,
      role: result.role,
      companyId: result.companyId,
      isNewUser: true,
      needsCompanySetup: true,
    };
  }

  /**
   * Generate tokens and response for OAuth callback
   */
  async handleOAuthCallback(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId: string;
    isNewUser: boolean;
    needsCompanySetup: boolean;
  }) {
    // Get full user with company info
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { company: true },
    });

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.generateTokens(fullUser);

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        role: fullUser.role,
        avatarUrl: fullUser.avatarUrl,
        company: {
          id: fullUser.company.id,
          name: fullUser.company.name,
          mode: fullUser.company.mode,
          plan: fullUser.company.plan,
        },
      },
      isNewUser: user.isNewUser,
      needsCompanySetup: user.needsCompanySetup,
      ...tokens,
    };
  }
}
