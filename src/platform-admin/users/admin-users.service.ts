import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListQueryDto, UpdateUserStatusDto } from '../dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Cross-company, paginated, searchable list of ALL tenant users.
   * Optionally filtered by companyId.
   */
  async findAll(query: ListQueryDto, companyId?: string) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(companyId ? { companyId } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          company: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Activate / deactivate any tenant user. On deactivation, revoke that user's
   * refresh tokens so their session cannot be refreshed.
   */
  async updateStatus(userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        isActive: true,
        companyId: true,
      },
    });

    if (!dto.isActive) {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }

    this.logger.log(
      `User ${userId} isActive set to ${dto.isActive} by platform admin`,
    );

    return updated;
  }
}
