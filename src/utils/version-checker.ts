/**
 * version-checker.ts
 *
 * 版本检查工具，用于检测 dtazzicloud 是否需要自动更新
 */
import { execFile, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCurrentEnv } from "./env-config.js";

// 版本缓存，避免重复执行 tnpm 命令
const versionCache = {
	currentVersion: null as string | null,
	latestVersion: null as string | null,
	timestamp: 0,
};

// 缓存有效期：5分钟
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取环境对应的 tnpm 标签
 */
function getTagForEnv(env: string): string {
	switch (env) {
		case "pre":
			return "pre";
		case "dev":
			return "dev";
		default:
			return "latest";
	}
}

/**
 * 从 package.json 读取版本号（最快的方式）
 */
function getVersionFromPackageJson(): string {
	try {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		const packageJsonPath = join(__dirname, "..", "..", "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		return packageJson.version || "";
	} catch {
		return "";
	}
}

/**
 * 获取当前安装的版本号（优先使用缓存，其次从 package.json 读取）
 */
export function getCurrentVersion(): string {
	// 检查缓存
	const now = Date.now();
	if (versionCache.currentVersion && now - versionCache.timestamp < CACHE_TTL) {
		return versionCache.currentVersion;
	}

	// 优先从 package.json 读取（更快）
	const versionFromPkg = getVersionFromPackageJson();
	if (versionFromPkg) {
		versionCache.currentVersion = versionFromPkg;
		return versionFromPkg;
	}

	// 最后尝试从 tnpm list 获取
	try {
		const result = execSync("tnpm list -g @alipay/dtazzicloud --json --depth=0", {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 5000, // 5秒超时
		});
		const parsed = JSON.parse(result);
		if (parsed.dependencies?.["@alipay/dtazzicloud"]) {
			const version = parsed.dependencies["@alipay/dtazzicloud"].version || "";
			versionCache.currentVersion = version;
			return version;
		}
	} catch {
		// 忽略错误
	}

	return "";
}

/**
 * 获取最新版本号（根据当前环境获取对应标签的版本，带缓存）
 */
export function getLatestVersion(): string {
	// 检查缓存
	const now = Date.now();
	if (versionCache.latestVersion && now - versionCache.timestamp < CACHE_TTL) {
		return versionCache.latestVersion;
	}

	try {
		const env = getCurrentEnv();
		const tag = getTagForEnv(env);

		// 使用 tnpm view 获取对应标签的最新版本
		const result = execSync(`tnpm view @alipay/dtazzicloud@${tag} version`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 10000, // 10秒超时
		});

		const version = result.trim();
		versionCache.latestVersion = version;
		versionCache.timestamp = now;
		return version;
	} catch {
		// 静默处理错误，不打印日志
		return "";
	}
}

/**
 * 解析版本号，支持带预发布标识的版本（如 0.0.2-pre.1711420800000）
 * @param version 版本号字符串
 * @returns 解析后的版本对象
 */
function parseVersion(version: string): {
	major: number;
	minor: number;
	patch: number;
	prerelease: string | null;
	timestamp: number;
} {
	// 移除可能存在的 'v' 前缀
	const cleanVersion = version.replace(/^v/, "");

	// 分离预发布标识（-pre.xxx 或 -dev.xxx）
	const prereleaseMatch = cleanVersion.match(/^(\d+\.\d+\.\d+)(?:-(pre|dev)\.(\d+))?/);

	if (!prereleaseMatch) {
		return { major: 0, minor: 0, patch: 0, prerelease: null, timestamp: 0 };
	}

	const baseVersion = prereleaseMatch[1];
	const prerelease = prereleaseMatch[2] || null;
	const timestamp = prereleaseMatch[3] ? parseInt(prereleaseMatch[3], 10) : 0;
	const [major, minor, patch] = baseVersion.split(".").map(Number);

	return { major, minor, patch, prerelease, timestamp };
}

/**
 * 比较版本号
 * @param current 当前版本
 * @param latest 最新版本
 * @returns 如果需要更新返回 true
 */
export function compareVersions(current: string, latest: string): boolean {
	if (!current || !latest) return false;

	const currentParsed = parseVersion(current);
	const latestParsed = parseVersion(latest);

	// 比较主版本号
	if (latestParsed.major > currentParsed.major) return true;
	if (latestParsed.major < currentParsed.major) return false;

	// 比较次版本号
	if (latestParsed.minor > currentParsed.minor) return true;
	if (latestParsed.minor < currentParsed.minor) return false;

	// 比较修订版本号
	if (latestParsed.patch > currentParsed.patch) return true;
	if (latestParsed.patch < currentParsed.patch) return false;

	// 如果基础版本号相同，比较预发布版本的时间戳
	// 注意：这里假设同一基础版本号下，时间戳越大版本越新
	if (latestParsed.timestamp > currentParsed.timestamp) return true;

	return false;
}

/**
 * 清除版本缓存
 * 在需要强制刷新版本信息时调用
 */
export function clearVersionCache(): void {
	versionCache.currentVersion = null;
	versionCache.latestVersion = null;
	versionCache.timestamp = 0;
}

/**
 * 异步获取最新版本（不阻塞，带超时）
 * @param timeoutMs 超时时间（毫秒）
 * @returns 最新版本号，如果超时或失败返回空字符串
 */
export async function getLatestVersionAsync(timeoutMs = 5000): Promise<string> {
	// 首先检查缓存
	const now = Date.now();
	if (versionCache.latestVersion && now - versionCache.timestamp < CACHE_TTL) {
		return versionCache.latestVersion;
	}

	try {
		const env = getCurrentEnv();
		const tag = getTagForEnv(env);

		const stdout = await new Promise<string>((resolve, reject) => {
			execFile(
				"tnpm",
				["view", `@alipay/dtazzicloud@${tag}`, "version"],
				{
					encoding: "utf8",
					stdio: ["pipe", "pipe", "pipe"],
					signal: AbortSignal.timeout(timeoutMs),
				},
				(error, stdout, _stderr) => {
					if (error) reject(error);
					else resolve(stdout);
				},
			);
		});

		const version = stdout.trim();
		versionCache.latestVersion = version;
		versionCache.timestamp = Date.now();
		return version;
	} catch {
		// 静默处理错误，不打印日志
		return "";
	}
}

/**
 * 检查版本更新（仅检查，不自动更新）
 * @param timeoutMs 版本检查超时时间（毫秒），默认5秒
 * @returns 版本信息
 */
export async function checkVersionUpdate(timeoutMs = 5000): Promise<{
	currentVersion: string;
	latestVersion: string;
	needsUpdate: boolean;
	env: string;
}> {
	try {
		const currentVersion = getCurrentVersion();
		const latestVersion = await getLatestVersionAsync(timeoutMs);
		const env = getCurrentEnv();
		const needsUpdate = compareVersions(currentVersion, latestVersion);

		return {
			currentVersion,
			latestVersion,
			needsUpdate,
			env,
		};
	} catch (_error) {
		// 静默处理错误，返回空信息
		return {
			currentVersion: "",
			latestVersion: "",
			needsUpdate: false,
			env: "unknown",
		};
	}
}
