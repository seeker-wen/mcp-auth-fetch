import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDomain, findMatchingRule, test_auth } from '../index';
import type { AuthRule } from '../index';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';

vi.mock('node-fetch', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    __esModule: true,
    default: vi.fn(),
    
  };
});
vi.mock('fs');

describe('MCP Auth Fetch Pro', () => {

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('getDomain', () => {
    it('should extract domain from https URL', () => {
      expect(getDomain('https://api.github.com/users/octocat')).toBe('api.github.com');
    });

    it('should extract domain and port from http URL', () => {
      expect(getDomain('http://localhost:3000/api/data')).toBe('localhost:3000');
    });

    it('should return empty string for invalid URL', () => {
      expect(getDomain('not a url')).toBe('');
    });
  });

  describe('findMatchingRule', () => {
    const rules: AuthRule[] = [
      { url_pattern: 'api.github.com', auth: { type: 'bearer', token: 'github-token' }, description: 'GitHub' },
      { url_pattern: '*.openai.com', auth: { type: 'bearer', token: 'openai-token' }, description: 'OpenAI' },
      { url_pattern: '/^api\.special\.com$/', auth: { type: 'bearer', token: 'special-token' }, description: 'Special API' },
      { url_pattern: 'api.example.com', auth: { type: 'api_key', key: 'X-API-Key', value: 'example-key', in: 'header' }, description: 'Example API' },
      { url_pattern: '*', auth: { type: 'bearer', token: 'wildcard-token' }, description: 'Wildcard' },
    ];

    it('should find exact match', () => {
      const rule = findMatchingRule('https://api.github.com/foo', rules);
      expect(rule?.description).toBe('GitHub');
    });

    it('should find wildcard match', () => {
      const rule = findMatchingRule('https://api.openai.com/v1/chat', rules);
      expect(rule?.description).toBe('OpenAI');
    });
  });

  describe('fetch_url with basic auth', () => {
    beforeEach(() => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = {
            auth_rules: [
                { url_pattern: 'api.github.com', auth: { type: 'bearer', token: 'test-token' }, enabled: true }
            ],
            global_settings: {
                user_agent: 'Test-Agent/1.0'
            }
        };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: 'success' })));
    });

    it('should add auth headers and user-agent', async () => {
        const { fetch_url } = await import('../index');
        await fetch_url('https://api.github.com/test');

        expect(fetch).toHaveBeenCalledWith(
            'https://api.github.com/test',
            expect.objectContaining({
                headers: {
                    'Authorization': 'Bearer test-token',
                    'User-Agent': 'Test-Agent/1.0'
                }
            })
        );
    });
  });

  describe('fetch_url with OAuth2', () => {
    const oauthRule: AuthRule = {
      url_pattern: 'oauth.example.com',
      auth: {
        type: 'oauth2',
        token_url: 'https://oauth.example.com/token',
        client_id: 'test-client',
        client_secret: 'test-secret',
      },
    };

    const refreshTokenRule: AuthRule = {
        url_pattern: 'refreshtoken.example.com',
        auth: {
          type: 'oauth2',
          token_url: 'https://refreshtoken.example.com/token',
          client_id: 'refresh-client',
          client_secret: 'refresh-secret',
          refresh_token: 'my-refresh-token',
        },
      };

    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should perform client credentials flow and cache the token', async () => {
      const config = { auth_rules: [oauthRule] };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
      const { fetch_url } = await import('../index');

      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new-access-token', expires_in: 3600 }), { status: 200 }))
        .mockResolvedValueOnce(new Response('API response', { status: 200 }));

      await fetch_url('https://oauth.example.com/data');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledWith('https://oauth.example.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      });
      expect(fetch).toHaveBeenCalledWith('https://oauth.example.com/data', expect.objectContaining({
        headers: { 'Authorization': 'Bearer new-access-token' },
      }));

      vi.mocked(fetch).mockClear().mockResolvedValueOnce(new Response('API response 2', { status: 200 }));
      await fetch_url('https://oauth.example.com/data2');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalledWith('https://oauth.example.com/token', expect.anything());
      expect(fetch).toHaveBeenCalledWith('https://oauth.example.com/data2', expect.objectContaining({
        headers: { 'Authorization': 'Bearer new-access-token' },
      }));
    });

    it('should perform refresh token flow', async () => {
        const config = { auth_rules: [refreshTokenRule] };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
        const { fetch_url } = await import('../index');

        vi.mocked(fetch)
          .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'refreshed-token', expires_in: 3600 }), { status: 200 }))
          .mockResolvedValueOnce(new Response('API response', { status: 200 }));

        await fetch_url('https://refreshtoken.example.com/data');

        expect(fetch).toHaveBeenCalledTimes(2);
        const tokenCall = vi.mocked(fetch).mock.calls.find(call => call[0] === 'https://refreshtoken.example.com/token');
        expect(tokenCall).toBeDefined();
        const body = tokenCall?.[1]?.body as URLSearchParams;
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('my-refresh-token');

        expect(fetch).toHaveBeenCalledWith('https://refreshtoken.example.com/data', expect.objectContaining({
            headers: { 'Authorization': 'Bearer refreshed-token' },
        }));
    });

    it('should return error message if token fetch fails', async () => {
        const config = { auth_rules: [oauthRule] };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
        const { fetch_url } = await import('../index');

        vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

        const result = await fetch_url('https://oauth.example.com/data');

        expect(result).toContain('Authentication failed: Failed to fetch OAuth2 token: 401 Unauthorized - Unauthorized');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('https://oauth.example.com/token', expect.anything());
    });
  });

  describe('test_auth', () => {
    const mockRules: AuthRule[] = [
        { url_pattern: 'api.github.com', auth: { type: 'bearer', token: 'github-token' }, description: 'GitHub Exact' },
        { url_pattern: '*.openai.com', auth: { type: 'bearer', token: 'openai-token' }, description: 'OpenAI Wildcard' },
        { url_pattern: 'api.example.com', auth: { type: 'api_key', key: 'X-API-Key', value: 'example-key', in: 'header' }, description: 'API Key' },
    ];

    it('should return the matching rule and mask sensitive data by default', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = { auth_rules: mockRules };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('https://api.github.com');
        expect(result.rule).not.toBeNull();
        expect(result.rule?.description).toBe('GitHub Exact');
        // @ts-ignore
        expect(result.rule?.auth.token).toBe('***MASKED***');
    });

    it('should return the unmasked rule when verbose_test_auth is true', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = {
            auth_rules: mockRules,
            global_settings: {
                verbose_test_auth: true
            }
        };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('https://api.github.com');
        expect(result.rule).not.toBeNull();
        expect(result.rule?.description).toBe('GitHub Exact');
        // @ts-ignore
        expect(result.rule?.auth.token).toBe('github-token');
    });

    it('should return the matching rule for a domain', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = { auth_rules: mockRules };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('https://api.openai.com');
        expect(result.rule).not.toBeNull();
        expect(result.rule?.description).toBe('OpenAI Wildcard');
    });
  });

});
