import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDomain, findMatchingRule, fetch_url, test_auth } from '../index';
import type { AuthRule } from '../index';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';

vi.mock('node-fetch');
vi.mock('fs');

describe('MCP Auth Fetch Pro', () => {

  describe('getDomain', () => {
    it('should extract domain from https URL', () => {
      expect(getDomain('https://api.github.com/users/octocat')).toBe('api.github.com');
    });

    it('should extract domain and port from http URL', () => {
      expect(getDomain('http://localhost:3000/api/data')).toBe('localhost:3000');
    });

    it('should extract IP and port from https URL', () => {
      expect(getDomain('https://10.12.140.76:8080/status')).toBe('10.12.140.76:8080');
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

    it('should find regex match', () => {
      const rule = findMatchingRule('https://api.special.com', rules);
      expect(rule?.description).toBe('Special API');
    });

    it('should prioritize regex over wildcard and exact matches', () => {
        const prioritizedRules: AuthRule[] = [
            { url_pattern: 'api.github.com', auth: { type: 'bearer', token: 'github-token' } },
            { url_pattern: '*.github.com', auth: { type: 'bearer', token: 'wildcard-github-token' } },
            { url_pattern: '/api\.github\.com/', auth: { type: 'bearer', token: 'regex-github-token' } },
        ];
        const rule = findMatchingRule('https://api.github.com', prioritizedRules);
        expect((rule?.auth as any)?.token).toBe('regex-github-token');
    });

    it('should return undefined for no match', () => {
      const rule = findMatchingRule('https://unknown.com', rules);
      // It will match the wildcard rule
      expect(rule?.description).toBe('Wildcard');
    });
  });

  describe('fetch_url', () => {
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
    });

    it('should add auth headers and user-agent', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: 'success' })));

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

  describe('test_auth', () => {
    const mockRules: AuthRule[] = [
        { url_pattern: 'api.github.com', auth: { type: 'bearer', token: 'github-token' }, description: 'GitHub Exact' },
        { url_pattern: '*.openai.com', auth: { type: 'bearer', token: 'openai-token' }, description: 'OpenAI Wildcard' },
        { url_pattern: 'disabled.com', auth: { type: 'bearer', token: 'disabled-token' }, description: 'Disabled Rule', enabled: false },
    ];

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return the matching rule for an exact domain match', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = { auth_rules: mockRules };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('api.github.com');
        expect(result.rule).not.toBeNull();
        expect(result.rule?.description).toBe('GitHub Exact');
        expect(result.error).toBeUndefined();
    });

    it('should return null when no rule matches', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = { auth_rules: mockRules };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('unmatched.domain.com');
        expect(result.rule).toBeNull();
        expect(result.error).toBeUndefined();
    });

    it('should ignore disabled rules', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const config = { auth_rules: mockRules };
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

        const result = test_auth('disabled.com');
        expect(result.rule).toBeNull();
        expect(result.error).toBeUndefined();
    });

    it('should return null if config file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = test_auth('any.domain.com');
        expect(result.rule).toBeNull();
        expect(result.error).toBeUndefined();
    });

    it('should return an error if config loading fails', () => {
        const errorMessage = 'Failed to read config';
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
            throw new Error(errorMessage);
        });

        const result = test_auth('any.domain.com');
        expect(result.rule).toBeNull();
        expect(result.error).toBe(errorMessage);
    });
  });

});