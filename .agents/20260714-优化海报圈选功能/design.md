# 系统分析设计文档 - 优化海报圈选功能

## 1. 需求概述

### 1.1 背景
随着N大促多类活动并行，对海报圈选能力和叠加规则有了更高的要求，需要优化圈选维度、黑白名单配置、批量操作等能力。

### 1.2 核心优化点
1. **圈选黑名单/白名单多维度支持**：支持门店和设备维度的多选
2. **前置配置能力**：黑白名单需要在前置发布时支持配置
3. **详情展示优化**：查询详情时需要展示圈选维度
4. **批量粘贴支持**：图灵ID支持批量粘贴
5. **活动ID校验**：活动ID支持校验，可查询出活动名称

### 1.3 需求模块清单

| 模块 | 具体需求 |
|------|---------|
| 新建/编辑投放计划 | 投放范围：全局圈选支持多维度及多选，和批量粘贴能力<br>支持黑白名单配置<br>立减活动信息支持查询回显 |
| 查看投放计划 | 圈选、活动信息支持查看 |

---

## 2. 功能模块设计

### 2.1 投放范围圈选模块

#### 2.1.1 全局圈选（原图灵圈选）
- **圈选类型**：
  - 全局圈选
  - 设备黑名单
  - 设备白名单

- **圈选维度**：
  - bizTid（图灵人群ID）
  - 数字化门店ID

- **功能特性**：
  - 支持多选（最多20个）
  - 支持批量粘贴（英文逗号分隔）
  - 前端自动识别并拆分多个ID
  - 分页展示

- **查询能力**：
  - 点击查询后展示图灵人群信息
  - 信息包括：bizTid、标签名称、设备数量、标签有效期
  - 多个ID时支持"查看更多"

#### 2.1.2 设备黑白名单
- **来源**：从发布管理的添加黑白名单迁移
- **维度**：与全局圈选保持一致（bizTid、数字化门店ID）
- **交互逻辑**：与全局圈选相同
- **二次修改**：支持发布后二次修改，回显创建时配置的信息

### 2.2 立减活动配置模块

#### 2.2.1 中心化立减进度小程序
- 输入立减活动ID
- 查询活动信息并回显
- 展示活动名称等详情

#### 2.2.2 整点立减活动海报
- 输入立减活动ID
- 查询活动信息并回显
- 支持活动ID校验

### 2.3 查看投放计划模块
- 投放范围展示：同创编页，支持全部查看
- 圈选信息展示
- 活动信息展示

---

## 3. 系统架构设计

### 3.1 架构层次
```
┌─────────────────────────────────────────┐
│            前端展示层 (Web UI)            │
│  - 圈选配置页面                           │
│  - 黑白名单管理                           │
│  - 活动信息查询                           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│           业务服务层 (Service)            │
│  - PosterSelectionService               │
│  - BlackWhiteListService                │
│  - ActivityQueryService                 │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│           数据访问层 (DAO)                │
│  - PosterSelectionDAO                   │
│  - BlackWhiteListDAO                    │
│  - ActivityDAO                          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         外部系统接口 (External API)       │
│  - 图灵平台 API                          │
│  - 活动中心 API                          │
└─────────────────────────────────────────┘
```

### 3.2 核心服务

#### 3.2.1 PosterSelectionService
- 职责：处理海报圈选相关业务逻辑
- 主要方法：
  - `addSelection()` - 添加圈选配置
  - `updateSelection()` - 更新圈选配置
  - `querySelectionInfo()` - 查询圈选详情
  - `batchParseIds()` - 批量解析ID

#### 3.2.2 BlackWhiteListService
- 职责：管理设备黑白名单
- 主要方法：
  - `createBlackList()` - 创建黑名单
  - `createWhiteList()` - 创建白名单
  - `updateList()` - 更新名单
  - `queryListDetail()` - 查询名单详情

#### 3.2.3 ActivityQueryService
- 职责：活动信息查询与校验
- 主要方法：
  - `queryActivityInfo()` - 查询活动信息
  - `validateActivityId()` - 校验活动ID

---

## 4. 数据模型设计

### 4.1 圈选配置表 (poster_selection)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT | 主键 |
| plan_id | BIGINT | 投放计划ID |
| selection_type | VARCHAR(32) | 圈选类型：GLOBAL/BLACK_LIST/WHITE_LIST |
| dimension_type | VARCHAR(32) | 维度类型：BIZ_TID/STORE_ID |
| dimension_value | VARCHAR(512) | 维度值（多个以逗号分隔） |
| create_time | DATETIME | 创建时间 |
| update_time | DATETIME | 更新时间 |
| creator | VARCHAR(64) | 创建人 |
| updater | VARCHAR(64) | 更新人 |

