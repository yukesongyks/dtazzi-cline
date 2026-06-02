# dtazzicloud 多环境发布指南

## 概述

dtazzicloud 支持通过 `tnpm dist-tags` 机制发布多环境版本，实现：

- **生产版本 (latest)**: 面向所有用户的稳定版本
- **预发版本 (pre)**: 内部测试版本
- **开发版本 (dev)**: 本地调试版本

## 版本号规则

| 环境 | 版本示例 | 说明 |
|------|---------|------|
| prod | `0.0.2` | 纯数字版本号 |
| pre | `0.0.3-pre.1711420800000` | 带 `-pre` 后缀 |
| dev | `0.0.3-dev.1711420800000` | 带 `-dev` 后缀 |

## 发布命令

### 1. 生产环境发布 (latest)

```bash
# 方式1: 使用 npm 脚本
npm run publish:prod

# 方式2: 直接使用 node
node scripts/publish.js prod
```

**效果**: 
- 版本号保持不变
- 发布到 `latest` tag
- 同时更新 `pre` 和 `dev` 标签指向新版本

### 2. 预发环境发布 (pre)

```bash
# 方式1: 使用 npm 脚本
npm run publish:pre

# 方式2: 直接使用 node
node scripts/publish.js pre
```

**效果**:
- 添加 `-pre.时间戳` 后缀
- 发布到 `pre` tag
- 保持基础版本号不变

### 3. 开发环境发布 (dev)

```bash
# 方式1: 使用 npm 脚本
npm run publish:dev

# 方式2: 直接使用 node
node scripts/publish.js dev
```

**效果**:
- 添加 `-dev.时间戳` 后缀
- 发布到 `dev` tag
- 保持基础版本号不变

## 版本升级

在发布前，你可以手动升级版本号：

```bash
# 升级 patch 版本: 0.0.1 -> 0.0.2
npm run version:bump patch

# 升级 minor 版本: 0.0.1 -> 0.1.0
npm run version:bump minor

# 升级 major 版本: 0.0.1 -> 1.0.0
npm run version:bump major
```

## 安装不同版本

### 普通用户（生产环境）

```bash
# 默认安装 latest 版本
tnpm install -g @alipay/dtazzicloud

# 或显式指定
tnpm install -g @alipay/dtazzicloud@latest
```

### 内部开发者（预发环境）

```bash
# 安装 pre 版本
tnpm install -g @alipay/dtazzicloud@pre
```

### 本地开发（开发环境）

```bash
# 安装 dev 版本
tnpm install -g @alipay/dtazzicloud@dev
```

## 查看当前版本

```bash
# 查看已安装版本
kanban --version

# 查看帮助（非生产环境会显示环境标识）
kanban --help
```

## 环境自动识别

dtazzicloud 会在运行时自动识别当前环境：

- **生产环境**: 不显示特殊标识
- **预发/开发环境**: 显示环境横幅提示

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🧪 预发环境
  版本: 0.0.3-pre.1711420800000
  预发布版本，用于内部测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```



## 工作流程建议

### 日常开发流程

1. **功能开发**: 在本地开发，使用 `npm run dev` 直接运行
2. **开发验证**: 发布 dev 版本到测试环境
   ```bash
   npm run publish:dev
   ```
3. **预发测试**: 功能稳定后发布 pre 版本
   ```bash
   npm run publish:pre
   ```
4. **生产发布**: 测试通过后发布正式版本
   ```bash
   npm run version:bump patch  # 可选：升级版本号
   npm run publish:prod
   ```

### 快捷别名（推荐）

在你的 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
# dtazzicloud 快捷别名
alias dtazzicloud-dev='tnpm install -g @alipay/dtazzicloud@dev && kanban'
alias dtazzicloud-pre='tnpm install -g @alipay/dtazzicloud@pre && kanban'
alias dtazzicloud-prod='tnpm install -g @alipay/dtazzicloud@latest && kanban'
```

## 注意事项

1. **生产发布前**: 确保所有测试通过，版本号正确
2. **预发版本**: 添加时间戳后缀，避免与生产版本冲突
3. **开发版本**: 适合快速迭代验证，版本号包含时间戳
4. **版本回滚**: 如需回滚，使用 `tnpm dist-tag` 命令重新指向旧版本

## 故障排查

### 查看所有可用版本

```bash
tnpm view @alipay/dtazzicloud versions
```

### 查看当前标签指向

```bash
tnpm dist-tag ls @alipay/dtazzicloud
```

### 手动设置标签

```bash
# 将 pre 标签指向特定版本
tnpm dist-tag add @alipay/dtazzicloud@0.0.3-pre.1711420800000 pre
```

### 清除版本缓存

如果版本检查出现问题，可以清除缓存：

```bash
# 重启应用会自动清除缓存
# 或手动删除缓存文件（如果存在）
```

## 技术实现

### 版本识别逻辑

```typescript
// 根据版本号识别环境
function detectEnv(version: string): EnvType {
  if (version.includes('-pre')) {
    return 'pre';
  }
  if (version.includes('-dev')) {
    return 'dev';
  }
  // 纯数字版本号视为生产环境
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return 'prod';
  }
  return 'unknown';
}
```

### 版本比较逻辑

支持带时间戳的预发布版本比较：
- `0.0.2` < `0.0.3-pre.1711420800000` < `0.0.3-pre.1711420900000` < `0.0.3`

