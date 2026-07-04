import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface PlatformJwtPayload {
  sub: string;
  email: string;
  // Discriminator: platform tokens always carry `type: 'platform'` so a tenant
  // token (which lacks it, and is signed with a different secret anyway) can
  // never be replayed against admin routes.
  type: 'platform';
}

export const PLATFORM_JWT_STRATEGY = 'platform-jwt';

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  PLATFORM_JWT_STRATEGY,
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('platform.jwtSecret');
    if (!secret) {
      throw new Error('PLATFORM_JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: PlatformJwtPayload) {
    if (payload.type !== 'platform') {
      throw new UnauthorizedException('Invalid platform token');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Platform admin not found or inactive');
    }

    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };
  }
}
