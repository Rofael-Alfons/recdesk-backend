import { ConfigService } from '@nestjs/config';
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
export declare class AiService {
    private configService;
    private openai;
    private groq;
    private provider;
    private model;
    constructor(configService: ConfigService);
    private chatCompletion;
    classifyEmail(subject: string, body: string, senderEmail: string, senderName: string | null): Promise<EmailClassificationResult>;
    parseCV(cvText: string, fileName: string | null): Promise<ParsedCVData>;
    scoreCandidate(parsedCV: ParsedCVData, jobRequirements: {
        title: string;
        requiredSkills: string[];
        preferredSkills: string[];
        experienceLevel: string;
        requirements: Record<string, any>;
    }): Promise<CandidateScoreResult>;
    generateCandidateSummary(parsedCV: ParsedCVData): Promise<string>;
    getProvider(): AiProvider;
    getModel(): string;
}
export {};
