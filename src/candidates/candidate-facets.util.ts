import { EducationLevel } from '@prisma/client';

export interface CandidateFacets {
  skillsNormalized: string[];
  languageNames: string[];
  currentTitle: string | null;
  currentCompany: string | null;
  university: string | null;
  totalExperienceYears: number | null;
  educationLevel: EducationLevel | null;
  facetsDerivedAt: Date;
}

/**
 * Parsed CV data as stored on the candidate. Every field is `unknown` because
 * it is AI-written JSON: shapes are expected but never guaranteed.
 */
export interface FacetSource {
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  languages?: unknown;
  totalExperienceYears?: unknown;
  highestEducationLevel?: unknown;
}

const MAX_EXPERIENCE_YEARS = 60;
const MAX_FACET_LENGTH = 100;
const MAX_SKILLS = 200;

const EDUCATION_LEVELS = Object.values(EducationLevel) as string[];

/**
 * The single normalization used both when storing facet values and when
 * matching filter input against them, so the two can never drift apart.
 */
export function normalizeFacetValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_FACET_LENGTH);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  );
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 200) : null;
}

function normalizedUnique(values: unknown[], limit: number): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeFacetValue(value);
    if (normalized) seen.add(normalized);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

function toExperienceYears(value: unknown): number | null {
  const years = typeof value === 'string' ? Number(value) : value;
  if (typeof years !== 'number' || !Number.isFinite(years)) return null;
  const clamped = Math.min(Math.max(years, 0), MAX_EXPERIENCE_YEARS);
  return Math.round(clamped * 10) / 10;
}

function toEducationLevel(value: unknown): EducationLevel | null {
  if (typeof value !== 'string') return null;
  const level = value.trim().toUpperCase();
  return EDUCATION_LEVELS.includes(level) ? (level as EducationLevel) : null;
}

export function deriveCandidateFacets(
  source: FacetSource,
  now: Date = new Date(),
): CandidateFacets {
  const skills = Array.isArray(source.skills) ? source.skills : [];

  const languages = Array.isArray(source.languages)
    ? source.languages.map((entry) =>
        typeof entry === 'string'
          ? entry
          : (entry as Record<string, unknown> | null)?.language,
      )
    : [];

  const experience = asRecordArray(source.experience);
  const currentRole =
    experience.find((role) => role.current === true) ?? experience[0];

  // Most recent entry by year; entries without a year keep list order.
  const education = asRecordArray(source.education);
  const latestEducation = education.reduce<Record<string, unknown> | undefined>(
    (latest, entry) => {
      if (!latest) return entry;
      const year = typeof entry.year === 'number' ? entry.year : -Infinity;
      const latestYear = typeof latest.year === 'number' ? latest.year : -Infinity;
      return year > latestYear ? entry : latest;
    },
    undefined,
  );

  return {
    skillsNormalized: normalizedUnique(skills, MAX_SKILLS),
    languageNames: normalizedUnique(languages, MAX_SKILLS),
    currentTitle: cleanText(currentRole?.title),
    currentCompany: cleanText(currentRole?.company),
    university: cleanText(latestEducation?.institution),
    totalExperienceYears: toExperienceYears(source.totalExperienceYears),
    educationLevel: toEducationLevel(source.highestEducationLevel),
    facetsDerivedAt: now,
  };
}
