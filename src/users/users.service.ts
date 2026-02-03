import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto, UpdateUserDto } from './dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async findAll(companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  async findOne(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            candidateNotes: true,
            candidateActions: true,
            emailsSent: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      stats: {
        notesCreated: user._count.candidateNotes,
        actionsPerformed: user._count.candidateActions,
        emailsSent: user._count.emailsSent,
      },
    };
  }

  async invite(
    dto: InviteUserDto,
    companyId: string,
    requestingUserRole: UserRole,
  ) {
    // Only admins can invite users
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can invite users');
    }

    // Check if email is already registered
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate a temporary password
    const tempPassword = uuidv4().slice(0, 12);
    const saltRounds =
      this.configService.get<number>('bcrypt.saltRounds') || 12;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role || UserRole.RECRUITER,
        companyId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // TODO: Send invitation email with temporary password
    // For now, return the temp password (in production, this would be sent via email only)
    return {
      user,
      tempPassword, // This should only be returned in development
      message:
        'User invited successfully. They will receive an email with login instructions.',
    };
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
    companyId: string,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ) {
    // Check if user exists in the same company
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Users can update their own profile (name only)
    const isSelfUpdate = userId === requestingUserId;

    // If not self-update, must be admin
    if (!isSelfUpdate && requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update other users');
    }

    // Only admins can change roles or activate/deactivate
    if (
      (dto.role || dto.isActive !== undefined) &&
      requestingUserRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only admins can change role or activation status',
      );
    }

    // Prevent removing the last admin
    if (
      dto.role &&
      dto.role !== UserRole.ADMIN &&
      targetUser.role === UserRole.ADMIN
    ) {
      const adminCount = await this.prisma.user.count({
        where: {
          companyId,
          role: UserRole.ADMIN,
          isActive: true,
        },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('Cannot demote the last admin');
      }
    }

    // Prevent deactivating the last admin
    if (dto.isActive === false && targetUser.role === UserRole.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          companyId,
          role: UserRole.ADMIN,
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot deactivate the last admin');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.role && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async remove(
    userId: string,
    companyId: string,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ) {
    // Only admins can delete users
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete users');
    }

    // Cannot delete yourself
    if (userId === requestingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Check if user exists in the same company
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Prevent deleting the last admin
    if (targetUser.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          companyId,
          role: UserRole.ADMIN,
        },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin');
      }
    }

    // Soft delete by deactivating (to preserve data integrity)
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Delete all refresh tokens
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { message: 'User deactivated successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            mode: true,
            plan: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      company: user.company,
    };
  }
}
