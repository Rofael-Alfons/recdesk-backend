/**
 * Email Pre-filter Rules Configuration
 *
 * These rules are used to quickly classify emails before calling AI,
 * reducing API costs by 50-80%.
 */

// Patterns that indicate the email is NOT a job application
export const SKIP_PATTERNS = {
  // Auto-reply indicators in subject
  autoReplySubjectPatterns: [
    /out of office/i,
    /automatic reply/i,
    /auto-reply/i,
    /auto reply/i,
    /delivery status/i,
    /delivery notification/i,
    /undeliverable/i,
    /delivery failed/i,
    /ooo:/i,
    /\[auto\]/i,
    /vacation reply/i,
    /away from office/i,
  ],

  // No-reply sender patterns
  noReplySenderPatterns: [
    /^noreply@/i,
    /^no-reply@/i,
    /^no_reply@/i,
    /^donotreply@/i,
    /^do-not-reply@/i,
    /^mailer-daemon@/i,
    /^postmaster@/i,
    /^notifications@/i,
    /^alerts@/i,
    /^newsletter@/i,
    /^marketing@/i,
    /^promo@/i,
    /^info@.*\.newsletter\./i,
  ],

  // Newsletter/marketing indicators in body
  newsletterBodyPatterns: [
    /unsubscribe/i,
    /click here to unsubscribe/i,
    /manage your preferences/i,
    /update your preferences/i,
    /email preferences/i,
    /you are receiving this email because/i,
    /you received this email because/i,
    /this is an automated message/i,
    /this is an automated email/i,
    /do not reply to this email/i,
    /this email was sent by/i,
  ],

  // System/automated email indicators
  systemEmailPatterns: [
    /your password has been/i,
    /password reset/i,
    /verify your email/i,
    /confirm your email/i,
    /login attempt/i,
    /security alert/i,
    /invoice #/i,
    /order confirmation/i,
    /shipping notification/i,
    /tracking number/i,
  ],
};

// Patterns that indicate the email IS a job application (high confidence)
export const JOB_APPLICATION_PATTERNS = {
  // Strong indicators in subject
  subjectPatterns: [
    /application for/i,
    /applying for/i,
    /job application/i,
    /application:/i,
    /resume for/i,
    /cv for/i,
    /interest in.*position/i,
    /regarding.*position/i,
    /application.*developer/i,
    /application.*engineer/i,
    /application.*manager/i,
    /application.*designer/i,
    /application.*analyst/i,
  ],

  // Strong indicators in body
  bodyPatterns: [
    /please find attached my (cv|resume|curriculum vitae)/i,
    /attached (is|you will find) my (cv|resume)/i,
    /i am (applying|interested) (for|in)/i,
    /i would like to apply/i,
    /i am writing to express my interest/i,
    /enclosed (is|please find) my (cv|resume)/i,
    /my (cv|resume) is attached/i,
    /application for the (position|role|job)/i,
    /i am submitting my application/i,
    /kindly find my (cv|resume) attached/i,
  ],

  // CV attachment indicators
  cvAttachmentPatterns: [/cv/i, /resume/i, /curriculum/i, /vitae/i],
};

// Supported CV file extensions
export const CV_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx'];

// MIME types for CV files
export const CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Common job title keywords for position detection
export const JOB_TITLE_KEYWORDS = [
  'developer',
  'engineer',
  'designer',
  'manager',
  'analyst',
  'consultant',
  'specialist',
  'coordinator',
  'assistant',
  'director',
  'lead',
  'senior',
  'junior',
  'intern',
  'trainee',
  'associate',
  'executive',
  'administrator',
  'accountant',
  'marketing',
  'sales',
  'hr',
  'human resources',
  'software',
  'frontend',
  'backend',
  'fullstack',
  'full-stack',
  'data',
  'product',
  'project',
  'qa',
  'quality',
  'devops',
  'mobile',
  'web',
  'ui',
  'ux',
];
