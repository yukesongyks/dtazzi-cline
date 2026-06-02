/**
 * env-config.ts
 *
 * 环境配置管理
 * 用于在运行时根据包版本自动识别当前环境
 */

// 版本号在构建时通过 esbuild 注入
const PACKAGE_VERSION = process.env.KANBAN_PACKAGE_VERSION || "unknown";

/**
 * 环境配置映射
 */
export const ENV_CONFIGS = {
	prod: {
		type: "prod" as const,
		name: "生产环境",
		description: "稳定版本，面向所有用户",
		isProduction: true,
	},
	pre: {
		type: "pre" as const,
		name: "预发环境",
		description: "预发布版本，用于内部测试",
		isProduction: false,
	},
	dev: {
		type: "dev" as const,
		name: "开发环境",
		description: "开发版本，用于本地调试",
		isProduction: false,
	},
	unknown: {
		type: "unknown" as const,
		name: "未知环境",
		description: "无法识别当前环境",
		isProduction: false,
	},
} as const;

export type EnvType = keyof typeof ENV_CONFIGS;

/**
 * 获取当前包的版本信息
 * 版本号在构建时通过 esbuild 注入到 process.env.KANBAN_PACKAGE_VERSION
 */
function getPackageVersion(): string | null {
	if (PACKAGE_VERSION && PACKAGE_VERSION !== "unknown") {
		return PACKAGE_VERSION;
	}
	return null;
}

/**
 * 根据版本号识别环境
 * - 包含 -pre: 预发环境
 * - 包含 -dev: 开发环境
 * - 其他: 生产环境
 */
export function detectEnv(version: string): EnvType {
	if (version.includes("-pre")) {
		return "pre";
	}
	if (version.includes("-dev")) {
		return "dev";
	}
	// 纯数字版本号视为生产环境
	if (/^\d+\.\d+\.\d+$/.test(version)) {
		return "prod";
	}
	return "unknown";
}

/**
 * 获取当前环境配置
 */
export function getCurrentEnvConfig() {
	const version = getPackageVersion();
	if (!version) {
		return ENV_CONFIGS.unknown;
	}
	const envType = detectEnv(version);
	return ENV_CONFIGS[envType];
}

/**
 * 获取当前环境类型
 */
export function getCurrentEnv(): EnvType {
	const config = getCurrentEnvConfig();
	return config.type;
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
	const config = getCurrentEnvConfig();
	return config.isProduction;
}

/**
 * 显示环境信息（用于启动时显示）
 */
export function showEnvBanner(): string {
	const version = getPackageVersion();
	const config = getCurrentEnvConfig();

	if (config.type === "prod") {
		return ""; // 生产环境不显示特殊标识
	}

	const lines = [
		"",
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
		`  🧪 ${config.name}`,
		`  版本: ${version}`,
		`  ${config.description}`,
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
		"",
	];

	return lines.join("\n");
}
