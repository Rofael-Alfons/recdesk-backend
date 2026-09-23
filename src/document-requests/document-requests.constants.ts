// Distinct from FileProcessingService's CV-only extension list (.pdf/.docx/.doc)
// — these are ID/certificate scans or photos, not text to extract.
export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// Personal-photo items: image only, no PDF — enforced instead of the two
// lists above when a checklist item is flagged isPersonalPhoto.
export const ALLOWED_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'];

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Deliberately shorter than the 3600s default used elsewhere (e.g. CV
// downloads) — this is a tighter default for sensitive PII documents.
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 300;

// Longer-lived than the document-download TTL above: this backs a passively
// displayed candidate avatar (list/detail pages), not a one-off sensitive
// download link.
export const PHOTO_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
