import type { FrameworkId } from "./types.js";
/**
 * FR1.1 自动识别项目使用的测试框架与运行命令，识别优先级：
 *  a. 用户显式指定的命令；
 *  b. package.json scripts(test)、pyproject.toml、Cargo.toml 等项目配置；
 *  c. 框架特征文件推断（jest.config.*、vitest.config.*、pytest.ini）。
 */
export interface DetectionResult {
    framework: FrameworkId;
    testCommand: string;
    frameworkVersion?: string;
    evidence: string;
}
export interface DetectOptions {
    cwd: string;
    /** 用户显式指定的测试命令（优先级 a） */
    userTestCommand?: string;
    /** 用户显式指定的框架（覆盖推断） */
    userFramework?: FrameworkId;
}
export declare function detectFramework(opts: DetectOptions): DetectionResult;
