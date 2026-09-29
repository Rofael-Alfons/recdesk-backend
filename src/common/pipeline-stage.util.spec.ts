import { BadRequestException } from '@nestjs/common';
import { CandidateStatus, StageCategory } from '@prisma/client';
import {
  DEFAULT_PIPELINE_STAGES,
  categoryForStatus,
  categoryFromName,
  effectiveStage,
  stageCategory,
  stageForStatus,
  statusForStage,
  validateStageInputs,
} from './pipeline-stage.util';

describe('pipeline-stage.util', () => {
  const defaults = DEFAULT_PIPELINE_STAGES.map((s, i) => ({
    id: `stage-${i}`,
    name: s.name,
    orderIndex: s.orderIndex,
    category: s.category,
  }));

  // Full-stack job: two INTERVIEW-category stages, custom names.
  const custom = [
    { id: 'scr', name: 'Screening', orderIndex: 0, category: 'SCREENING' as StageCategory },
    { id: 'tech', name: 'Tech Interview', orderIndex: 1, category: 'INTERVIEW' as StageCategory },
    { id: 'assess', name: 'Assessment', orderIndex: 2, category: 'INTERVIEW' as StageCategory },
    { id: 'final', name: 'Final', orderIndex: 3, category: 'INTERVIEW' as StageCategory },
    { id: 'offer', name: 'Offer', orderIndex: 4, category: 'OFFER' as StageCategory },
  ];

  describe('categories', () => {
    it('derives categories from default names, else INTERVIEW', () => {
      expect(categoryFromName(' Hired ')).toBe('HIRED');
      expect(categoryFromName('Tech Test')).toBe('INTERVIEW');
    });

    it('prefers the stored category over the name', () => {
      expect(stageCategory({ name: 'New', category: 'OFFER' })).toBe('OFFER');
      expect(stageCategory({ name: 'Offer', category: null })).toBe('OFFER');
    });

    it.each<[CandidateStatus, StageCategory | null]>([
      ['NEW', 'NEW'],
      ['SCREENING', 'SCREENING'],
      ['SHORTLISTED', 'SCREENING'],
      ['INTERVIEWING', 'INTERVIEW'],
      ['OFFERED', 'OFFER'],
      ['HIRED', 'HIRED'],
      ['REJECTED', null],
      ['WITHDRAWN', null],
    ])('categoryForStatus(%s) = %s', (status, category) => {
      expect(categoryForStatus(status)).toBe(category);
    });
  });

  describe('stageForStatus', () => {
    it('picks the first stage of the matching category', () => {
      expect(stageForStatus(custom, 'INTERVIEWING')?.id).toBe('tech');
      expect(stageForStatus(defaults, 'SHORTLISTED')?.name).toBe('Screening');
    });

    it('falls back to the first stage when no stage has the category', () => {
      expect(stageForStatus(custom, 'HIRED')?.id).toBe('scr');
      expect(stageForStatus(custom, 'NEW')?.id).toBe('scr');
    });

    it('returns null when the job has no stages', () => {
      expect(stageForStatus([], 'NEW')).toBeNull();
    });
  });

  describe('effectiveStage', () => {
    it('uses the stored stage when it belongs to the job', () => {
      expect(
        effectiveStage({ currentStageId: 'final', status: 'INTERVIEWING' }, custom)?.id,
      ).toBe('final');
    });

    it('derives from status when the stored stage is missing or from another job', () => {
      expect(effectiveStage({ currentStageId: null, status: 'OFFERED' }, custom)?.id).toBe('offer');
      expect(
        effectiveStage({ currentStageId: 'other-job-stage', status: 'SCREENING' }, custom)?.id,
      ).toBe('scr');
    });

    it('keeps the stored stage for closed candidates', () => {
      expect(effectiveStage({ currentStageId: 'assess', status: 'REJECTED' }, custom)?.id).toBe(
        'assess',
      );
    });
  });

  describe('statusForStage', () => {
    it('maps the stage category to a status', () => {
      expect(statusForStage(custom[2])).toBe('INTERVIEWING');
      expect(statusForStage(custom[4], 'INTERVIEWING')).toBe('OFFERED');
    });

    it('keeps the current status when it is already in that category', () => {
      expect(statusForStage(custom[0], 'SHORTLISTED')).toBe('SHORTLISTED');
    });

    it('uses the name fallback for uncategorized stages', () => {
      expect(statusForStage({ name: 'Hired', category: null })).toBe('HIRED');
    });
  });

  describe('validateStageInputs', () => {
    it('trims names and returns the stages', () => {
      expect(validateStageInputs([{ name: '  Final ' }])).toEqual([{ name: 'Final' }]);
    });

    it('rejects empty, oversized and duplicate pipelines', () => {
      expect(() => validateStageInputs([])).toThrow(BadRequestException);
      expect(() =>
        validateStageInputs(Array.from({ length: 16 }, (_, i) => ({ name: `S${i}` }))),
      ).toThrow(BadRequestException);
      expect(() => validateStageInputs([{ name: 'Final' }, { name: ' final' }])).toThrow(
        /Duplicate stage name/,
      );
      expect(() => validateStageInputs([{ name: '   ' }])).toThrow(BadRequestException);
    });
  });
});
