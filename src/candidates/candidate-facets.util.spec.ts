import { deriveCandidateFacets, normalizeFacetValue } from './candidate-facets.util';

const now = new Date('2026-09-29T12:00:00.000Z');

describe('normalizeFacetValue', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeFacetValue('  Node.JS   Backend ')).toBe('node.js backend');
  });

  it('caps the length at 100 characters', () => {
    expect(normalizeFacetValue('x'.repeat(150))).toHaveLength(100);
  });
});

describe('deriveCandidateFacets', () => {
  it('lowercases and dedupes skills, dropping blanks and non-strings', () => {
    const facets = deriveCandidateFacets(
      { skills: ['React', 'react ', ' REACT', '', 'Node.js', 42, null] },
      now,
    );
    expect(facets.skillsNormalized).toEqual(['react', 'node.js']);
  });

  it('extracts language names from objects or plain strings', () => {
    const facets = deriveCandidateFacets(
      {
        languages: [
          { language: 'Arabic', proficiency: 'Native' },
          { language: 'English' },
          'French',
          { proficiency: 'Basic' },
        ],
      },
      now,
    );
    expect(facets.languageNames).toEqual(['arabic', 'english', 'french']);
  });

  it('takes the current role when one is marked current', () => {
    const facets = deriveCandidateFacets(
      {
        experience: [
          { title: 'Intern', company: 'Old Co', current: false },
          { title: ' Senior  Engineer ', company: 'Vodafone', current: true },
        ],
      },
      now,
    );
    expect(facets.currentTitle).toBe('Senior Engineer');
    expect(facets.currentCompany).toBe('Vodafone');
  });

  it('falls back to the first listed role when none is current', () => {
    const facets = deriveCandidateFacets(
      {
        experience: [
          { title: 'Backend Developer', company: 'Instabug' },
          { title: 'Intern', company: 'Old Co' },
        ],
      },
      now,
    );
    expect(facets.currentTitle).toBe('Backend Developer');
    expect(facets.currentCompany).toBe('Instabug');
  });

  it('picks the most recent education entry by year', () => {
    const facets = deriveCandidateFacets(
      {
        education: [
          { institution: 'Cairo University', year: 2018 },
          { institution: 'AUC', year: 2021 },
          { institution: 'No Year School' },
        ],
      },
      now,
    );
    expect(facets.university).toBe('AUC');
  });

  it('uses the first education entry when no years are given', () => {
    const facets = deriveCandidateFacets(
      { education: [{ institution: 'Ain Shams University' }, { institution: 'Other' }] },
      now,
    );
    expect(facets.university).toBe('Ain Shams University');
  });

  it('clamps experience years to 0-60 and rounds to one decimal', () => {
    expect(deriveCandidateFacets({ totalExperienceYears: 3.456 }, now).totalExperienceYears).toBe(3.5);
    expect(deriveCandidateFacets({ totalExperienceYears: -2 }, now).totalExperienceYears).toBe(0);
    expect(deriveCandidateFacets({ totalExperienceYears: 99 }, now).totalExperienceYears).toBe(60);
    expect(deriveCandidateFacets({ totalExperienceYears: '4' }, now).totalExperienceYears).toBe(4);
  });

  it('turns unusable experience years into null', () => {
    expect(deriveCandidateFacets({ totalExperienceYears: 'lots' }, now).totalExperienceYears).toBeNull();
    expect(deriveCandidateFacets({ totalExperienceYears: null }, now).totalExperienceYears).toBeNull();
    expect(deriveCandidateFacets({}, now).totalExperienceYears).toBeNull();
  });

  it('validates the education level against the enum', () => {
    expect(deriveCandidateFacets({ highestEducationLevel: 'master' }, now).educationLevel).toBe('MASTER');
    expect(deriveCandidateFacets({ highestEducationLevel: 'PHD' }, now).educationLevel).toBeNull();
    expect(deriveCandidateFacets({ highestEducationLevel: 7 }, now).educationLevel).toBeNull();
  });

  it('tolerates malformed JSON shapes and always stamps facetsDerivedAt', () => {
    const facets = deriveCandidateFacets(
      { skills: 'React', experience: { title: 'x' }, education: null, languages: 5 },
      now,
    );
    expect(facets).toEqual({
      skillsNormalized: [],
      languageNames: [],
      currentTitle: null,
      currentCompany: null,
      university: null,
      totalExperienceYears: null,
      educationLevel: null,
      facetsDerivedAt: now,
    });
  });
});
