import configuration from './configuration';

describe('configuration - frontend URL parsing', () => {
  const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

  afterEach(() => {
    if (ORIGINAL_FRONTEND_URL === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
    }
  });

  it('uses the first origin as the redirect base when FRONTEND_URL is a comma list', () => {
    process.env.FRONTEND_URL = 'http://localhost:3001,http://localhost:3002';

    const config = configuration();

    // Regression: `frontend.url` must be a single valid URL, never the raw
    // comma-separated list (which produced ERR_INVALID_REDIRECT on OAuth login).
    expect(config.frontend.url).toBe('http://localhost:3001');
    expect(config.frontend.url).not.toContain(',');
  });

  it('exposes every trimmed origin for CORS', () => {
    process.env.FRONTEND_URL =
      'http://localhost:3001, http://localhost:3002 ,https://app.recdesk.io';

    const config = configuration();

    expect(config.frontend.origins).toEqual([
      'http://localhost:3001',
      'http://localhost:3002',
      'https://app.recdesk.io',
    ]);
  });

  it('handles a single origin', () => {
    process.env.FRONTEND_URL = 'https://app.recdesk.io';

    const config = configuration();

    expect(config.frontend.url).toBe('https://app.recdesk.io');
    expect(config.frontend.origins).toEqual(['https://app.recdesk.io']);
  });

  it('falls back to localhost:3001 when FRONTEND_URL is unset', () => {
    delete process.env.FRONTEND_URL;

    const config = configuration();

    expect(config.frontend.url).toBe('http://localhost:3001');
    expect(config.frontend.origins).toEqual(['http://localhost:3001']);
  });
});
