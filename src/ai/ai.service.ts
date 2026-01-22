import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

export interface EmailClassificationResult {
  isJobApplication: boolean;
  confidence: number;
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  detectedPosition: string | null;
  reasoning: string;
}

export interface ParsedCVData {
  personalInfo: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
  };
  education: Array<{
    degree: string;
    institution: string;
    year: number | null;
    gpa: number | null;
    field: string | null;
  }>;
  experience: Array<{
    title: string;
    company: string;
    duration: string;
    current: boolean;
    description: string | null;
  }>;
  skills: string[];
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuer: string | null;
    year: number | null;
  }>;
  languages: Array<{
    language: string;
    proficiency: string | null;
  }>;
  summary: string | null;
}

export interface CandidateScoreResult {
  overallScore: number;
  skillsMatchScore: number;
  experienceScore: number;
  educationScore: number;
  growthScore: number;
  bonusScore: number;
  recommendation: string;
  scoreExplanation: {
    skillsMatch: string;
    experience: string;
    education: string;
    growth: string;
    bonus: string;
  };
}

type AiProvider = 'openai' | 'groq';

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;
  private groq: Groq | null = null;
  private provider: AiProvider;
  private model: string;

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get<string>('ai.provider', 'groq') as AiProvider;

    if (this.provider === 'groq') {
      const groqApiKey = this.configService.get<string>('groq.apiKey');
      if (!groqApiKey) {
        console.warn('Groq API key not configured - AI features will be disabled');
      }
      this.groq = new Groq({ apiKey: groqApiKey || 'dummy-key' });
      this.model = this.configService.get<string>('groq.model', 'llama-3.3-70b-versatile');
      console.log(`AI Service initialized with Groq provider (model: ${this.model})`);
    } else {
      const openaiApiKey = this.configService.get<string>('openai.apiKey');
      if (!openaiApiKey) {
        console.warn('OpenAI API key not configured - AI features will be disabled');
      }
      this.openai = new OpenAI({ apiKey: openaiApiKey || 'dummy-key' });
      this.model = 'gpt-4-turbo-preview';
      console.log(`AI Service initialized with OpenAI provider (model: ${this.model})`);
    }
  }

  /**
   * Unified chat completion method that works with both OpenAI and Groq
   */
  private async chatCompletion(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    } = {},
  ): Promise<string> {
    const { temperature = 0.1, maxTokens, jsonMode = false } = options;

    try {
      if (this.provider === 'groq' && this.groq) {
        const response = await this.groq.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          response_format: jsonMode ? { type: 'json_object' } : undefined,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from Groq AI');
        }
        return content;
      } else if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          response_format: jsonMode ? { type: 'json_object' } : undefined,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from OpenAI');
        }
        return content;
      } else {
        throw new Error('No AI provider configured');
      }
    } catch (error) {
      console.error(`AI completion error (${this.provider}):`, error);
      throw error;
    }
  }

  async classifyEmail(
    subject: string,
    body: string,
    senderEmail: string,
    senderName: string | null,
  ): Promise<EmailClassificationResult> {
    const prompt = `Analyze this email and determine if it's a job application.

Email Details:
- From: ${senderName || 'Unknown'} <${senderEmail}>
- Subject: ${subject}
- Body:
${body.slice(0, 3000)}

Respond with a JSON object containing:
{
  "isJobApplication": boolean,
  "confidence": number (0-100),
  "candidateName": string or null,
  "candidateEmail": string or null,
  "candidatePhone": string or null (extract if mentioned in body),
  "detectedPosition": string or null (the job they're applying for),
  "reasoning": string (brief explanation)
}

Consider it a job application if:
- It contains a CV/resume attachment mention
- It expresses interest in a job position
- It's a response to a job posting
- It contains phrases like "applying for", "interested in the position", etc.

Only respond with valid JSON, no additional text.`;

    try {
      const content = await this.chatCompletion(prompt, {
        temperature: 0.1,
        jsonMode: true,
      });

      return JSON.parse(content) as EmailClassificationResult;
    } catch (error) {
      console.error('Email classification error:', error);
      return {
        isJobApplication: false,
        confidence: 0,
        candidateName: null,
        candidateEmail: senderEmail,
        candidatePhone: null,
        detectedPosition: null,
        reasoning: 'Failed to classify email',
      };
    }
  }

  async parseCV(cvText: string, fileName: string | null): Promise<ParsedCVData> {
    const prompt = `Parse this CV/resume and extract structured information.

CV Text:
${cvText.slice(0, 8000)}

${fileName ? `Original filename: ${fileName}` : ''}

Extract and return a JSON object with this structure:
{
  "personalInfo": {
    "fullName": string or null,
    "email": string or null,
    "phone": string or null,
    "location": string or null,
    "linkedinUrl": string or null,
    "githubUrl": string or null,
    "portfolioUrl": string or null
  },
  "education": [
    {
      "degree": string,
      "institution": string,
      "year": number or null,
      "gpa": number or null,
      "field": string or null
    }
  ],
  "experience": [
    {
      "title": string,
      "company": string,
      "duration": string,
      "current": boolean,
      "description": string or null
    }
  ],
  "skills": [string],
  "projects": [
    {
      "name": string,
      "description": string,
      "technologies": [string],
      "url": string or null
    }
  ],
  "certifications": [
    {
      "name": string,
      "issuer": string or null,
      "year": number or null
    }
  ],
  "languages": [
    {
      "language": string,
      "proficiency": string or null
    }
  ],
  "summary": string or null (a brief AI-generated summary of the candidate)
}

Be thorough in extracting skills - include technical skills, tools, frameworks, and soft skills.
For experience, list most recent first. Mark "current": true for current positions.
Only respond with valid JSON, no additional text.`;

    try {
      const content = await this.chatCompletion(prompt, {
        temperature: 0.1,
        jsonMode: true,
      });

      return JSON.parse(content) as ParsedCVData;
    } catch (error) {
      console.error('CV parsing error:', error);
      throw new InternalServerErrorException('Failed to parse CV');
    }
  }

  async scoreCandidate(
    parsedCV: ParsedCVData,
    jobRequirements: {
      title: string;
      requiredSkills: string[];
      preferredSkills: string[];
      experienceLevel: string;
      requirements: Record<string, any>;
    },
  ): Promise<CandidateScoreResult> {
    const prompt = `Score this candidate against the job requirements.

CANDIDATE PROFILE:
${JSON.stringify(parsedCV, null, 2)}

JOB REQUIREMENTS:
- Title: ${jobRequirements.title}
- Required Skills: ${jobRequirements.requiredSkills.join(', ')}
- Preferred Skills: ${jobRequirements.preferredSkills.join(', ')}
- Experience Level: ${jobRequirements.experienceLevel}
- Additional Requirements: ${JSON.stringify(jobRequirements.requirements)}

SCORING CRITERIA:
1. Skills Match (40% weight): How well do the candidate's skills match required and preferred skills?
2. Experience (30% weight): Does their experience level and relevance match the job?
3. Education (15% weight): Is their educational background appropriate?
4. Growth Indicators (10% weight): Career progression, learning new skills, certifications
5. Bonus Signals (5% weight): Portfolio, GitHub, certifications, unique qualifications

Return a JSON object:
{
  "overallScore": number (0-100, weighted average),
  "skillsMatchScore": number (0-100),
  "experienceScore": number (0-100),
  "educationScore": number (0-100),
  "growthScore": number (0-100),
  "bonusScore": number (0-100),
  "recommendation": string (one of: "Highly Recommended", "Recommended", "Consider", "Not Recommended"),
  "scoreExplanation": {
    "skillsMatch": string (explanation),
    "experience": string (explanation),
    "education": string (explanation),
    "growth": string (explanation),
    "bonus": string (explanation)
  }
}

Be fair but thorough. Consider semantic skill matching (e.g., "React" matches "React.js").
For fresh graduates, focus more on education, projects, and potential.
Only respond with valid JSON, no additional text.`;

    try {
      const content = await this.chatCompletion(prompt, {
        temperature: 0.2,
        jsonMode: true,
      });

      return JSON.parse(content) as CandidateScoreResult;
    } catch (error) {
      console.error('Candidate scoring error:', error);
      throw new InternalServerErrorException('Failed to score candidate');
    }
  }

  async generateCandidateSummary(parsedCV: ParsedCVData): Promise<string> {
    const prompt = `Generate a brief, professional summary (2-3 sentences) for this candidate based on their CV data:

${JSON.stringify(parsedCV, null, 2)}

The summary should highlight their key strengths, experience level, and main skills.
Respond with just the summary text, no JSON.`;

    try {
      const content = await this.chatCompletion(prompt, {
        temperature: 0.3,
        maxTokens: 200,
      });

      return content || 'Summary not available';
    } catch (error) {
      console.error('Summary generation error:', error);
      return 'Summary not available';
    }
  }

  /**
   * Get the current AI provider being used
   */
  getProvider(): AiProvider {
    return this.provider;
  }

  /**
   * Get the current model being used
   */
  getModel(): string {
    return this.model;
  }
}
