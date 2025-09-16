[English](./README.md)

# MCP Auth Fetch

`mcp-auth-fetch-pro` 是一个功能强大且灵活的软件包，旨在通过根据可配置的规则自动应用身份验证凭据来简化 HTTP/HTTPS 请求。

它充当您的 fetch 调用的无缝代理，为给定 URL 找到正确的身份验证方法，并附加必要的标头或参数。

## 功能

- **基于规则的身份验证**: 为不同的 URL 模式（精确匹配、glob 或正则表达式）配置不同的身份验证方法。
- **多种身份验证方法**: 支持 Bearer 令牌、API 密钥（在标头或查询中）、基本身份验证和自定义 Cookie。
- **环境变量支持**: 通过直接从配置文件中引用环境变量来确保您的密钥安全。
- **全局设置**: 配置用户代理和请求超时等全局设置。

## 安装

```bash
npm install mcp-auth-fetch-pro
```

## 作为 MCP 插件使用

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

该软件包旨在用作 MCP（以模型为中心的编程）环境中的插件。安装软件包后，它会将其功能公开为可从兼容的 MCP 客户端调用的工具。

#### 工具: `fetch_url`

获取一个 URL，自动应用 `.mcp-auth-fetch.json` 中配置的身份验证。

**参数:**

- `--url` (必需): 要获取的 URL。
- `--method` (可选): HTTP 方法 (例如, `GET`, `POST`)。默认为 `GET`。
- `--headers` (可选): 自定义标头的 JSON 字符串。
- `--body` (可选): `POST`、`PUT` 等的请求正文。
- `--timeout` (可选): 特定于请求的超时（以毫秒为单位）。

#### 工具: `test_auth`

通过查找与给定域匹配的规则来测试您的配置，并以 JSON 字符串形式返回结果。

## 配置

该工具的强大之处在于其配置文件。在您的项目根目录或主目录中创建一个名为 `.mcp-auth-fetch.json` 的文件。

### 配置结构

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

### 配置字段

- **`global_settings`** (可选): 适用于所有请求的设置。
  - `default_timeout`: 默认请求超时（以毫秒为单位）。
  - `user_agent`: 自定义用户代理字符串。
  - `verbose_test_auth`: 设置为 `true` 以在 `test_auth` 的输出中显示完整、未屏蔽的认证详情。默认为 `false`，此时会为了安全而屏蔽敏感信息。
- **`auth_rules`**: 身份验证规则数组。
  - `url_pattern`: 与请求 URL 的域匹配的 URL 模式。
    - **精确匹配**: `api.service.com`
    - **Glob 匹配**: `*.service.com`
    - **正则表达式匹配**: `/api\.service\.(com|org)/` (注意: 正则表达式必须是以 `/` 开头和结尾的字符串)
  - `description` (可选): 规则的人类可读描述。
  - `enabled` (可选): 设置为 `false` 以禁用规则。默认为 `true`。
  - `auth`: 描述身份验证方法的对象。
    - `type`: `bearer`、`api_key`、`basic`、`cookie`、`oauth2`、`function`之一。
    - **`bearer`**: `{ "type": "bearer", "token": "..." }`
    - **`api_key`**: `{ "type": "api_key", "in": "header"|"query", "key": "...", "value": "..." }`
    - **`basic`**: `{ "type": "basic", "username": "...", "password": "..." }`
    - **`cookie`**: `{ "type": "cookie", "cookies": { "key1": "value1", ... } }`
    - **`oauth2`**: 处理 OAuth2 客户端凭据和刷新令牌流程。`{ "type": "oauth2", "token_url": "...", "client_id": "...", "client_secret": "...", "scope": "(可选)", "refresh_token": "(可选)" }`
    - **`function`**: 用于高级动态凭据。需要一个 `.mcp-auth-fetch.js` 配置文件。该值是一个返回标头或 bearer 令牌的函数。`{ "type": "function", "function": () => ({ "Authorization": "Bearer ..." }) }`

### 使用环境变量

为安全起见，您可以将密钥存储在环境变量中，并使用 `${VAR_NAME}` 语法在配置文件中引用它们。该工具将在运行时自动替换它们。

## 开发

要贡献或在本地运行此项目：

1.  克隆存储库。
2.  安装依赖：`npm install`
3.  运行测试：`npm test`
4.  构建项目：`npm run build`
