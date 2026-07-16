/**
 * 安全过滤模块
 *
 * 对测试结果中的堆栈跟踪、错误信息等进行敏感信息清理，
 * 确保报告中不泄露凭据、密钥、Token 等敏感内容。
 */

/** 敏感字段名模式（大小写不敏感） */
const SENSITIVE_KEY_PATTERNS = [
  /(?:^|[_\s-])(?:AWS_SECRET|AWS_ACCESS_KEY|AWS_SESSION_TOKEN)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:TOKEN|SECRET_TOKEN|ACCESS_TOKEN|AUTH_TOKEN|REFRESH_TOKEN|BEARER)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:PASSWORD|PASSWD|PWD)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:PRIVATE_KEY|SECRET_KEY|API_KEY|API_SECRET)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:CREDENTIAL|CRED|CREDENTIALS)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:NPM_TOKEN|GITHUB_TOKEN|GITLAB_TOKEN)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:DB_PASSWORD|DB_USER|DATABASE_URL)(?:$|[_\s-])/i,
  /(?:^|[_\s-])(?:REDIS_PASSWORD|REDIS_URL)(?:$|[_\s-])/i,
];

/** 敏感值模式：常见的凭据格式 */
const SENSITIVE_VALUE_PATTERNS = [
  // AWS 密钥格式
  /AKIA[0-9A-Z]{16}/g,
  /sk-[a-zA-Z0-9]{32,}/g,
  // JWT token
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  // GitHub token
  /gh[pousr]_[a-zA-Z0-9]{36,}/g,
  // 通用 base64 长串（可能是凭据）
  /[A-Za-z0-9+/=]{40,}/g,
];

/** 替换占位符 */
const REDACTED = "[已过滤]";

/**
 * 检查字段名是否匹配敏感模式
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * 过滤文本中的敏感值
 */
function redactSensitiveValues(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

/**
 * 过滤环境变量赋值行中的敏感值
 * 例：`SECRET_TOKEN=abc123` → `SECRET_TOKEN=[已过滤]`
 */
function sanitizeEnvVarLine(line: string): string {
  // 匹配 VAR_NAME=VALUE 格式
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) {
    const key = match[1];
    if (isSensitiveKey(key)) {
      return `${key}=${REDACTED}`;
    }
  }
  return line;
}

/**
 * 过滤包含敏感键的对象属性值
 * 例：`{ password: "secret" }` → `{ password: "[已过滤]" }`
 */
function sanitizeObjectLiteral(line: string): string {
  let result = line;
  for (const pattern of SENSITIVE_KEY_PATTERNS) {
    // 匹配 key: "value" 或 key: 'value' 或 key=value
    const keyValueRegex = new RegExp(
      `(${pattern.source})\\s*[:=]\\s*(["'\`]?)([^"'\\n,}]+)\\2`,
      "gi"
    );
    result = result.replace(keyValueRegex, (_match, key, quote, _value) => {
      return `${key}: ${quote}${REDACTED}${quote}`;
    });
  }
  return result;
}

/**
 * 对堆栈跟踪内容进行安全过滤
 *
 * 执行以下处理：
 * 1. 过滤包含敏感字段名的行值
 * 2. 过滤符合凭据格式的长字符串
 * 3. 过滤环境变量赋值行
 *
 * @param stackTrace 原始堆栈跟踪文本
 * @returns 过滤后的安全文本
 */
export function sanitizeStackTrace(stackTrace: string): string {
  if (!stackTrace) return stackTrace;

  const lines = stackTrace.split("\n");

  const sanitized = lines.map((line) => {
    // 1. 过滤环境变量赋值
    let processed = sanitizeEnvVarLine(line);
    // 2. 过滤对象属性中的敏感值
    processed = sanitizeObjectLiteral(processed);
    // 3. 过滤凭据格式的值
    processed = redactSensitiveValues(processed);
    return processed;
  });

  return sanitized.join("\n");
}

/**
 * 对错误消息进行安全过滤
 *
 * 与堆栈过滤类似，但更关注错误消息中可能嵌入的凭据
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return message;

  let result = message;
  result = sanitizeObjectLiteral(result);
  result = redactSensitiveValues(result);
  return result;
}

/**
 * 对文件路径进行安全过滤
 *
 * 过滤用户主目录下可能包含敏感信息的路径片段
 * 保留项目相对路径，移除绝对路径中的用户信息
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath) return filePath;

  // 过滤 /home/<user>/、/Users/<user>/ 等用户目录
  return filePath
    .replace(/\/home\/[^/]+/g, "/home/<user>")
    .replace(/\/Users\/[^/]+/g, "/Users/<user>")
    .replace(/\/root/g, "/<root>");
}