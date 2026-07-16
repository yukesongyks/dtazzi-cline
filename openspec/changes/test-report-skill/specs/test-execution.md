# Spec: Test Execution (测试执行)

## Overview
定义 Skill 如何触发测试执行、收集结果文件、以及框架自动检测的行为规范。

## FR1.1: 框架自动检测

### Scenario: 用户显式指定命令
- **Given** 用户调用 Skill 时传入了 `test_command: "npm run test:coverage"`
- **When** Skill 开始执行
- **Then** 直接使用用户指定的命令，跳过自动检测
- **And** 命令执行完成后，在默认输出目录中查找结果文件

### Scenario: 从 package.json 检测
- **Given** 项目根目录存在 `package.json`，其中 `scripts.test` 为 `"vitest run"`
- **And** 用户未指定 `test_command`
- **When** Skill 进行框架检测
- **Then** 使用 `npm run test` 作为执行命令
- **And** 根据项目依赖（`vitest` 在 devDependencies 中）推断框架为 Vitest

### Scenario: 从 pyproject.toml 检测
- **Given** 项目根目录存在 `pyproject.toml`，含 `[tool.pytest.ini_options]`
- **And** 用户未指定 `test_command`
- **When** Skill 进行框架检测
- **Then** 使用 `pytest` 作为执行命令
- **And** 推断框架为 pytest

### Scenario: 从特征文件推断
- **Given** 项目根目录存在 `jest.config.ts` 但无 `package.json` 中的 test script
- **And** 用户未指定 `test_command`
- **When** Skill 进行框架检测
- **Then** 推断框架为 Jest
- **And** 使用 `npx jest --json --outputFile=<path>` 作为执行命令（附加 JSON reporter 参数）

### Scenario: 无法检测框架
- **Given** 项目根目录无任何已知框架的特征文件或配置
- **And** 用户未指定 `test_command`
- **When** Skill 进行框架检测
- **Then** 返回错误信息："无法自动检测测试框架，请通过 test_command 显式指定测试命令"
- **And** 不执行任何测试命令

## FR1.3: 双模式支持

### Scenario: 执行模式（默认）
- **Given** 用户未指定 `result_file`
- **When** Skill 启动
- **Then** 进入执行模式：检测框架 → 运行测试 → 收集结果 → 生成报告
- **And** 测试执行过程中的 stdout/stderr 应被捕获，用于诊断

### Scenario: 解析模式
- **Given** 用户指定 `result_file: "./test-results/junit.xml"`
- **And** 该文件存在且可读
- **When** Skill 启动
- **Then** 进入解析模式：跳过测试执行，直接解析指定文件
- **And** 报告中的"执行命令"字段标注为"（解析模式，未执行）"

### Scenario: 解析模式 - 文件不存在
- **Given** 用户指定 `result_file: "./nonexistent.xml"`
- **When** Skill 启动
- **Then** 返回错误："指定的结果文件不存在: ./nonexistent.xml"
- **And** 不生成报告

## FR1.4: 执行失败处理

### Scenario: 测试命令执行失败
- **Given** 用户指定的 `test_command` 或自动检测的命令执行失败（退出码非 0 且无结果文件生成）
- **When** Skill 尝试收集结果
- **Then** 返回诊断信息："测试命令执行失败: <command>，退出码: <code>，错误输出: <stderr 摘要>"
- **And** 不生成空报告

### Scenario: 测试命令未安装
- **Given** 自动检测到 `vitest` 但 `npx vitest` 返回 command not found
- **When** Skill 尝试执行测试
- **Then** 返回诊断："测试框架 vitest 未安装，请先执行 npm install"

## NFR2: 健壮性

### Scenario: 结果文件为空
- **Given** 结果文件存在但内容为空（0 bytes）
- **When** 解析器尝试解析
- **Then** 返回错误："结果文件为空，无法生成报告"
- **And** 不生成报告

### Scenario: 结果文件格式异常
- **Given** 结果文件内容不是有效的 JSON/XML
- **When** 解析器尝试解析
- **Then** 返回错误："结果文件格式异常: <具体解析错误>"
- **And** 不生成报告