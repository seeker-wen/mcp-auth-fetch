#!/usr/bin/env node

import fetch from "node-fetch";
import micromatch from "micromatch";
import path from "path";
import fs from "fs";
import os from "os";
import { z } from "zod";
import { FastMCP } from "fastmcp";
import packageJson from "./package.json";

// #region Zod Schema Definitions

const AuthBearerSchema = z.object({
  type: z.literal("bearer"),
  token: z.string(),
});
const AuthApiKeySchema = z.object({
  type: z.literal("api_key"),
  key: z.string(),
  value: z.string(),
  in: z.enum(["header", "query"]),
});
const AuthBasicSchema = z.object({
  type: z.literal("basic"),
  username: z.string(),
  password: z.string(),
});
const AuthCookieSchema = z.object({
  type: z.literal("cookie"),
  cookies: z.record(z.string()),
});
const AuthFunctionSchema = z.object({
  type: z.literal("function"),
  function: z
    .function()
    .returns(z.union([z.record(z.string()), z.object({ token: z.string() })])),
});
const AuthOAuth2Schema = z.object({
  type: z.literal("oauth2"),
  token_url: z.string().url(),
  client_id: z.string(),
  client_secret: z.string(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

const AuthSchema = z.union([
  AuthBearerSchema,
  AuthApiKeySchema,
  AuthBasicSchema,
  AuthCookieSchema,
  AuthFunctionSchema,
  AuthOAuth2Schema,
]);

export const AuthRuleSchema = z.object({
  url_pattern: z.string(),
  auth: AuthSchema,
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

const GlobalSettingsSchema = z.object({
  default_timeout: z.number().optional(),
  max_retries: z.number().optional(),
  user_agent: z.string().optional(),
  verbose_test_auth: z.boolean().optional(),
});

const ConfigSchema = z.object({
  auth_rules: z.array(AuthRuleSchema),
  global_settings: GlobalSettingsSchema.optional(),
});

// #endregion

// #region Type Definitions (derived from Zod)

export type AuthRule = z.infer<typeof AuthRuleSchema>;
type AuthOAuth2 = z.infer<typeof AuthOAuth2Schema>;
type Config = z.infer<typeof ConfigSchema>;

// #endregion

// #region OAuth2 Token Cache

const tokenCache: Record<string, { accessToken: string; expiresAt: number }> =
  {};

async function getOAuth2Token(auth: AuthOAuth2): Promise<string> {
  const cacheKey = `${auth.token_url}|${auth.client_id}`;
  const cachedToken = tokenCache[cacheKey];

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams();
  params.append("client_id", auth.client_id);
  params.append("client_secret", auth.client_secret);
  if (auth.scope) {
    params.append("scope", auth.scope);
  }

  if (auth.refresh_token) {
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", auth.refresh_token);
  } else {
    params.append("grant_type", "client_credentials");
  }

  const response = await fetch(auth.token_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch OAuth2 token: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const expiresAt = Date.now() + (tokenData.expires_in - 60) * 1000; // 60s buffer
  tokenCache[cacheKey] = {
    accessToken: tokenData.access_token,
    expiresAt,
  };

  return tokenData.access_token;
}

// #endregion

// #region Configuration Loading

function findConfigFile(): string | undefined {
  const fileNames = [".mcp-auth-fetch.json", ".mcp-auth-fetch.js"];
  const searchPaths = [process.cwd(), os.homedir()];

  for (const searchPath of searchPaths) {
    for (const fileName of fileNames) {
      const fullPath = path.join(searchPath, fileName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return undefined;
}

function loadConfig(): Config {
  const configFile = findConfigFile();
  if (!configFile) {
    return { auth_rules: [] };
  }

  try {
    let configData: any;
    if (configFile.endsWith(".js")) {
      const configModule = require(configFile);
      configData =
        typeof configModule === "function" ? configModule() : configModule;
    } else {
      const fileContent = fs.readFileSync(configFile, "utf-8");
      const processedContent = fileContent.replace(
        /\$\{([^}]+)\}/g,
        (_, varName) => {
          const value = process.env[varName];
          if (value === undefined) {
            throw new Error(
              `Missing required environment variable: ${varName}`
            );
          }
          return value;
        }
      );
      configData = JSON.parse(processedContent);
    }
    return ConfigSchema.parse(configData);
  } catch (error) {
    console.error(`Error loading or parsing config file ${configFile}:`, error);
    throw error;
  }
}

// #endregion

// #region URL Matching

export function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.host;
  } catch (error) {
    return "";
  }
}

export function findMatchingRule(
  url: string,
  rules: AuthRule[]
): AuthRule | undefined {
  const domain = getDomain(url);
  if (!domain) {
    return undefined;
  }

  const activeRules = rules.filter((rule) => rule.enabled !== false);

  activeRules.sort((a, b) => {
    const aIsRegex = a.url_pattern.startsWith("/");
    const bIsRegex = b.url_pattern.startsWith("/");
    const aIsGlob = a.url_pattern.includes("*");
    const bIsGlob = b.url_pattern.includes("*");

    if (aIsRegex && !bIsRegex) return -1;
    if (!aIsRegex && bIsRegex) return 1;

    if (!aIsGlob && bIsGlob) return -1;
    if (aIsGlob && !bIsGlob) return 1;

    return b.url_pattern.length - a.url_pattern.length;
  });

  for (const rule of activeRules) {
    if (rule.url_pattern.startsWith("/")) {
      try {
        const regex = new RegExp(rule.url_pattern.slice(1, -1));
        if (regex.test(domain)) {
          return rule;
        }
      } catch (error) {
        console.error(`Invalid regex in rule: ${rule.url_pattern}`, error);
      }
    } else if (micromatch.isMatch(domain, rule.url_pattern)) {
      return rule;
    }
  }

  return undefined;
}

// #endregion

// #region MCP Tools

const FetchUrlParamsSchema = z.object({
  url: z.string(),
  method: z.string().default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.number().optional(),
});

/**
 * Fetches the content of a URL with automatic authentication.
 * @param url The URL to fetch.
 * @param method The HTTP method to use.
 * @param headers Custom request headers.
 * @param body The request body.
 * @param timeout The request timeout in milliseconds.
 * @returns The response from the URL.
 */
export async function fetch_url(
  url: string,
  method: string = "GET",
  headers: Record<string, string> = {},
  body?: string,
  timeout?: number
): Promise<string> {
  const config = loadConfig();
  const rule = findMatchingRule(url, config.auth_rules);

  const finalHeaders: Record<string, string> = { ...headers };

  if (config.global_settings?.user_agent) {
    finalHeaders["User-Agent"] = config.global_settings.user_agent;
  }

  if (rule) {
    const auth = rule.auth;
    try {
      switch (auth.type) {
        case "bearer":
          finalHeaders["Authorization"] = `Bearer ${auth.token}`;
          break;
        case "api_key":
          if (auth.in === "header") {
            finalHeaders[auth.key] = auth.value;
          } else {
            const urlObj = new URL(url);
            urlObj.searchParams.append(auth.key, auth.value);
            url = urlObj.toString();
          }
          break;
        case "basic":
          const basicToken = Buffer.from(
            `${auth.username}:${auth.password}`
          ).toString("base64");
          finalHeaders["Authorization"] = `Basic ${basicToken}`;
          break;
        case "cookie":
          finalHeaders["Cookie"] = Object.entries(auth.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");
          break;
        case "function":
          const authResult = auth.function();
          if ("token" in authResult) {
            finalHeaders["Authorization"] = `Bearer ${authResult.token}`;
          } else {
            Object.assign(finalHeaders, authResult);
          }
          break;
        case "oauth2":
          const token = await getOAuth2Token(auth);
          finalHeaders["Authorization"] = `Bearer ${token}`;
          break;
      }
    } catch (error) {
      return `Authentication failed: ${(error as Error).message}`;
    }
  }

  const finalTimeout =
    timeout ?? config.global_settings?.default_timeout ?? 30000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), finalTimeout);

  try {
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body,
      signal: controller.signal,
    });

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return `Request timed out after ${finalTimeout}ms`;
    }
    return (error as Error).message;
  } finally {
    clearTimeout(timeoutId);
  }
}

const TestAuthParamsSchema = z.object({
  url: z.string(),
});

/**
 * Masks sensitive data within an authentication rule.
 * @param rule The authentication rule to sanitize.
 * @returns A sanitized authentication rule.
 */
function maskAuthRule(rule: AuthRule): AuthRule {
  const newRule = JSON.parse(JSON.stringify(rule)); // Deep copy
  switch (newRule.auth.type) {
    case "bearer":
      newRule.auth.token = "***MASKED***";
      break;
    case "api_key":
      newRule.auth.value = "***MASKED***";
      break;
    case "basic":
      newRule.auth.username = "***MASKED***";
      newRule.auth.password = "***MASKED***";
      break;
    case "cookie":
      for (const key in newRule.auth.cookies) {
        newRule.auth.cookies[key] = "***MASKED***";
      }
      break;
    case "oauth2":
      newRule.auth.client_secret = "***MASKED***";
      newRule.auth.refresh_token = "***MASKED***";
      break;
  }
  return newRule;
}

/**
 * Tests the authentication configuration for a given domain.
 * @param domain The domain to test.
 * @returns The matching authentication rule, if any.
 */
export function test_auth(url: string): {
  rule: AuthRule | null;
  configFile?: string | null;
  error?: string;
} {
  try {
    const config = loadConfig();
    const configFile = findConfigFile();
    const rule = findMatchingRule(url, config.auth_rules);

    if (rule && !config.global_settings?.verbose_test_auth) {
      const maskedRule = maskAuthRule(rule);
      return {
        rule: maskedRule,
        configFile: configFile ? "config file has used" : null,
      };
    }

    return {
      rule: rule || null,
      configFile: configFile || "No config file found",
    };
  } catch (error) {
    return { rule: null, error: (error as Error).message };
  }
}

// #endregion

// #region Server

function startServer() {
  const server = new FastMCP({
    name: packageJson.name,
    version: packageJson.version as `${number}.${number}.${number}`,
  });

  server.addTool({
    name: "fetch_url",
    description: "Fetches the content of a URL with automatic authentication.",
    parameters: FetchUrlParamsSchema,
    execute: async (params) => {
      const { url, method, headers, body, timeout } = params;
      const result = await fetch_url(url, method, headers, body, timeout);
      return JSON.stringify(result);
    },
  });

  server.addTool({
    name: "test_auth",
    description: "Tests the authentication configuration for a given url.",
    parameters: TestAuthParamsSchema,
    execute: async (params) => {
      const { url } = params;
      const result = test_auth(url);
      return JSON.stringify(result, null, 2);
    },
  });

  const type = process.argv[2] || "stdio";

  if (type === "http") {
    server.start({
      transportType: "httpStream",
      httpStream: {
        port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
        host: process.env.HOST || "",
      },
    });
  } else {
    server.start({
      transportType: "stdio",
    });
  }
}

if (require.main === module) {
  startServer();
}

// #endregion
