import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Track company activity for smart email polling
    // Rate-limited: only update if >1 minute since last update to avoid DB spam
    const now = new Date();
    const lastActivity = user.company.lastActivityAt;
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    if (!lastActivity || lastActivity < oneMinuteAgo) {
      // Fire and forget - don't await to avoid slowing down requests
      this.prisma.company
        .update({
          where: { id: user.companyId },
          data: { lastActivityAt: now },
        })
        .catch(() => {}); // Silently ignore errors
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      company: user.company,
    };
  }
}
