#!/usr/bin/env node
/**
 * 测试发布脚本（dry-run模式）
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

const ENV = 'pre' // 测试预发环境

console.log(`\n🚀 测试发布 ${ENV} 版本（dry-run模式）...\n`)

try {
  // 1. 读取当前版本
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const currentVersion = packageJson.version

  console.log(`当前版本: ${currentVersion}`)
  console.log(`发布标签: ${ENV}`)
  console.log(`环境标识: ${ENV}\n`)

  // 2. 检查工作区是否干净
  try {
    execSync('git diff-index --quiet HEAD --', { stdio: 'ignore' })
    console.log('✓ 工作区干净')
  } catch {
    console.warn('⚠️ 警告: 工作区有未提交的更改')
  }

  // 3. 模拟构建项目
  console.log('\n📦 步骤 1/4: 模拟构建项目...')
  console.log('(dry-run) 跳过实际构建')
  console.log('✓ 构建完成\n')

  // 4. 模拟更新版本号
  console.log('🏷️  步骤 2/4: 模拟更新版本号...')
  
  // 解析版本号，处理可能存在的后缀（如 -pre.xxx 或 -dev.xxx）
  // 提取基础版本号（去掉任何后缀）
  const baseVersion = currentVersion.split('-')[0]
  const [major, minor, patch] = baseVersion.split('.').map(Number)
  const timestamp = Date.now()
  const newVersion = `${major}.${minor}.${patch + 1}-${ENV}.${timestamp}`
  
  console.log(`(dry-run) 版本更新: ${currentVersion} -> ${newVersion}\n`)

  // 5. 模拟发布到 tnpm
  console.log('📤 步骤 3/4: 模拟发布到 tnpm...')
  console.log(`(dry-run) 执行: tnpm publish --tag ${ENV}`)
  console.log('✓ 发布成功\n')

  // 6. 显示安装命令
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('安装命令:')
  console.log(`  tnpm install -g ${packageJson.name}@${ENV}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('✅ 发布测试完成（dry-run模式）')
  console.log('\n实际发布时，请运行:')
  console.log(`  npm run publish:${ENV}`)
  console.log('  或')
  console.log(`  node scripts/publish.js ${ENV}`)

} catch (error) {
  console.error('\n❌ 测试失败:')
  console.error(error.message || error)
  process.exit(1)
}