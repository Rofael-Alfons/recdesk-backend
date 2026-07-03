import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalEmailService } from '../email-sending/transactional-email.service';
import { AllowlistService } from '../allowlist/allowlist.service';
import { PermissionsService } from '../permissions/permissions.service';
import { InviteUserDto, UpdateUserDto } from './dto';
import { InvitationStatus, UserRole } from '@prisma/client';
import { roleLabel } from '../common/roles.util';

// Pending invitations expire after 7 days.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionalEmailService: TransactionalEmailService,
    private allowlistService: AllowlistService,
    private permissionsService: PermissionsService,
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
    requestingUserId: string,
    requestingUserRole: UserRole,
  ) {
    // Only admins can invite users
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can invite users');
    }

    const email = dto.email.toLowerCase();

    // Check if email is already registered as an active user
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Block a duplicate pending invitation for this email in this company
    const existingInvite = await this.prisma.invitation.findFirst({
      where: { email, companyId, status: InvitationStatus.PENDING },
    });

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      throw new ConflictException(
        'An invitation is already pending for this email. Use resend instead.',
      );
    }

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role || UserRole.RECRUITER,
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        companyId,
        invitedById: requestingUserId,
      },
    });

    // Pre-authorize the invited email so accept + login pass the allowlist gate
    await this.allowlistService.allow(email);

    const acceptLink = await this.sendInvitationEmail(
      invitation,
      requestingUserId,
    );

    return {
      invitation: this.formatInvitation(invitation),
      ...(process.env.NODE_ENV !== 'production' && { acceptLink }),
      message:
        'Invitation sent. They will receive an email with a link to set their password and join.',
    };
  }

  async listInvitations(companyId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        companyId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => this.formatInvitation(inv));
  }

  async resendInvitation(
    id: string,
    companyId: string,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ) {
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can resend invitations');
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id, companyId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException('This invitation has already been accepted');
    }

    // Refresh token + expiry and re-open the invitation
    const updated = await this.prisma.invitation.update({
      where: { id },
      data: {
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        status: InvitationStatus.PENDING,
      },
    });

    await this.allowlistService.allow(updated.email);

    const acceptLink = await this.sendInvitationEmail(
      updated,
      requestingUserId,
    );

    return {
      invitation: this.formatInvitation(updated),
      ...(process.env.NODE_ENV !== 'production' && { acceptLink }),
      message: 'Invitation resent.',
    };
  }

  async revokeInvitation(
    id: string,
    companyId: string,
    requestingUserRole: UserRole,
  ) {
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can revoke invitations');
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id, companyId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException(
        'This invitation has already been accepted',
      );
    }

    await this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.REVOKED },
    });

    return { message: 'Invitation revoked.' };
  }

  private formatInvitation(invitation: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: InvitationStatus;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  private async sendInvitationEmail(
    invitation: { email: string; token: string; role: UserRole },
    requestingUserId: string,
  ): Promise<string> {
    const inviter = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: {
        firstName: true,
        lastName: true,
        company: { select: { name: true } },
      },
    });
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`.trim()
      : 'Your team admin';
    const companyName = inviter?.company?.name || 'your company';

    const frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3001';
    const acceptLink = `${frontendUrl}/accept-invite?token=${invitation.token}`;

    const emailResult =
      await this.transactionalEmailService.sendUserInvitationEmail(
        invitation.email,
        acceptLink,
        inviterName,
        companyName,
        roleLabel(invitation.role),
      );

    if (!emailResult.success) {
      this.logger.error(
        `Failed to send invitation email to ${invitation.email}: ${emailResult.error}`,
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[DEV] Invitation accept link for ${invitation.email}: ${acceptLink}`,
      );
    }

    return acceptLink;
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

    const permissions = await this.permissionsService.getUserPermissions(
      user.companyId,
      user.role as UserRole,
    );

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      company: user.company,
    };
  }
}
