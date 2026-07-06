import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InterviewLocationType } from '@prisma/client';
import { InterviewEmailService } from './interview-email.service';
import { EmailSendingService } from '../email-sending/email-sending.service';

describe('InterviewEmailService', () => {
  let service: InterviewEmailService;
  let emailSending: {
    sendCustom: jest.Mock;
    sendWithCalendar: jest.Mock;
  };

  const baseContext = {
    interviewId: 'int-1',
    candidateName: 'Jane Doe',
    candidateEmail: 'jane@example.com',
    jobTitle: 'Backend Engineer',
    companyName: 'Acme',
    interviewerName: 'Sam Manager',
    interviewerEmail: 'sam@acme.com',
    recruiterName: 'Rec Ruiter',
    recruiterEmail: 'rec@acme.com',
    additionalAttendees: [],
    timezone: 'Africa/Cairo',
    durationMinutes: 45,
    locationType: InterviewLocationType.ONLINE,
    locationDetails: 'Google Meet',
    message: 'Looking forward to meeting you.',
  };

  beforeEach(async () => {
    emailSending = {
      sendCustom: jest.fn().mockResolvedValue({ success: true }),
      sendWithCalendar: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewEmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ses.fromEmail' ? 'noreply@recdesk.io' : undefined,
          },
        },
        { provide: EmailSendingService, useValue: emailSending },
      ],
    }).compile();

    service = module.get(InterviewEmailService);
  });

  describe('sendBookingInvite', () => {
    it('sends booking link to candidate', async () => {
      const result = await service.sendBookingInvite(
        baseContext,
        'http://localhost:3001/book/token',
      );

      expect(result.success).toBe(true);
      expect(emailSending.sendCustom).toHaveBeenCalledWith(
        baseContext.candidateEmail,
        expect.stringContaining('Backend Engineer'),
        expect.stringContaining('Choose your interview time'),
        expect.stringContaining('http://localhost:3001/book/token'),
      );
    });
  });

  describe('sendAvailabilityRequest', () => {
    it('returns error when interviewer email is missing', async () => {
      const result = await service.sendAvailabilityRequest(
        { ...baseContext, interviewerEmail: undefined },
        'http://localhost:3001/availability/token',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('interviewer email');
    });

    it('sends availability link to interviewer', async () => {
      const result = await service.sendAvailabilityRequest(
        baseContext,
        'http://localhost:3001/availability/token',
      );

      expect(result.success).toBe(true);
      expect(emailSending.sendCustom).toHaveBeenCalledWith(
        baseContext.interviewerEmail,
        expect.stringContaining('Jane Doe'),
        expect.any(String),
        expect.stringContaining('http://localhost:3001/availability/token'),
      );
    });
  });

  describe('sendAvailabilitySubmitted', () => {
    it('returns error when recruiter email is missing', async () => {
      const result = await service.sendAvailabilitySubmitted(
        { ...baseContext, recruiterEmail: undefined },
        'http://localhost:3001/candidates/c1',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('sendConfirmations', () => {
    it('sends calendar invites to candidate and interview team', async () => {
      const start = new Date('2026-07-10T10:00:00.000Z');
      const end = new Date('2026-07-10T10:45:00.000Z');

      await service.sendConfirmations(baseContext, start, end);

      expect(emailSending.sendWithCalendar).toHaveBeenCalledTimes(3);
      expect(emailSending.sendWithCalendar).toHaveBeenCalledWith(
        baseContext.candidateEmail,
        expect.stringContaining('Interview confirmed'),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ method: 'REQUEST' }),
      );
    });
  });
});
