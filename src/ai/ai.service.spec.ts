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
                  location: 'Nasr City, Cairo, Egypt',
                  country: 'Egypt',
                  region: 'Cairo',
                  city: 'Nasr City',
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
      expect(result.personalInfo.location).toBe('Nasr City, Cairo, Egypt');
      expect(result.personalInfo.country).toBe('Egypt');
      expect(result.personalInfo.region).toBe('Cairo');
      expect(result.personalInfo.city).toBe('Nasr City');
    });

    it('asks the model to decompose location into country, region and city', async () => {
      groqCreate.mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      });

      await service.parseCV('cv text', 'cv.pdf');

      const prompt = groqCreate.mock.calls[0][0].messages[1].content as string;
      expect(prompt).toContain('"country": string or null');
      expect(prompt).toContain('"region": string or null');
      expect(prompt).toContain('"city": string or null');
      expect(prompt).toContain('return null for that part rather than guessing');
    });

    it('asks for total experience years and highest education level, null over guessing', async () => {
      groqCreate.mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      });

      await service.parseCV('cv text', 'cv.pdf');

      const prompt = groqCreate.mock.calls[0][0].messages[1].content as string;
      expect(prompt).toContain('"totalExperienceYears": number or null');
      expect(prompt).toContain(
        '"highestEducationLevel": "HIGH_SCHOOL" | "DIPLOMA" | "BACHELOR" | "MASTER" | "DOCTORATE" | null',
      );
      expect(prompt).toContain('merge overlapping periods');
      // "Present" needs an anchor date, or the model guesses the current year.
      expect(prompt).toMatch(/treat "Present" as today, \d{4}-\d{2}-\d{2}/);
    });

    it('derives profile facets from stored experience, education and location', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                totalExperienceYears: 4.5,
                highestEducationLevel: 'BACHELOR',
                country: 'Egypt',
                region: 'Cairo',
                city: 'Nasr City',
              }),
            },
          },
        ],
      });

      const result = await service.deriveProfileFacets({
        experience: [{ title: 'Engineer', duration: 'May 2021 – Present' }],
        education: [{ degree: 'BSc Computer Science' }],
        location: 'Nasr City, Cairo, Egypt',
      });

      expect(result).toEqual({
        totalExperienceYears: 4.5,
        highestEducationLevel: 'BACHELOR',
        country: 'Egypt',
        region: 'Cairo',
        city: 'Nasr City',
      });
      const prompt = groqCreate.mock.calls[0][0].messages[1].content as string;
      expect(prompt).toContain('May 2021 – Present');
      expect(prompt).toContain('BSc Computer Science');
      expect(prompt).toContain('"Nasr City, Cairo, Egypt"');
      expect(prompt).toContain('return null for that part rather than guessing');
    });

    it('deriveProfileFacets throws when the model fails, so the backfill retries later', async () => {
      groqCreate.mockRejectedValue(new Error('API down'));

      await expect(
        service.deriveProfileFacets({ experience: [], education: [], location: null }),
      ).rejects.toThrow('Failed to derive profile facets');
    });

    it('still succeeds when the model omits the structured location parts', async () => {
      groqCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                personalInfo: {
                  fullName: 'Omar Hassan',
                  email: null,
                  phone: null,
                  location: 'Remote',
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
                summary: 'Generalist',
              }),
            },
          },
        ],
      });

      const result = await service.parseCV('cv text', 'cv.pdf');

      expect(result.personalInfo.fullName).toBe('Omar Hassan');
      expect(result.personalInfo.country).toBeUndefined();
      expect(result.personalInfo.region).toBeUndefined();
      expect(result.personalInfo.city).toBeUndefined();
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
            country: null,
            region: null,
            city: null,
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
          country: null,
          region: null,
          city: null,
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
          country: null,
          region: null,
          city: null,
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
