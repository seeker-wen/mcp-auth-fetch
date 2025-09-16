[中文](./README-CN.md)

# MCP Auth Fetch

`mcp-auth-fetch-pro` is a powerful and flexible package designed to simplify HTTP/HTTPS requests by automatically applying authentication credentials based on configurable rules.

It acts as a seamless proxy for your fetch calls, finding the correct authentication method for a given URL, and attaching the necessary headers or parameters.

## Features

- **Rule-Based Authentication**: Configure different authentication methods for different URL patterns (exact match, glob, or regex).
- **Multiple Auth Methods**: Supports Bearer Tokens, API Keys (in header or query), Basic Auth, and custom Cookies.
- **Environment Variable Support**: Keep your secrets safe by referencing environment variables directly from the configuration file.
- **Global Settings**: Configure global settings like user-agent and request timeouts.

## Installation
@
```bash
npm install mcp-auth-fetch-pro
```

## Usage as an MCP Plugin

```json
{
  "mcpServers": {
    "mcp-auth-fetch": {
      "command": "npx",
      "args": ["mcp-auth-fetch"]
    }
  }
}
```

This package is designed to be used as a plugin within an MCP (Model-Centric Programming) environment. Once the package is installed, it exposes its functions as tools that can be called from a compatible MCP client.

#### Tool: `fetch_url`

Fetches a URL, automatically applying the authentication configured in `.mcp-auth-fetch.json`.

**Parameters:**

- `--url` (required): The URL to fetch.
- `--method` (optional): The HTTP method (e.g., `GET`, `POST`). Defaults to `GET`.
- `--headers` (optional): A JSON string of custom headers.
- `--body` (optional): The request body for `POST`, `PUT`, etc.
- `--timeout` (optional): A request-specific timeout in milliseconds.

#### Tool: `test_auth`

Tests your configuration by finding which rule matches a given domain and returns the result as a JSON string.

## Configuration

The power of this tool lies in its configuration file. Create a file named `.mcp-auth-fetch.json` in your project's root directory or your home directory.

### Configuration Structure

```json
{
  "global_settings": {
    "default_timeout": 15000,
    "user_agent": "MyAwesomeApp/1.0"
  },
  "auth_rules": [
    {
      "url_pattern": "api.github.com",
      "description": "GitHub API",
      "auth": {
        "type": "bearer",
        "token": "${GITHUB_TOKEN}"
      }
    },
    {
      "url_pattern": "*.openai.com",
      "description": "OpenAI API",
      "auth": {
        "type": "api_key",
        "in": "header",
        "key": "Authorization",
        "value": "Bearer ${OPENAI_API_KEY}"
      }
    },
    {
      "url_pattern": "internal-api.my-company.com",
      "description": "Internal Basic Auth API",
      "auth": {
        "type": "basic",
        "username": "${INTERNAL_USER}",
        "password": "${INTERNAL_PASS}"
      }
    },
    {
      "url_pattern": "legacy.example.com",
      "description": "Legacy Cookie Auth",
      "auth": {
        "type": "cookie",
        "cookies": {
          "session_id": "abc-123-def-456",
          "user_token": "${LEGACY_USER_TOKEN}"
        }
      }
    },
    {
      "url_pattern": "auth-server.my-company.com",
      "description": "OAuth2 Client Credentials",
      "auth": {
        "type": "oauth2",
        "token_url": "https://auth-server.my-company.com/oauth/token",
        "client_id": "${OAUTH_CLIENT_ID}",
        "client_secret": "${OAUTH_CLIENT_SECRET}",
        "scope": "api:read"
      }
    },
    {
      "url_pattern": "another-service.com",
      "description": "OAuth2 with Refresh Token",
      "auth": {
        "type": "oauth2",
        "token_url": "https://another-service.com/api/token",
        "client_id": "${SERVICE_CLIENT_ID}",
        "client_secret": "${SERVICE_CLIENT_SECRET}",
        "refresh_token": "${SERVICE_REFRESH_TOKEN}"
      }
    },
    {
      "url_pattern": "/api\\.special\\.com/",
      "description": "A special API requiring regex matching",
      "auth": {
        "type": "bearer",
        "token": "${SPECIAL_TOKEN}"
      },
      "enabled": true
    }
  ]
}
```

### Configuration Fields

- **`global_settings`** (optional): Settings that apply to all requests.
  - `default_timeout`: Default request timeout in milliseconds.
  - `user_agent`: A custom User-Agent string.
  - `verbose_test_auth`: Set to `true` to show the full, unmasked authentication details in the `test_auth` output. Defaults to `false`, which masks sensitive information for security.
- **`auth_rules`**: An array of authentication rules.
  - `url_pattern`: The URL pattern to match against the domain of the request URL.
    - **Exact Match**: `api.service.com`
    - **Glob Match**: `*.service.com`
    - **Regex Match**: `/api\\.service\\.(com|org)/` (Note: Regex must be a string starting and ending with `/`)
  - `description` (optional): A human-readable description of the rule.
  - `enabled` (optional): Set to `false` to disable a rule. Defaults to `true`.
  - `auth`: An object describing the authentication method.
    - `type`: One of `bearer`, `api_key`, `basic`, `cookie`, `oauth2`, `function`.
    - **`bearer`**: `{ "type": "bearer", "token": "..." }`
    - **`api_key`**: `{ "type": "api_key", "in": "header"|"query", "key": "...", "value": "..." }`
    - **`basic`**: `{ "type": "basic", "username": "...", "password": "..." }`
    - **`cookie`**: `{ "type": "cookie", "cookies": { "key1": "value1", ... } }`
    - **`oauth2`**: Handles OAuth2 client credentials and refresh token flows. `{ "type": "oauth2", "token_url": "...", "client_id": "...", "client_secret": "...", "scope": "(optional)", "refresh_token": "(optional)" }`
    - **`function`**: For advanced dynamic credentials. Requires a `.mcp-auth-fetch.js` config file. The value is a function that returns headers or a bearer token. `{ "type": "function", "function": () => ({ "Authorization": "Bearer ..." }) }`

### Using Environment Variables

For security, you can store secrets in environment variables and reference them in your config file using the `${VAR_NAME}` syntax. The tool will automatically substitute them at runtime.

## Development

To contribute or run this project locally:

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Run tests: `npm test`
4.  Build the project: `npm run build`
