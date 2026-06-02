#!/usr/bin/env node
/**
 * publish.js
 *
 * 多环境发布脚本
 * 支持: prod (latest), pre (预发), dev (开发)
 *
 * 使用方式:
 *   node scripts/publish.js prod    # 发布生产版本 (tag: latest)
 *   node scripts/publish.js pre     # 发布预发版本 (tag: pre)
 *   node scripts/publish.js dev     # 发布开发版本 (tag: dev)
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

const ENV = process.argv[2]

if (!ENV || !['prod', 'pre', 'dev'].includes(ENV)) {
  console.error('错误: 请指定发布环境')
  console.error('用法: node scripts/publish.js <prod|pre|dev>')
  process.exit(1)
}

// 环境配置映射
const ENV_CONFIG = {
  prod: {
    tag: 'latest',
    description: '生产环境',
    versionSuffix: '',
  },
  pre: {
    tag: 'pre',
    description: '预发环境',
    versionSuffix: '-pre',
  },
  dev: {
    tag: 'dev',
    description: '开发环境',
    versionSuffix: '-dev',
  },
}

const config = ENV_CONFIG[ENV]

console.log(`\n🚀 开始发布 ${config.description}版本...\n`)

try {
  // 1. 读取当前版本
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const currentVersion = packageJson.version

  console.log(`当前版本: ${currentVersion}`)
  console.log(`发布标签: ${config.tag}`)
  console.log(`环境标识: ${ENV}\n`)

  // 2. 检查工作区是否干净
  try {
    execSync('git diff-index --quiet HEAD --', { stdio: 'ignore' })
  } catch {
    console.warn('⚠️ 警告: 工作区有未提交的更改')
    console.log('建议: 请先提交或暂存更改后再发布\n')
    // 不强制退出，允许继续
  }

  // 3. 构建项目
  console.log('📦 步骤 1/4: 构建项目...')
  execSync('npm run build', { stdio: 'inherit', cwd: projectRoot })
  console.log('✓ 构建完成\n')

  // 4. 更新版本号（如果是pre或dev环境）
  let newVersion = currentVersion
  if (ENV !== 'prod') {
    console.log('🏷️  步骤 2/4: 更新版本号...')
    
    // 解析版本号，处理可能存在的后缀（如 -pre.xxx 或 -dev.xxx）
    // 提取基础版本号（去掉任何后缀）
    const baseVersion = currentVersion.split('-')[0]
    const [major, minor, patch] = baseVersion.split('.').map(Number)
    const timestamp = Date.now()
    // pre/dev 环境只更新时间戳，不增加 patch 版本号
    newVersion = `${major}.${minor}.${patch}${config.versionSuffix}.${timestamp}`
    
    // 更新根目录的 package.json
    packageJson.version = newVersion
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

    console.log(`✓ 版本更新: ${currentVersion} -> ${newVersion}\n`)
  } else {
    console.log('🏷️  步骤 2/4: 版本号保持不变（生产环境）\n')
  }

  // 5. 发布到 tnpm
  console.log('📤 步骤 3/4: 发布到 tnpm...')
  console.log(`执行: tnpm publish --tag ${config.tag}`)
  
  try {
    execSync(`tnpm publish --tag ${config.tag}`, { stdio: 'inherit', cwd: projectRoot })
    console.log(`\n✅ 发布成功!`)
    console.log(`\n📦 ${packageJson.name}@${newVersion}`)
    console.log(`   标签: ${config.tag}`)
    console.log(`   环境: ${config.description}\n`)
  } catch (publishError) {
    // 发布失败，回滚版本号
    if (ENV !== 'prod') {
      packageJson.version = currentVersion
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
      console.log('⚠️ 版本号已回滚')
    }
    throw publishError
  }

  // 6. 如果是生产环境，同时更新其他标签
  if (ENV === 'prod') {
    console.log('\n🔄 同步更新 pre 和 dev 标签...')
    try {
      execSync(`tnpm dist-tag add ${packageJson.name}@${newVersion} pre`, { stdio: 'ignore', cwd: projectRoot })
      execSync(`tnpm dist-tag add ${packageJson.name}@${newVersion} dev`, { stdio: 'ignore', cwd: projectRoot })
      console.log('✓ 标签同步完成\n')
    } catch {
      console.log('⚠️ 标签同步失败（非致命错误）\n')
    }
  }

  // 7. 显示安装命令
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('安装命令:')
  if (ENV === 'prod') {
    console.log(`  tnpm install -g ${packageJson.name}`)
    console.log('  # 或')
    console.log(`  tnpm install -g ${packageJson.name}@latest`)
  } else {
    console.log(`  tnpm install -g ${packageJson.name}@${config.tag}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

} catch (error) {
  console.error('\n❌ 发布失败:')
  console.error(error.message || error)
  process.exit(1)
}