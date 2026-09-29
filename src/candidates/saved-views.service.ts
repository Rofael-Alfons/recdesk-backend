import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSavedViewDto,
  SetViewAlertDto,
  UpdateSavedViewDto,
} from './dto';
import { parseCandidateQuery } from './candidate-query.util';

interface ViewActor {
  id: string;
  companyId: string;
  role: string;
}

const viewInclude = (actorId: string) =>
  ({
    user: { select: { id: true, firstName: true, lastName: true } },
    alerts: { where: { userId: actorId }, select: { emailDigest: true } },
  }) satisfies Prisma.SavedCandidateViewInclude;

type ViewWithOwner = Prisma.SavedCandidateViewGetPayload<{
  include: ReturnType<typeof viewInclude>;
}>;

@Injectable()
export class SavedViewsService {
  constructor(private prisma: PrismaService) {}

  /** The caller's own views plus every view shared within the company. */
  async list(actor: ViewActor) {
    const views = await this.prisma.savedCandidateView.findMany({
      where: {
        companyId: actor.companyId,
        OR: [{ userId: actor.id }, { isShared: true }],
      },
      include: viewInclude(actor.id),
      orderBy: { name: 'asc' },
    });
    return views.map((view) => this.format(view, actor));
  }

  async create(actor: ViewActor, dto: CreateSavedViewDto) {
    const query = await this.normalizeQuery(dto.query);
    try {
      const view = await this.prisma.savedCandidateView.create({
        data: {
          name: dto.name,
          query,
          isShared: dto.isShared ?? false,
          userId: actor.id,
          companyId: actor.companyId,
        },
        include: viewInclude(actor.id),
      });
      return this.format(view, actor);
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async update(actor: ViewActor, id: string, dto: UpdateSavedViewDto) {
    const existing = await this.findEditable(actor, id);
    const query =
      dto.query !== undefined ? await this.normalizeQuery(dto.query) : undefined;
    try {
      const view = await this.prisma.savedCandidateView.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(query !== undefined && { query }),
          ...(dto.isShared !== undefined && { isShared: dto.isShared }),
        },
        include: viewInclude(actor.id),
      });
      // Unsharing takes the view away from everyone but its owner, so their
      // alerts on it stop too.
      if (dto.isShared === false) {
        await this.prisma.savedViewAlert.deleteMany({
          where: { viewId: id, userId: { not: existing.userId } },
        });
      }
      return this.format(view, actor);
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async remove(actor: ViewActor, id: string) {
    await this.findEditable(actor, id);
    await this.prisma.savedCandidateView.delete({ where: { id } });
    return { message: 'View deleted' };
  }

  /**
   * Follow a view: anyone who can see it may, including someone else's
   * shared view. `lastCheckedAt` starts now, so only candidates added from
   * here on trigger alerts.
   */
  async setAlert(actor: ViewActor, viewId: string, dto: SetViewAlertDto) {
    await this.findVisible(actor, viewId);
    const alert = await this.prisma.savedViewAlert.upsert({
      where: { userId_viewId: { userId: actor.id, viewId } },
      create: {
        userId: actor.id,
        viewId,
        emailDigest: dto.emailDigest ?? true,
      },
      update: {
        ...(dto.emailDigest !== undefined && { emailDigest: dto.emailDigest }),
      },
    });
    return { emailDigest: alert.emailDigest };
  }

  async removeAlert(actor: ViewActor, viewId: string) {
    await this.findVisible(actor, viewId);
    await this.prisma.savedViewAlert.deleteMany({
      where: { userId: actor.id, viewId },
    });
    return { message: 'Alert removed' };
  }

  private async findVisible(actor: ViewActor, id: string) {
    const view = await this.prisma.savedCandidateView.findFirst({
      where: {
        id,
        companyId: actor.companyId,
        OR: [{ userId: actor.id }, { isShared: true }],
      },
    });
    if (!view) throw new NotFoundException('View not found');
    return view;
  }

  /**
   * Views the actor cannot see at all are a 404, so private view IDs of
   * other users are not confirmed to exist. Visible-but-not-editable
   * (someone else's shared view, caller not ADMIN) is a 403.
   */
  private async findEditable(actor: ViewActor, id: string) {
    const view = await this.findVisible(actor, id);
    if (view.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only the owner or an admin can change this view');
    }
    return view;
  }

  /** A saved view can never hold a query GET /candidates would reject. */
  private async normalizeQuery(raw: string): Promise<string> {
    const { params } = await parseCandidateQuery(raw);
    return params.toString();
  }

  private mapUniqueError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A view with this name already exists');
    }
    return error;
  }

  private format(view: ViewWithOwner, actor: ViewActor) {
    const isOwner = view.userId === actor.id;
    const alert = view.alerts?.[0];
    return {
      id: view.id,
      name: view.name,
      query: view.query,
      isShared: view.isShared,
      isOwner,
      canEdit: isOwner || actor.role === UserRole.ADMIN,
      owner: view.user,
      alert: alert ? { emailDigest: alert.emailDigest } : null,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
