#!/usr/bin/env node
/**
 * version-bump.js
 *
 * 版本号升级脚本
 * 支持: major, minor, patch 升级
 *
 * 使用方式:
 *   node scripts/version-bump.js patch    # 0.0.1 -> 0.0.2
 *   node scripts/version-bump.js minor    # 0.0.1 -> 0.1.0
 *   node scripts/version-bump.js major    # 0.0.1 -> 1.0.0
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

const BUMP_TYPE = process.argv[2] || 'patch'

if (!['major', 'minor', 'patch'].includes(BUMP_TYPE)) {
  console.error('错误: 请指定正确的升级类型')
  console.error('用法: node scripts/version-bump.js <major|minor|patch>')
  process.exit(1)
}

console.log(`\n🏷️  开始升级 ${BUMP_TYPE} 版本号...\n`)

try {
  // 读取 package.json
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const currentVersion = packageJson.version

  console.log(`当前版本: ${currentVersion}`)

  // 解析版本号（去掉可能存在的后缀，如 -pre.xxx 或 -dev.xxx）
  const baseVersion = currentVersion.split('-')[0]
  const [major, minor, patch] = baseVersion.split('.').map(Number)

  // 计算新版本
  let newVersion
  switch (BUMP_TYPE) {
    case 'major':
      newVersion = `${major + 1}.0.0`
      break
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`
      break
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`
      break
  }

  console.log(`新版本: ${newVersion}`)

  // 更新根目录的 package.json
  packageJson.version = newVersion
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

  console.log(`\n✅ 版本号已更新: ${currentVersion} -> ${newVersion}\n`)

} catch (error) {
  console.error('\n❌ 升级失败:')
  console.error(error.message || error)
  process.exit(1)
}