# 团队周报系统代码评审报告

**评审日期**: 2026-07-13  
**评审范围**: src/server/modules/report/*, src/server/modules/statistics/router.ts  
**评审方式**: 静态代码审查（评审技能不可用，降级为静态审查）

---

## 一、API接口设计审查

### 1.1 需求符合性检查

| 需求 | API路径 | 实现状态 | 备注 |
|------|---------|----------|------|
| 需求1：创建草稿 | POST /api/reports | ✅ 符合 | report.router.ts:37-47 |
| 需求1：更新周报 | PUT /api/reports/:id | ✅ 符合 | report.router.ts:52-67 |
| 需求2：提交周报 | PUT /api/reports/:id/submit | ✅ 符合 | report.router.ts:72-86 |
| 需求3：查询列表 | GET /api/reports | ✅ 符合 | report.router.ts:91-107 |
| 需求3：审核周报 | PUT /api/reports/:id/audit | ✅ 符合 | report.router.ts:130-147 |
| 需求4：数据统计 | GET /api/statistics/weekly | ✅ 符合 | statistics/router.ts |

### 1.2 请求响应格式检查

**创建/更新接口**：
- ✅ 请求体：`{ thisWeekWork, nextWeekPlan, status }` 符合规格
- ✅ 响应体：`{ code: 200, data: { id, updatedAt }, msg }` 符合规格

**提交接口**：
- ✅ 请求体：`{}` 符合规格
- ✅ 成功响应：`{ code: 200, data: null, msg: "提交成功" }` 符合规格
- ✅ 失败响应：`{ code: 400, msg: "您本周已提交过周报" }` 符合规格

**查询接口**：
- ✅ 支持分页参数：page, size
- ✅ 支持状态筛选：status
- ✅ 响应体：`{ total, list }` 符合规格

**审核接口**：
- ✅ 请求体：`{ action: "APPROVE" }` 或 `{ action: "REJECT", rejectReason }` 符合规格

---

## 二、状态流转逻辑审查

### 2.1 状态机定义

```typescript
enum ReportStatus {
  DRAFT = 'DRAFT',      // 草稿
  PENDING = 'PENDING',  // 待审核
  APPROVED = 'APPROVED', // 已通过
  REJECTED = 'REJECTED'  // 已打回（实际回到DRAFT）
}
```

### 2.2 状态转换验证

| 操作 | 前置状态 | 目标状态 | 校验位置 | 结果 |
|------|----------|----------|----------|------|
| 更新周报 | DRAFT | DRAFT | service.ts:35 | ✅ 正确 |
| 提交周报 | DRAFT | PENDING | service.ts:58 | ✅ 正确 |
| 审核通过 | PENDING | APPROVED | service.ts:95 | ✅ 正确 |
| 审核打回 | PENDING | DRAFT | service.ts:101-104 | ✅ 正确 |

**状态机完整性**：
- ✅ 草稿 → 待审核：提交操作（service.ts:77）
- ✅ 待审核 → 已通过：审核通过（service.ts:96）
- ✅ 待审核 → 草稿：审核打回（service.ts:101-104）
- ✅ 所有状态转换均有前置状态检查，防止非法状态跳跃

### 2.3 边界条件检查

- ✅ 更新草稿：检查状态必须为DRAFT（service.ts:35）
- ✅ 提交周报：检查状态必须为DRAFT（service.ts:58）
- ✅ 审核周报：检查状态必须为PENDING（service.ts:91）
- ✅ 提交前校验内容长度≥10字（service.ts:63-68）

---

## 三、并发控制与幂等性审查

### 3.1 发现的问题

**🔴 严重：并发提交竞态条件**

**问题描述**：
在 `report.service.ts:71-78` 中，提交周报操作存在竞态条件：

```typescript
// 防重检查
const hasSubmitted = await reportRepository.hasSubmittedThisWeek(authorId)
if (hasSubmitted) {
  throw new Error('您本周已提交过周报')
}

// 更新状态为待审核
const updated = await reportRepository.update(id, { status: 'PENDING' })
```

**竞态场景**：
1. 用户A同时发起两次提交请求（请求1和请求2）
2. 请求1执行 `hasSubmittedThisWeek` 检查，返回false
3. 请求2同时执行 `hasSubmittedThisWeek` 检查，也返回false
4. 请求1更新状态为PENDING
5. 请求2也更新状态为PENDING
6. 结果：用户A本周提交了两次周报

**影响**：违反需求"检查该员工本周是否已提交过周报（防重）"

**建议修复**：
```typescript
// 方案1：数据库唯一约束（推荐）
// 在数据库层面添加唯一约束：(authorId, weekDate, status) WHERE status != 'DRAFT'

// 方案2：乐观锁
// 在update时添加条件：WHERE status = 'DRAFT' AND id = ?
const updated = await reportRepository.update(id, { status: 'PENDING' })
if (!updated) {
  throw new Error('周报已被提交或状态已变更')
}

// 方案3：分布式锁（适用于多实例部署）
// 使用Redis分布式锁：LOCK:key = `report:submit:${authorId}`
```

### 3.2 幂等性检查

- ✅ 创建草稿：幂等（自动查找已有草稿并更新，service.ts:14-24）
- 🔴 提交周报：非幂等（存在竞态条件）
- ✅ 审核周报：幂等（状态检查防止重复审核，service.ts:91）

---

## 四、权限控制审查

### 4.1 权限检查实现

| 操作 | 权限检查 | 实现位置 | 结果 |
|------|----------|----------|------|
| 提交周报 | 仅作者可提交 | service.ts:53 | ✅ 正确 |
| 审核周报 | 仅主管可审核 | router.ts:135 | ✅ 正确 |
| 查询列表 | 员工只能查自己的周报 | router.ts:98 | ✅ 正确 |

**代码片段**：
```typescript
// 提交权限检查（service.ts:53）
if (report.authorId !== authorId) {
  throw new Error('无权提交此周报')
}

// 审核权限检查（router.ts:135）
if (user.role !== 'MANAGER') {
  return res.status(403).json(fail('无权审核周报'))
}

// 查询权限控制（router.ts:98）
authorId: user.role === 'EMPLOYEE' ? user.id : req.query.authorId as string
```

### 4.2 潜在安全风险

**⚠️ 中等：更新接口缺少权限检查**

**问题**：`PUT /api/reports/:id` 更新接口未检查用户是否为周报作者

**影响**：任何用户都可以更新其他用户的周报（只要知道周报ID）

**建议修复**：
```typescript
// report.router.ts:52-67 添加权限检查
router.put('/:id', async (req, res) => {
  try {
    const user = getAuthUser(req)
    const id = parseInt(req.params.id)
    
    // 添加权限检查：只有作者可以更新
    const existing = await reportService.findById(id)
    if (!existing) {
      return res.status(404).json(fail('周报不存在'))
    }
    if (existing.authorId !== user.id) {
      return res.status(403).json(fail('无权修改此周报'))
    }
    
    const report = await reportService.update(id, req.body)
    // ...
  }
})
```

**⚠️ 中等：模拟认证中间件**

**问题**：`getAuthUser` 函数从请求头获取用户信息，无签名验证

**影响**：客户端可伪造任意用户身份

**建议**：替换为真实的JWT或Session认证中间件

---

## 五、数据统计聚合逻辑审查

### 5.1 统计实现

**位置**：report.repository.ts:110-131

**逻辑验证**：
- ✅ 统计已提交人数（排除草稿状态）
- ✅ 统计已通过人数（状态为APPROVED）
- ✅ 使用Set去重，防止同一用户多份周报重复计数

**代码片段**：
```typescript
const countedAuthors = new Set<string>()

for (const report of reports.values()) {
  if (report.weekDate === weekDate && !countedAuthors.has(report.authorId)) {
    if (report.status !== 'DRAFT') {
      submittedMembers++
      if (report.status === 'APPROVED') {
        approvedMembers++
      }
    }
    countedAuthors.add(report.authorId)
  }
}
```

### 5.2 计算正确性

- ✅ 提交率 = submittedMembers / totalMembers（service.ts:142）
- ✅ 审核通过率 = approvedMembers / submittedMembers（service.ts:143）
- ✅ 除零保护：totalMembers和submittedMembers为0时的处理

---

## 六、其他问题发现

### 6.1 类型安全

**⚠️ 低：未使用的导入**

`report.repository.ts:6` 导入了uuid但未使用：
```typescript
import { v4 as uuidv4 } from 'uuid'  // 未使用
```

**建议**：移除未使用的导入

### 6.2 错误处理

**⚠️ 低：错误信息泄露**

`report.router.ts:45,65,80` 等处直接返回 `error.message`，可能泄露敏感信息

**建议**：使用统一的错误处理中间件，区分开发/生产环境

### 6.3 代码质量

- ✅ 代码结构清晰，分层合理（Router -> Service -> Repository）
- ✅ 注释充分，易于理解
- ✅ 统一的响应格式封装（success/fail函数）

---

## 七、评审结论

### 7.1 问题汇总

| 级别 | 问题 | 影响 | 建议优先级 |
|------|------|------|-----------|
| 🔴 严重 | 并发提交竞态条件 | 违反防重需求，可能导致重复提交 | P0（必须修复） |
| ⚠️ 中等 | 更新接口缺少权限检查 | 任何用户可修改其他用户周报 | P1（建议修复） |
| ⚠️ 中等 | 模拟认证中间件 | 客户端可伪造身份 | P1（生产环境前修复） |
| ⚠️ 低 | 未使用的导入 | 代码冗余 | P2（可选） |
| ⚠️ 低 | 错误信息泄露 | 安全风险 | P2（建议修复） |

### 7.2 符合需求的部分

✅ API接口设计完全符合需求规格  
✅ 状态流转逻辑正确，无非法状态跳跃  
✅ 提交前校验逻辑完整（内容长度、防重检查）  
✅ 审核权限控制正确  
✅ 数据统计聚合逻辑正确  
✅ 代码结构清晰，易于维护  

### 7.3 建议

**必须修复（P0）**：
1. 修复并发提交竞态条件（建议使用数据库唯一约束或乐观锁）

**建议修复（P1）**：
1. 为更新接口添加权限检查
2. 替换模拟认证中间件为真实认证方案

**可选优化（P2）**：
1. 移除未使用的导入
2. 完善错误处理，避免敏感信息泄露

---

**评审人**: AI Code Reviewer  
**评审方式**: 静态代码审查（评审技能不可用，降级执行）