### 4.2 黑白名单表 (black_white_list)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT | 主键 |
| plan_id | BIGINT | 投放计划ID |
| list_type | VARCHAR(16) | 名单类型：BLACK/WHITE |
| dimension_type | VARCHAR(32) | 维度类型：BIZ_TID/STORE_ID |
| dimension_value | VARCHAR(512) | 维度值（多个以逗号分隔） |
| status | TINYINT | 状态：0-无效，1-有效 |
| create_time | DATETIME | 创建时间 |
| update_time | DATETIME | 更新时间 |
| creator | VARCHAR(64) | 创建人 |

### 4.3 活动信息关联表 (activity_relation)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT | 主键 |
| plan_id | BIGINT | 投放计划ID |
| activity_id | VARCHAR(64) | 活动ID |
| activity_name | VARCHAR(256) | 活动名称 |
| activity_type | VARCHAR(32) | 活动类型 |
| create_time | DATETIME | 创建时间 |
| update_time | DATETIME | 更新时间 |

---

## 5. 接口设计

### 5.1 圈选配置接口

#### 5.1.1 添加圈选配置
```
POST /api/poster/selection/add
```

**请求参数**：
```json
{
  "planId": 12345,
  "selectionType": "GLOBAL",
  "selectionItems": [
    {
      "dimensionType": "BIZ_TID",
      "dimensionValues": ["bizTid1", "bizTid2"]
    },
    {
      "dimensionType": "STORE_ID",
      "dimensionValues": ["store1", "store2"]
    }
  ]
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "selectionId": 67890
  }
}
```

#### 5.1.2 批量解析ID
```
POST /api/poster/selection/parseIds
```

**请求参数**：
```json
{
  "idsInput": "id1,id2,id3,id4,id5"
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "ids": ["id1", "id2", "id3", "id4", "id5"],
    "count": 5
  }
}
```

#### 5.1.3 查询圈选详情
```
GET /api/poster/selection/query?planId={planId}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "planId": 12345,
    "selections": [
      {
        "selectionType": "GLOBAL",
        "items": [
          {
            "dimensionType": "BIZ_TID",
            "dimensionValues": ["bizTid1", "bizTid2"],
            "details": [
              {
                "bizTid": "bizTid1",
                "labelName": "人群标签A",
                "deviceCount": 10000,
                "validPeriod": "2026-07-01 ~ 2026-12-31"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 5.2 黑白名单接口

#### 5.2.1 创建黑白名单
```
POST /api/poster/blackWhiteList/create
```

**请求参数**：
```json
{
  "planId": 12345,
  "listType": "BLACK",
  "items": [
    {
      "dimensionType": "BIZ_TID",
      "dimensionValues": ["bizTid1", "bizTid2"]
    }
  ]
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "listId": 11111
  }
}
```

#### 5.2.2 更新黑白名单
```
POST /api/poster/blackWhiteList/update
```

**请求参数**：
```json
{
  "listId": 11111,
  "items": [
    {
      "dimensionType": "BIZ_TID",
      "dimensionValues": ["bizTid1", "bizTid2", "bizTid3"]
    }
  ]
}
```

### 5.3 活动信息接口

#### 5.3.1 查询活动信息
```
GET /api/activity/query?activityId={activityId}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "activityId": "act123",
    "activityName": "双十一大促立减活动",
    "activityType": "DISCOUNT",
    "startTime": "2026-11-01 00:00:00",
    "endTime": "2026-11-11 23:59:59",
    "status": "ACTIVE"
  }
}
```

#### 5.3.2 校验活动ID
```
POST /api/activity/validate
```

**请求参数**：
```json
{
  "activityId": "act123"
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "valid": true,
    "activityName": "双十一大促立减活动"
  }
}
```

---

## 6. 交互流程设计

### 6.1 新建投放计划 - 圈选配置流程

```
用户进入新建投放计划页面
    ↓
选择圈选类型（全局圈选/设备黑名单/设备白名单）
    ↓
选择维度类型（bizTid/数字化门店ID）
    ↓
【批量粘贴或逐个输入ID】
    ↓
前端校验：
  - 识别英文逗号分隔
  - 自动拆分为多个ID
  - 校验数量上限（≤20）
  - 分页展示
    ↓
点击"查询"按钮
    ↓
