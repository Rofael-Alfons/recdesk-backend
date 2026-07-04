import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformLoginDto, PlatformRefreshDto } from '../dto';
import { PlatformJwtPayload } from '../strategies/platform-jwt.strategy';

interface PlatformAdminRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Constant-ish response: always run a bcrypt compare to reduce user
    // enumeration via timing, then fail with a generic message.
    if (!admin) {
      await bcrypt.compare(dto.password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      admin.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(admin);

    return {
      admin: this.serialize(admin),
      ...tokens,
    };
  }

  async refreshTokens(dto: PlatformRefreshDto) {
    const stored = await this.prisma.platformRefreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { admin: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (new Date() > stored.expiresAt) {
      await this.prisma.platformRefreshToken.deleteMany({
        where: { id: stored.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!stored.admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Rotate: delete the old token before issuing new ones.
    await this.prisma.platformRefreshToken.deleteMany({
      where: { id: stored.id },
    });

    const tokens = await this.generateTokens(stored.admin);

    return {
      admin: this.serialize(stored.admin),
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.platformRefreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async me(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Platform admin not found or inactive');
    }

    return this.serialize(admin);
  }

  private serialize(admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    lastLoginAt?: Date | null;
  }) {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      lastLoginAt: admin.lastLoginAt ?? null,
    };
  }

  private async generateTokens(admin: PlatformAdminRecord) {
    const payload: PlatformJwtPayload = {
      sub: admin.id,
      email: admin.email,
      type: 'platform',
    };

    const accessExpirationSeconds =
      this.configService.get<number>('platform.accessExpirationSeconds') || 900;
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('platform.jwtSecret'),
      expiresIn: accessExpirationSeconds,
    });

    const refreshToken = randomUUID();
    const refreshExpirationSeconds =
      this.configService.get<number>('platform.refreshExpirationSeconds') ||
      604800;
    const expiresAt = new Date(Date.now() + refreshExpirationSeconds * 1000);

    await this.prisma.platformRefreshToken.create({
      data: {
        token: refreshToken,
        adminId: admin.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
