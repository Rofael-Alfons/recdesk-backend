"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const groq_sdk_1 = __importDefault(require("groq-sdk"));
let AiService = class AiService {
    configService;
    openai = null;
    groq = null;
    provider;
    model;
    constructor(configService) {
        this.configService = configService;
        this.provider = this.configService.get('ai.provider', 'groq');
        if (this.provider === 'groq') {
            const groqApiKey = this.configService.get('groq.apiKey');
            if (!groqApiKey) {
                console.warn('Groq API key not configured - AI features will be disabled');
            }
            this.groq = new groq_sdk_1.default({ apiKey: groqApiKey || 'dummy-key' });
            this.model = this.configService.get('groq.model', 'llama-3.3-70b-versatile');
            console.log(`AI Service initialized with Groq provider (model: ${this.model})`);
        }
        else {
            const openaiApiKey = this.configService.get('openai.apiKey');
            if (!openaiApiKey) {
                console.warn('OpenAI API key not configured - AI features will be disabled');
            }
            this.openai = new openai_1.default({ apiKey: openaiApiKey || 'dummy-key' });
            this.model = 'gpt-4-turbo-preview';
            console.log(`AI Service initialized with OpenAI provider (model: ${this.model})`);
        }
    }
    async chatCompletion(prompt, options = {}) {
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
            }
            else if (this.openai) {
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
            }
            else {
                throw new Error('No AI provider configured');
            }
        }
        catch (error) {
            console.error(`AI completion error (${this.provider}):`, error);
            throw error;
        }
    }
    async classifyEmail(subject, body, senderEmail, senderName) {
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
            return JSON.parse(content);
        }
        catch (error) {
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
    async parseCV(cvText, fileName) {
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
  "summary": string (REQUIRED - a brief 2-3 sentence professional summary highlighting the candidate's key strengths, experience level, and main skills. Always provide this field.)
}

Be thorough in extracting skills - include technical skills, tools, frameworks, and soft skills.
For experience, list most recent first. Mark "current": true for current positions.
The summary field is REQUIRED - always generate a professional summary even if the CV content is minimal.
Only respond with valid JSON, no additional text.`;
        try {
            const content = await this.chatCompletion(prompt, {
                temperature: 0.1,
                jsonMode: true,
            });
            return JSON.parse(content);
        }
        catch (error) {
            console.error('CV parsing error:', error);
            throw new common_1.InternalServerErrorException('Failed to parse CV');
        }
    }
    async scoreCandidate(parsedCV, jobRequirements) {
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
            return JSON.parse(content);
        }
        catch (error) {
            console.error('Candidate scoring error:', error);
            throw new common_1.InternalServerErrorException('Failed to score candidate');
        }
    }
    async generateCandidateSummary(parsedCV) {
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
        }
        catch (error) {
            console.error('Summary generation error:', error);
            return 'Summary not available';
        }
    }
    getProvider() {
        return this.provider;
    }
    getModel() {
        return this.model;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiService);
//# sourceMappingURL=ai.service.js.map