调用后端接口批量查询图灵人群信息
    ↓
展示查询结果：
  - bizTid
  - 标签名称
  - 设备数量
  - 标签有效期
    ↓
若有多个ID，展示"查看更多"链接
    ↓
用户确认配置，提交保存
```

### 6.2 黑白名单二次修改流程

```
用户进入已发布的投放计划详情页
    ↓
点击"编辑黑白名单"
    ↓
系统回显创建时配置的信息：
  - 已配置的维度类型
  - 已配置的维度值列表
    ↓
用户修改配置
    ↓
提交更新请求
    ↓
后端更新黑白名单数据
    ↓
返回更新结果
```

### 6.3 活动ID校验流程

```
用户输入活动ID
    ↓
前端实时校验格式
    ↓
用户点击"查询"或"校验"按钮
    ↓
调用活动查询/校验接口
    ↓
后端调用活动中心API
    ↓
返回活动信息：
  - 活动ID有效
  - 活动名称
  - 其他活动详情
    ↓
前端展示活动信息
```

---

## 7. 技术实现要点

### 7.1 前端实现

#### 7.1.1 批量粘贴解析
```javascript
// 解析逗号分隔的ID
function parseBatchIds(input) {
  const ids = input.split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
  
  // 校验数量上限
  if (ids.length > 20) {
    return {
      success: false,
      message: '最多支持20个ID'
    };
  }
  
  return {
    success: true,
    ids: ids,
    count: ids.length
  };
}
```

#### 7.1.2 分页展示
- 使用虚拟滚动或分页组件
- 每页展示固定数量（如10个）
- 支持快速跳转

#### 7.1.3 实时校验
- 使用防抖机制（debounce）
- 输入延迟300ms后触发校验

### 7.2 后端实现

#### 7.2.1 批量查询优化
- 使用批量查询接口
- 支持异步查询
- 结果缓存策略

#### 7.2.2 数据一致性
- 黑白名单更新使用事务
- 版本号控制并发更新

#### 7.2.3 异常处理
- 外部接口调用超时处理
- 部分失败降级展示
- 错误信息友好提示

### 7.3 性能优化

#### 7.3.1 前端优化
- 列表虚拟滚动
- 懒加载图灵人群详情
- 缓存已查询的结果

#### 7.3.2 后端优化
- 批量查询合并请求
- Redis缓存图灵人群信息
- 异步查询非关键信息

---

## 8. 风险与应对

### 8.1 技术风险

| 风险项 | 影响 | 应对措施 |
|--------|------|---------|
| 图灵平台接口超时 | 圈选查询失败 | 设置超时时间，提供重试机制，降级展示基本信息 |
| 批量ID数量过多 | 性能下降 | 限制单次最多20个，前端分页，后端异步查询 |
| 黑白名单并发更新 | 数据不一致 | 使用乐观锁，版本号控制 |

### 8.2 业务风险

| 风险项 | 影响 | 应对措施 |
|--------|------|---------|
| 活动ID校验失败 | 用户体验下降 | 提供友好的错误提示，建议检查活动ID |
| 黑白名单误配置 | 投放范围错误 | 提供预览功能，二次确认机制 |

---

## 9. 测试要点

### 9.1 功能测试

#### 9.1.1 圈选配置测试
- 单个ID添加
- 批量粘贴（逗号分隔）
- 边界值测试（20个上限）
- 超出上限提示

#### 9.1.2 黑白名单测试
- 创建黑白名单
- 二次修改
- 数据回显

#### 9.1.3 活动信息测试
- 活动ID校验
- 活动信息查询
- 无效活动ID处理

### 9.2 性能测试
- 批量查询响应时间
- 分页加载性能
- 并发更新压力测试

### 9.3 兼容性测试
- 主流浏览器兼容性
- 移动端适配

---

## 10. 上线计划

### 10.1 发布阶段
1. **灰度发布**：先开放给部分用户，验证功能
2. **全量发布**：确认无问题后全量上线
3. **数据迁移**：历史黑白名单数据迁移

### 10.2 回滚方案
- 功能开关控制
- 数据库版本回滚脚本
- 前端版本回滚

---

## 11. 附录

### 11.1 术语表

| 术语 | 说明 |
|------|------|
| bizTid | 图灵人群ID |
| 数字化门店ID | 门店的唯一标识 |
| 全局圈选 | 针对全部用户的圈选 |
| 黑白名单 | 设备维度的过滤名单 |

### 11.2 参考文档
- 图灵平台API文档
- 活动中心接口规范
- 前端组件库文档