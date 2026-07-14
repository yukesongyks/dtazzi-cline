# 代码评审报告 - 优化海报圈选功能

## 评审概要
- **评审日期**: 2026-07-14
- **评审范围**: 海报圈选功能优化相关代码
- **评审文件数**: 13个文件
- **Blocker数量**: 5个
- **Critical数量**: 3个
- **Warning数量**: 4个

---

## Blocker级别问题 (必须修复)

### 1. [BLOCKER] 核心业务逻辑未实现
**文件**: `PosterSelectionServiceImpl.java` (行27-28, 34, 39-42, 73-74)  
**问题描述**: 多个核心方法只有TODO注释占位，没有实际业务实现：
```java
// addSelection方法
// TODO: 调用DAO保存数据
return 1L;  // 硬编码返回值

// querySelectionInfo方法
// TODO: 查询逻辑
return response;  // 空对象

// queryCrowdDetails方法
// TODO: 调用图灵平台API查询
return Collections.emptyList();
```

**影响**: 功能完全不可用，无法满足需求中的"投放范围圈选"和"图灵id批量粘贴"能力。  
**建议**: 完成DAO层开发后，实现完整的数据持久化和查询逻辑。

---

### 2. [BLOCKER] 黑白名单核心方法未实现
**文件**: `BlackWhiteListServiceImpl.java` (行33-34, 40, 45-46, 51)  
**问题描述**: 黑白名单的创建、更新、查询、删除方法均未实现，仅返回占位值：
```java
// createList方法
// TODO: 调用DAO保存
return 1L;

// updateList/queryListDetail/deleteList方法
// TODO: 更新/查询/删除逻辑
```

**影响**: 需求"黑白名单需要在前置发布时支持配置"无法落地。  
**建议**: 补充完整的数据持久化逻辑，包括状态管理。

---

### 3. [BLOCKER] 缺少DAO层依赖注入
**文件**: `PosterSelectionServiceImpl.java`, `BlackWhiteListServiceImpl.java`  
**问题描述**: 两个Service类均未注入任何DAO或Repository，无法进行数据库操作：
```java
@Service
public class PosterSelectionServiceImpl implements PosterSelectionService {
    // 无任何DAO注入
}
```

**影响**: 数据持久化层缺失，服务层无法完成CRUD操作。  
**建议**: 添加Mapper/Repository注入：
```java
@Autowired
private PosterSelectionMapper posterSelectionMapper;
```

---

### 4. [BLOCKER] 空指针风险 - dimensionValues未校验
**文件**: `PosterSelectionServiceImpl.java` (行96), `BlackWhiteListServiceImpl.java` (行27)  
**问题描述**: 直接调用`String.join`拼接可能为null的dimensionValues列表：
```java
selection.setDimensionValue(String.join(",", item.getDimensionValues()));
```

**影响**: 若前端传入dimensionValues为null，将抛出NPE。  
**建议**: 在validateRequest方法中增加维度值校验：
```java
if (item.getDimensionValues() == null || item.getDimensionValues().isEmpty()) {
    throw new IllegalArgumentException("维度值不能为空");
}
```

---

### 5. [BLOCKER] 类型安全性不足 - 枚举使用String类型
**文件**: `AddSelectionRequest.java` (行19, 31), `PosterSelection.java` (行22)  
**问题描述**: DTO和Entity中维度类型、圈选类型使用String而非枚举：
```java
private String selectionType;  // 应使用SelectionType枚举
private String dimensionType;   // 应使用DimensionType枚举
```

**影响**: 无法在编译期约束入参，可能导致非法值入库。  
**建议**: 改用枚举类型或添加@NotBlank + 正则校验。

---

## Critical级别问题

### 1. [CRITICAL] 缺少图灵平台API集成
**文件**: `PosterSelectionServiceImpl.java` (行72-75)  
**问题描述**: queryCrowdDetails方法标记为TODO，未实现图灵平台调用。  
**影响**: 需求"查询详情展示图灵人群信息（biztid、标签名称、设备数量和标签有效期）"无法实现。  
**建议**: 集成图灵平台API客户端，处理超时和降级逻辑。

---

### 2. [CRITICAL] 活动ID校验功能缺失
**文件**: 需求文档提及"活动ID支持校验，跟奖品ID一样可以检验出活动名称"  
**问题描述**: 代码中未发现活动ID校验相关接口和实现。  
**影响**: 无法满足立减活动信息查询回显需求。  
**建议**: 新增活动校验接口，对接活动中心API。

---

### 3. [CRITICAL] 错误处理机制不统一
**文件**: 所有Service实现类  
**问题描述**: 异常处理直接抛出IllegalArgumentException，未使用统一的业务异常类。  
**影响**: 前端无法区分业务异常和系统异常，用户体验差。  
**建议**: 定义业务异常类（如BizException），统一异常处理切面。

---

## Warning级别问题

### 1. [WARNING] 缺少单元测试
**文件**: 整个变更集  
**问题描述**: 未发现对应的单元测试文件。  
**影响**: 代码质量无法保障，回归风险高。  
**建议**: 补充核心方法的单元测试，覆盖边界条件。

---

### 2. [WARNING] 魔法值硬编码
**文件**: `PosterSelectionServiceImpl.java` (行17), `BlackWhiteListServiceImpl.java` (行28)  
**问题描述**: MAX_ID_COUNT=20和status=1为硬编码魔法值。  
**建议**: 提取到常量类或配置文件。

---

### 3. [WARNING] 缺少日志记录
**文件**: 所有Service实现类  
**问题描述**: 无任何日志输出，问题排查困难。  
**建议**: 关键节点添加日志（如Logger.info/error）。

---

### 4. [WARNING] 缺少接口文档
**问题描述**: 无Swagger/API文档注解。  
**建议**: 添加@Api、@ApiOperation等注解。

---

## 评审结论

### 整体评估
- **代码完成度**: 约20%（仅DTO/Entity/Enum结构完整，Service逻辑未实现）
- **可发布状态**: 不可发布，需完成所有Blocker修复
- **风险等级**: 高

### 阻塞项清单
1. ✅ 完成Service层所有TODO方法的实现
2. ✅ 添加DAO层注入并实现数据持久化
3. ✅ 修复dimensionValues空指针风险
4. ✅ 强化类型安全（枚举替代String）
5. ✅ 集成图灵平台API和活动校验API

### 建议后续步骤
1. 补充DAO层代码（Mapper/Repository）
2. 实现Service层业务逻辑
3. 集成外部API（图灵平台、活动中心）
4. 补充单元测试
5. 添加统一的异常处理和日志切面

---

## 附录：评审文件清单
- DTO: AddSelectionRequest, CreateBlackWhiteListRequest, ParseIdsDTO, SelectionDetailResponse
- Entity: ActivityRelation, BlackWhiteList, PosterSelection
- Enum: DimensionType, ListType, SelectionType
- Service: PosterSelectionService, BlackWhiteListService
- ServiceImpl: PosterSelectionServiceImpl, BlackWhiteListServiceImpl