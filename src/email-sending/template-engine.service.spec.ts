import { TemplateEngineService } from './template-engine.service';

describe('TemplateEngineService interview tokens', () => {
  let service: TemplateEngineService;

  beforeEach(() => {
    service = new TemplateEngineService();
  });

  const context = {
    candidate: { fullName: 'Jane Doe', email: 'jane@example.com' },
    job: { title: 'Backend Engineer' },
    company: { name: 'Acme' },
    sender: { firstName: 'Sam', lastName: 'Recruiter' },
    interview: {
      bookingLink: 'https://app.recdesk.io/book/abc123',
      date: 'Monday, 10 July 2026',
      time: '11:00',
    },
  };

  it('renders booking_link, interview_date and interview_time tokens', () => {
    const template =
      'Book here: {{booking_link}} on {{interview_date}} at {{interview_time}}';
    const result = service.render(template, context);
    expect(result).toBe(
      'Book here: https://app.recdesk.io/book/abc123 on Monday, 10 July 2026 at 11:00',
    );
  });

  it('renders interview tokens as empty strings when no interview context', () => {
    const template = 'Link: {{booking_link}}|{{interview_date}}|{{interview_time}}';
    const result = service.render(template, {
      candidate: { fullName: 'Jane Doe' },
      company: { name: 'Acme' },
      sender: { firstName: 'Sam', lastName: 'Recruiter' },
    });
    expect(result).toBe('Link: ||');
  });

  it('treats the new interview tokens as supported', () => {
    const template =
      'Hi {{candidate_first_name}}, {{booking_link}} {{interview_date}} {{interview_time}}';
    const { valid, unsupportedTokens } = service.validateTokens(template);
    expect(valid).toBe(true);
    expect(unsupportedTokens).toEqual([]);
  });

  it('still flags genuinely unsupported tokens', () => {
    const { valid, unsupportedTokens } = service.validateTokens(
      'Hello {{unknown_token}} {{booking_link}}',
    );
    expect(valid).toBe(false);
    expect(unsupportedTokens).toEqual(['{{unknown_token}}']);
  });
});
