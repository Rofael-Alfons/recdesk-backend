import { Injectable } from '@nestjs/common';

export interface PersonalizationContext {
  candidate: {
    fullName: string;
    email?: string | null;
  };
  job?: {
    title: string;
  } | null;
  company: {
    name: string;
  };
  sender: {
    firstName: string;
    lastName: string;
  };
}

@Injectable()
export class TemplateEngineService {
  /**
   * Replace personalization tokens in template text
   */
  render(template: string, context: PersonalizationContext): string {
    const tokens: Record<string, string> = {
      '{{candidate_name}}': context.candidate.fullName || 'Candidate',
      '{{candidate_first_name}}': this.getFirstName(context.candidate.fullName),
      '{{candidate_email}}': context.candidate.email || '',
      '{{job_title}}': context.job?.title || 'the position',
      '{{company_name}}': context.company.name,
      '{{sender_name}}': `${context.sender.firstName} ${context.sender.lastName}`,
    };

    let result = template;
    for (const [token, value] of Object.entries(tokens)) {
      result = result.split(token).join(value);
    }

    return result;
  }

  /**
   * Get first name from full name
   */
  private getFirstName(fullName: string): string {
    if (!fullName) return 'Candidate';
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || 'Candidate';
  }

  /**
   * Create sample context for previewing templates
   */
  createSampleContext(): PersonalizationContext {
    return {
      candidate: {
        fullName: 'John Smith',
        email: 'john.smith@example.com',
      },
      job: {
        title: 'Software Engineer',
      },
      company: {
        name: 'Your Company',
      },
      sender: {
        firstName: 'Jane',
        lastName: 'Doe',
      },
    };
  }

  /**
   * Extract all tokens from a template
   */
  extractTokens(template: string): string[] {
    const tokenRegex = /\{\{[^}]+\}\}/g;
    const matches = template.match(tokenRegex);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Validate that all tokens in a template are supported
   */
  validateTokens(template: string): { valid: boolean; unsupportedTokens: string[] } {
    const supportedTokens = [
      '{{candidate_name}}',
      '{{candidate_first_name}}',
      '{{candidate_email}}',
      '{{job_title}}',
      '{{company_name}}',
      '{{sender_name}}',
    ];

    const usedTokens = this.extractTokens(template);
    const unsupportedTokens = usedTokens.filter(
      (token) => !supportedTokens.includes(token),
    );

    return {
      valid: unsupportedTokens.length === 0,
      unsupportedTokens,
    };
  }
}
