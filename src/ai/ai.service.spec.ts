import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn(),
    },
  }));
});

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('AiService', () => {
  let service: AiService;
  let groqCreate: jest.Mock;

  beforeEach(async () => {
    const Groq = require('groq-sdk');
    groqCreate = jest.fn();
    Groq.mockImplementation(() => ({
      chat: { completions: { create: groqCreate } },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              if (key === 'ai.provider') return 'groq';
              if (key === 'groq.apiKey') return 'test-key';
              if (key === 'groq.model') return 'llama-test';
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AiService);
  });

  it('reports groq provider and model', () => {
    expect(service.getProvider()).toBe('groq');
    expect(service.getModel()).toBe('llama-test');
  });

  describe('classifyEmail', () => {
    it('returns parsed classification from AI response', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                isJobApplication: true,
                confidence: 92,
                candidateName: 'Jane Doe',
                candidateEmail: 'jane@example.com',
                candidatePhone: null,
                detectedPosition: 'Engineer',
                reasoning: 'CV attached',
              }),
            },
          },
        ],
      });

      const result = await service.classifyEmail(
        'Application for Engineer',
        'Please find my CV attached',
        'jane@example.com',
        'Jane Doe',
      );

      expect(result.isJobApplication).toBe(true);
      expect(result.confidence).toBe(92);
      expect(groqCreate).toHaveBeenCalled();
    });

    it('returns safe fallback when AI fails', async () => {
      groqCreate.mockRejectedValue(new Error('API down'));

      const result = await service.classifyEmail(
        'Hello',
        'Body',
        'sender@example.com',
        null,
      );

      expect(result.isJobApplication).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.candidateEmail).toBe('sender@example.com');
    });
  });

  describe('parseCV', () => {
    it('returns parsed CV data', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                personalInfo: {
                  fullName: 'Jane Doe',
                  email: 'jane@example.com',
                  phone: null,
                  location: 'Cairo',
                  linkedinUrl: null,
                  githubUrl: null,
                  portfolioUrl: null,
                },
                education: [],
                experience: [],
                skills: ['TypeScript'],
                projects: [],
                certifications: [],
                languages: [],
                summary: 'Strong engineer',
              }),
            },
          },
        ],
      });

      const result = await service.parseCV(
        'Jane Doe\nSkills: TypeScript\nExperience: 3 years',
        'jane-doe.pdf',
      );

      expect(result.personalInfo.fullName).toBe('Jane Doe');
      expect(result.skills).toEqual(['TypeScript']);
    });

    it('throws InternalServerErrorException when parsing fails', async () => {
      groqCreate.mockRejectedValue(new Error('API down'));

      await expect(
        service.parseCV('cv text', 'cv.pdf'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('scoreCandidate', () => {
    it('returns score breakdown', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallScore: 82,
                skillsMatchScore: 85,
                experienceScore: 80,
                educationScore: 75,
                growthScore: 70,
                bonusScore: 60,
                recommendation: 'Recommended',
                scoreExplanation: {
                  skillsMatch: 'Good match',
                  experience: 'Solid',
                  education: 'Relevant',
                  growth: 'Steady',
                  bonus: 'Portfolio',
                },
              }),
            },
          },
        ],
      });

      const result = await service.scoreCandidate(
        {
          personalInfo: {
            fullName: 'Jane',
            email: 'jane@example.com',
            phone: null,
            location: null,
            linkedinUrl: null,
            githubUrl: null,
            portfolioUrl: null,
          },
          education: [],
          experience: [],
          skills: ['TypeScript'],
          projects: [],
          certifications: [],
          languages: [],
          summary: 'Engineer',
        },
        {
          title: 'Backend Engineer',
          requiredSkills: ['TypeScript'],
          preferredSkills: [],
          experienceLevel: 'MID',
          requirements: {},
        },
      );

      expect(result.overallScore).toBe(82);
      expect(result.recommendation).toBe('Recommended');
    });
  });

  describe('generateCandidateSummary', () => {
    it('returns summary text from AI', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Experienced backend engineer with strong TypeScript skills.',
            },
          },
        ],
      });

      const summary = await service.generateCandidateSummary({
        personalInfo: {
          fullName: 'Jane',
          email: null,
          phone: null,
          location: null,
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
        },
        education: [],
        experience: [],
        skills: ['TypeScript'],
        projects: [],
        certifications: [],
        languages: [],
        summary: null,
      });

      expect(summary).toContain('backend engineer');
    });

    it('returns fallback when generation fails', async () => {
      groqCreate.mockRejectedValue(new Error('fail'));

      const summary = await service.generateCandidateSummary({
        personalInfo: {
          fullName: 'Jane',
          email: null,
          phone: null,
          location: null,
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
        },
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
        summary: null,
      });

      expect(summary).toBe('Summary not available');
    });
  });
});
