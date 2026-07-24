import { describe, it, expect } from 'vitest';
import { buildCSP } from '../csp';

describe('buildCSP', () => {
  it('includes the loopback and GitHub connect sources', () => {
    const csp = buildCSP();
    expect(csp).toContain("'self'");
    expect(csp).toContain('http://127.0.0.1:*');
    expect(csp).toContain('wss://127.0.0.1:*');
    expect(csp).toContain('https://api.github.com');
  });

  it('always upgrades insecure requests', () => {
    expect(buildCSP()).toContain('upgrade-insecure-requests');
  });

  it('includes the core directives', () => {
    const csp = buildCSP();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('connect-src');
    expect(csp).toContain("object-src 'none'");
  });
});
