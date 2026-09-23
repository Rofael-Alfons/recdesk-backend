import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsEmailService } from './documents-email.service';
import { EmailSendingService } from '../email-sending/email-sending.service';

describe('DocumentsEmailService', () => {
  let service: DocumentsEmailService;
  let emailSending: { sendCustom: jest.Mock };

  const baseContext = {
    candidateName: 'Jane Doe',
    candidateEmail: 'jane@example.com',
    jobTitle: 'Backend Engineer',
    companyName: 'Acme',
    recruiterName: 'Rec Ruiter',
    recruiterEmail: 'rec@acme.com',
    message: 'Please upload before Friday.',
  };

  beforeEach(async () => {
    emailSending = {
      sendCustom: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsEmailService,
        { provide: EmailSendingService, useValue: emailSending },
      ],
    }).compile();

    service = module.get(DocumentsEmailService);
  });

  describe('sendUploadLink', () => {
    it('sends the upload link to the candidate', async () => {
      const result = await service.sendUploadLink(
        baseContext,
        'http://localhost:3001/documents/token',
      );

      expect(result.success).toBe(true);
      expect(emailSending.sendCustom).toHaveBeenCalledWith(
        baseContext.candidateEmail,
        expect.stringContaining('Backend Engineer'),
        expect.stringContaining('http://localhost:3001/documents/token'),
        expect.stringContaining('http://localhost:3001/documents/token'),
      );
    });
  });

  describe('sendRecruiterNotification', () => {
    it('returns error when recruiter email is missing', async () => {
      const result = await service.sendRecruiterNotification(
        { ...baseContext, recruiterEmail: undefined },
        'complete',
        'http://localhost:3001/candidates/c1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('recruiter email');
    });

    it('sends status notification to the recruiter', async () => {
      const result = await service.sendRecruiterNotification(
        baseContext,
        'complete',
        'http://localhost:3001/candidates/c1',
      );

      expect(result.success).toBe(true);
      expect(emailSending.sendCustom).toHaveBeenCalledWith(
        baseContext.recruiterEmail,
        expect.stringContaining('complete'),
        expect.any(String),
        expect.stringContaining('http://localhost:3001/candidates/c1'),
      );
    });
  });
});
