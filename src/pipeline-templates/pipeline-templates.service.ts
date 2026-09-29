import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PIPELINE_STAGES,
  StageBlueprint,
  stageCategory,
  validateStageInputs,
} from '../common/pipeline-stage.util';
import {
  CreatePipelineTemplateDto,
  UpdatePipelineTemplateDto,
} from './dto';

/** ID of the built-in template shown while a company has none of its own. */
export const STANDARD_TEMPLATE_ID = 'standard';
export const STANDARD_TEMPLATE_NAME = 'Standard';

export const STANDARD_STAGES: StageBlueprint[] = DEFAULT_PIPELINE_STAGES.map(
  ({ name, category, color }) => ({ name, category, color }),
);

export interface PipelineTemplateView {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StageBlueprint[];
  /** True for the built-in Standard template (not stored yet). */
  builtIn: boolean;
}

function toBlueprints(stages: StageBlueprint[]): StageBlueprint[] {
  return validateStageInputs(stages).map(({ name, category, color }) => ({
    name,
    category,
    color,
  }));
}

@Injectable()
export class PipelineTemplatesService {
  constructor(private prisma: PrismaService) {}

  private standard(): PipelineTemplateView {
    return {
      id: STANDARD_TEMPLATE_ID,
      name: STANDARD_TEMPLATE_NAME,
      isDefault: true,
      stages: STANDARD_STAGES,
      builtIn: true,
    };
  }

  private view(row: {
    id: string;
    name: string;
    isDefault: boolean;
    stages: Prisma.JsonValue;
  }): PipelineTemplateView {
    return {
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      stages: row.stages as unknown as StageBlueprint[],
      builtIn: false,
    };
  }

  async list(companyId: string): Promise<PipelineTemplateView[]> {
    const rows = await this.prisma.pipelineTemplate.findMany({
      where: { companyId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.length ? rows.map((r) => this.view(r)) : [this.standard()];
  }

  /**
   * Stages to seed a new job with: the given template, else the company
   * default, else the built-in Standard pipeline.
   */
  async resolveStages(
    companyId: string,
    templateId?: string,
  ): Promise<StageBlueprint[]> {
    if (templateId && templateId !== STANDARD_TEMPLATE_ID) {
      const row = await this.prisma.pipelineTemplate.findFirst({
        where: { id: templateId, companyId },
      });
      if (!row) throw new NotFoundException('Pipeline template not found');
      return this.view(row).stages;
    }
    if (templateId === STANDARD_TEMPLATE_ID) return STANDARD_STAGES;

    const def = await this.prisma.pipelineTemplate.findFirst({
      where: { companyId, isDefault: true },
    });
    return def ? this.view(def).stages : STANDARD_STAGES;
  }

  async create(dto: CreatePipelineTemplateDto, companyId: string) {
    const stages = toBlueprints(dto.stages);
    const name = dto.name.trim();
    await this.assertNameFree(companyId, name);

    const existingCount = await this.prisma.pipelineTemplate.count({
      where: { companyId },
    });
    // First real template: store the built-in Standard alongside it so it
    // doesn't silently disappear from the list.
    const materializeStandard =
      existingCount === 0 &&
      name.toLowerCase() !== STANDARD_TEMPLATE_NAME.toLowerCase();
    // With no templates yet, the new one becomes default unless the
    // materialized Standard takes that role.
    const makeDefault =
      dto.isDefault ?? (existingCount === 0 && !materializeStandard);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (makeDefault) {
      ops.push(
        this.prisma.pipelineTemplate.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        }),
      );
    }
    if (materializeStandard) {
      ops.push(
        this.prisma.pipelineTemplate.create({
          data: {
            companyId,
            name: STANDARD_TEMPLATE_NAME,
            isDefault: !makeDefault,
            stages: STANDARD_STAGES as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }
    const createOp = this.prisma.pipelineTemplate.create({
      data: {
        companyId,
        name,
        isDefault: makeDefault,
        stages: stages as unknown as Prisma.InputJsonValue,
      },
    });
    ops.push(createOp);

    const results = await this.prisma.$transaction(ops);
    return this.view(results[results.length - 1] as any);
  }

  async update(id: string, dto: UpdatePipelineTemplateDto, companyId: string) {
    const existing = await this.findOwned(id, companyId);
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(companyId, name);
    }
    const stages = dto.stages ? toBlueprints(dto.stages) : undefined;

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.isDefault === true && !existing.isDefault) {
      ops.push(
        this.prisma.pipelineTemplate.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        }),
      );
    }
    ops.push(
      this.prisma.pipelineTemplate.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(stages && { stages: stages as unknown as Prisma.InputJsonValue }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      }),
    );
    const results = await this.prisma.$transaction(ops);
    return this.view(results[results.length - 1] as any);
  }

  async setDefault(id: string, companyId: string) {
    return this.update(id, { isDefault: true }, companyId);
  }

  /** Jobs hold copies of their stages, so deleting never touches jobs. */
  async remove(id: string, companyId: string) {
    await this.findOwned(id, companyId);
    await this.prisma.pipelineTemplate.delete({ where: { id } });
    return { message: 'Pipeline template deleted' };
  }

  async createFromJob(jobId: string, name: string, companyId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: { pipelineStages: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Job not found');

    return this.create(
      {
        name,
        stages: job.pipelineStages.map((s) => ({
          name: s.name,
          category: stageCategory(s),
          color: s.color,
        })),
      },
      companyId,
    );
  }

  private async findOwned(id: string, companyId: string) {
    const row = await this.prisma.pipelineTemplate.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Pipeline template not found');
    return row;
  }

  private async assertNameFree(companyId: string, name: string) {
    const clash = await this.prisma.pipelineTemplate.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`A template named "${name}" already exists`);
    }
  }
}
