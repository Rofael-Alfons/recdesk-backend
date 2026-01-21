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
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
    const saltRounds = this.configService.get<number>('bcrypt.saltRounds') || 12;
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

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

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
      await this.prisma.refreshToken.delete({
        where: { id: refreshToken.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!refreshToken.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Delete old refresh token
    await this.prisma.refreshToken.delete({
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

  private async generateTokens(user: { id: string; email: string; companyId: string; role: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };

    const accessExpirationSeconds = this.configService.get<number>('jwt.accessExpirationSeconds') || 900;
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpirationSeconds,
    });

    // Generate refresh token
    const refreshToken = uuidv4();
    const refreshExpirationSeconds = this.configService.get<number>('jwt.refreshExpirationSeconds') || 604800;
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

}
