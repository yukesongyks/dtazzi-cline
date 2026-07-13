# 团队周报系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现员工创建/提交周报、主管审核周报、团队数据统计的完整功能闭环，支持自动保存、状态流转和权限控制。

**Architecture:** 采用前后端分离架构。后端提供RESTful API，使用乐观锁解决并发冲突，幂等键防止重复提交，拦截器实现越权防护。前端实现自动保存机制（失焦触发+30秒定时），支持本地缓存和网络异常重试。

**Tech Stack:** 
- 后端: Java 17+ / Spring Boot 3.x / JPA + Hibernate / Redis (幂等键缓存)
- 数据库: PostgreSQL 14+ / MySQL 8+
- 前端: React 18+ / TypeScript / Tailwind CSS / Radix UI

---

## Global Constraints

[从规格文档提取的项目级约束，每个任务隐式包含]

- 周报状态机: `DRAFT` → `PENDING` → `APPROVED`（打回返回`DRAFT`）
- 并发控制: 采用乐观锁(`version`字段)，冲突时返回`409 Conflict`
- 幂等性: 提交操作需幂等键+Redis缓存，防止重复提交
- 性能要求: 自动保存响应时间 < 500ms，列表查询 < 300ms，统计查询 < 1s
- 软删除: 数据库记录使用`deletedAt`字段，支持恢复误删数据
- 权限控制: 周报仅作者可编辑/提交，仅主管可审核，需拦截越权访问
- API格式: 统一响应结构 `{ "code": 200, "data": {...}, "msg": "..." }`

---

## Task 1: 数据库模型设计

**Files:**
- Create: `src/main/java/com/team/report/entity/Report.java`
- Create: `src/main/java/com/team/report/entity/User.java`
- Create: `src/main/java/com/team/report/entity/enums/ReportStatus.java`
- Create: `src/main/resources/db/migration/V1__init_schema.sql` (Flyway迁移)

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: 
  - `Report`实体: 包含字段`id`, `authorId`, `thisWeekWork`, `nextWeekPlan`, `status`, `version`, `rejectReason`, `weekStartDate`, `createdAt`, `updatedAt`, `deletedAt`
  - `User`实体: 包含字段`id`, `name`, `role`, `teamId`, `createdAt`, `updatedAt`
  - `ReportStatus`枚举: `DRAFT`, `PENDING`, `APPROVED`

- [ ] **Step 1: 编写实体测试**

```java
@Test
void shouldCreateReportWithAllFields() {
    Report report = Report.builder()
        .authorId(1L)
        .thisWeekWork("完成需求分析")
        .nextWeekPlan("开始开发")
        .status(ReportStatus.DRAFT)
        .weekStartDate(LocalDate.of(2026, 7, 13))
        .build();
    
    assertThat(report.getStatus()).isEqualTo(ReportStatus.DRAFT);
    assertThat(report.getVersion()).isNull(); // 新建时为null
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=ReportEntityTest -v`
Expected: FAIL with "Report class not found"

- [ ] **Step 3: 实现实体类**

```java
@Entity
@Table(name = "reports")
@Where(clause = "deleted_at IS NULL")
public class Report {
    @Id @GeneratedValue(strategy = IDENTITY)
    private Long id;
    
    private Long authorId;
    private String thisWeekWork;
    private String nextWeekPlan;
    
    @Enumerated(STRING)
    private ReportStatus status;
    
    @Version
    private Long version;
    
    private String rejectReason;
    private LocalDate weekStartDate;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=ReportEntityTest -v`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/main/java/com/team/report/entity/
git commit -m "feat(report): add Report and User entities with soft delete"
```

---

## Task 2: 周报管理API（创建与更新）

**Files:**
- Create: `src/main/java/com/team/report/controller/ReportController.java`
- Create: `src/main/java/com/team/report/service/ReportService.java`
- Create: `src/main/java/com/team/report/dto/SaveReportRequest.java`
- Create: `src/test/java/com/team/report/controller/ReportControllerTest.java`

**Interfaces:**
- Consumes: `Report`实体（Task 1）
- Produces:
  - `POST /api/reports` → 创建周报，返回`{ "code": 200, "data": { "id": 101, "updatedAt": "..." } }`
  - `PUT /api/reports/{id}` → 更新周报，支持乐观锁校验

- [ ] **Step 1: 编写创建周报测试**

```java
@Test
void shouldCreateDraftReport() throws Exception {
    SaveReportRequest request = new SaveReportRequest(
        "本周完成需求分析",
        "下周开始开发",
        "DRAFT"
    );
    
    mockMvc.perform(post("/api/reports")
        .contentType(APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value(200))
        .andExpect(jsonPath("$.data.id").exists());
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=ReportControllerTest -v`
Expected: FAIL with "404 Not Found"

- [ ] **Step 3: 实现Controller和Service**

```java
@RestController
@RequestMapping("/api/reports")
public class ReportController {
    @PostMapping
    public ApiResponse<SaveReportResponse> createReport(
        @RequestBody @Valid SaveReportRequest request,
        @CurrentUser Long userId
    ) {
        Report report = reportService.createDraft(userId, request);
        return ApiResponse.success(new SaveReportResponse(report.getId(), report.getUpdatedAt()));
    }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=ReportControllerTest -v`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/main/java/com/team/report/controller/ src/main/java/com/team/report/service/
git commit -m "feat(report): add create and update report APIs with optimistic locking"
```

---

## Task 3: 周报提交API（状态流转与幂等性）

**Files:**
- Create: `src/main/java/com/team/report/service/IdempotencyService.java`
- Modify: `src/main/java/com/team/report/controller/ReportController.java` (添加submit端点)
- Modify: `src/main/java/com/team/report/service/ReportService.java` (添加submit逻辑)
- Create: `src/test/java/com/team/report/service/IdempotencyServiceTest.java`

**Interfaces:**
- Consumes: `Report`实体（Task 1），Redis连接
- Produces:
  - `PUT /api/reports/{id}/submit` → 提交周报，状态流转`DRAFT`→`PENDING`
  - 幂等性校验: 使用幂等键在Redis中缓存，防止重复提交

- [ ] **Step 1: 编写幂等性服务测试**

```java
@Test
void shouldReturnTrueForFirstSubmit() {
    String idempotencyKey = "submit-report-101-" + Instant.now().getEpochSecond();
    boolean isFirst = idempotencyService.checkAndSet(idempotencyKey, Duration.ofMinutes(5));
    assertThat(isFirst).isTrue();
}

@Test
void shouldReturnFalseForDuplicateSubmit() {
    String key = "submit-report-101-" + Instant.now().getEpochSecond();
    idempotencyService.checkAndSet(key, Duration.ofMinutes(5));
    boolean isDuplicate = idempotencyService.checkAndSet(key, Duration.ofMinutes(5));
    assertThat(isDuplicate).isFalse();
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=IdempotencyServiceTest -v`
Expected: FAIL with "IdempotencyService not found"

- [ ] **Step 3: 实现幂等性服务**

```java
@Service
public class IdempotencyService {
    private final RedisTemplate<String, String> redisTemplate;
    
    public boolean checkAndSet(String key, Duration ttl) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(key, "1", ttl)
        );
    }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=IdempotencyServiceTest -v`
Expected: PASS

- [ ] **Step 5: 实现提交端点**

```java
@PutMapping("/{id}/submit")
public ApiResponse<Void> submitReport(
    @PathVariable Long id,
    @RequestHeader("X-Idempotency-Key") String idempotencyKey,
    @CurrentUser Long userId
) {
    reportService.submit(id, userId, idempotencyKey);
    return ApiResponse.success(null, "提交成功");
}
```

- [ ] **Step 6: 提交代码**

```bash
git add src/main/java/com/team/report/
git commit -m "feat(report): add submit API with idempotency check and status validation"
```

---

## Task 4: 周报审核API（查询与操作）

**Files:**
- Modify: `src/main/java/com/team/report/controller/ReportController.java` (添加audit端点)
- Create: `src/main/java/com/team/report/dto/AuditReportRequest.java`
- Create: `src/main/java/com/team/report/dto/ReportListResponse.java`
- Create: `src/test/java/com/team/report/controller/ReportAuditTest.java`

**Interfaces:**
- Consumes: `Report`实体（Task 1）
- Produces:
  - `GET /api/reports?page=1&size=10&status=PENDING` → 分页查询周报列表
  - `PUT /api/reports/{id}/audit` → 审核周报，`action=APPROVE`或`REJECT`

- [ ] **Step 1: 编写审核测试**

```java
@Test
void shouldApproveReport() throws Exception {
    AuditReportRequest request = new AuditReportRequest("APPROVE", null);
    
    mockMvc.perform(put("/api/reports/101/audit")
        .contentType(APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.msg").value("审核成功"));
}

@Test
void shouldRejectReportWithReason() throws Exception {
    AuditReportRequest request = new AuditReportRequest("REJECT", "内容太简略");
    
    mockMvc.perform(put("/api/reports/101/audit")
        .contentType(APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk());
    
    Report report = reportRepository.findById(101L).orElseThrow();
    assertThat(report.getStatus()).isEqualTo(DRAFT);
    assertThat(report.getRejectReason()).isEqualTo("内容太简略");
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=ReportAuditTest -v`
Expected: FAIL with "404 Not Found"

- [ ] **Step 3: 实现审核逻辑**

```java
@PutMapping("/{id}/audit")
public ApiResponse<Void> auditReport(
    @PathVariable Long id,
    @RequestBody @Valid AuditReportRequest request,
    @CurrentUser Long supervisorId
) {
    reportService.audit(id, supervisorId, request);
    return ApiResponse.success(null, "审核成功");
}

// Service层
public void audit(Long reportId, Long supervisorId, AuditReportRequest request) {
    Report report = reportRepository.findById(reportId)
        .orElseThrow(() -> new NotFoundException("周报不存在"));
    
    if (request.getAction() == APPROVE) {
        report.setStatus(APPROVED);
    } else {
        report.setStatus(DRAFT);
        report.setRejectReason(request.getRejectReason());
    }
    reportRepository.save(report);
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=ReportAuditTest -v`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/main/java/com/team/report/
git commit -m "feat(report): add audit API with approve/reject actions"
```

---

## Task 5: 数据统计API（聚合计算）

**Files:**
- Create: `src/main/java/com/team/report/controller/StatisticsController.java`
- Create: `src/main/java/com/team/report/service/StatisticsService.java`
- Create: `src/main/java/com/team/report/dto/WeeklyStatisticsResponse.java`

**Interfaces:**
- Consumes: `Report`和`User`实体（Task 1）
- Produces:
  - `GET /api/statistics/weekly?weekDate=2026-07-13` → 返回团队周报统计数据

- [ ] **Step 1: 编写统计测试**

```java
@Test
void shouldCalculateWeeklyStatistics() throws Exception {
    mockMvc.perform(get("/api/statistics/weekly")
        .param("weekDate", "2026-07-13"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.submitRate").value(0.85))
        .andExpect(jsonPath("$.data.approvalRate").value(0.95));
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=StatisticsControllerTest -v`
Expected: FAIL with "404 Not Found"

- [ ] **Step 3: 实现统计逻辑**

```java
@GetMapping("/weekly")
public ApiResponse<WeeklyStatisticsResponse> getWeeklyStatistics(
    @RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate weekDate
) {
    WeeklyStatisticsResponse stats = statisticsService.calculate(weekDate);
    return ApiResponse.success(stats);
}

// Service层聚合查询
public WeeklyStatisticsResponse calculate(LocalDate weekDate) {
    Long totalMembers = userRepository.countByTeamId(currentUserTeamId);
    Long submittedMembers = reportRepository.countDistinctAuthorByWeek(weekDate);
    Long approvedReports = reportRepository.countByStatusAndWeek(APPROVED, weekDate);
    
    return new WeeklyStatisticsResponse(
        (double) submittedMembers / totalMembers,
        (double) approvedReports / submittedMembers,
        totalMembers,
        submittedMembers
    );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=StatisticsControllerTest -v`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/main/java/com/team/report/
git commit -m "feat(statistics): add weekly statistics API with aggregation queries"
```

---

## Task 6: 前端页面开发

**Files:**
- Create: `src/pages/ReportEditPage.tsx` (周报编辑页)
- Create: `src/pages/ReportListPage.tsx` (周报审核列表页)
- Create: `src/pages/StatisticsPage.tsx` (数据看板页)
- Create: `src/hooks/useAutoSave.ts` (自动保存Hook)
- Create: `src/components/ReportForm.tsx` (周报表单组件)

**Interfaces:**
- Consumes: 后端API（Task 2-5）
- Produces:
  - 周报编辑页: 支持自动保存（失焦触发+30秒定时），本地缓存异常处理
  - 审核列表页: 支持状态筛选、分页、通过/打回操作
  - 数据看板: 展示提交率、通过率、趋势图表

- [ ] **Step 1: 编写自动保存Hook测试**

```typescript
describe('useAutoSave', () => {
  it('should save on blur', async () => {
    const onSave = jest.fn();
    const { result } = renderHook(() => useAutoSave(onSave, 30000));
    
    act(() => result.current.handleBlur());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- useAutoSave.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 实现自动保存Hook**

```typescript
export function useAutoSave(onSave: () => Promise<void>, interval: number) {
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => {
      onSave().catch(console.error);
    }, interval);
    return () => clearInterval(timer);
  }, [interval]);
  
  const handleBlur = async () => {
    setIsSaving(true);
    await onSave();
    setIsSaving(false);
  };
  
  return { isSaving, handleBlur };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- useAutoSave.test.ts`
Expected: PASS

- [ ] **Step 5: 实现页面组件**

```typescript
// ReportEditPage.tsx
export function ReportEditPage() {
  const [form, setForm] = useState({ thisWeekWork: '', nextWeekPlan: '' });
  const { isSaving, handleBlur } = useAutoSave(() => saveReport(form), 30000);
  
  return (
    <div className="p-6">
      <h1>周报编辑</h1>
      <ReportForm form={form} onChange={setForm} onBlur={handleBlur} />
      {isSaving && <span className="text-sm text-gray-500">保存中...</span>}
    </div>
  );
}
```

- [ ] **Step 6: 提交代码**

```bash
git add src/pages/ src/hooks/ src/components/
git commit -m "feat(frontend): add report edit, audit list, and statistics pages"
```

---

## Task 7: 安全防护与测试验证

**Files:**
- Create: `src/main/java/com/team/report/security/ReportAccessInterceptor.java`
- Create: `src/main/java/com/team/report/exception/GlobalExceptionHandler.java`
- Modify: `src/main/java/com/team/report/config/WebMvcConfig.java` (注册拦截器)
- Create: `src/test/java/com/team/report/security/AccessControlTest.java`

**Interfaces:**
- Consumes: `Report`实体（Task 1）
- Produces:
  - 拦截器: 校验周报访问权限，防止越权访问
  - 异常处理器: 统一处理异常，返回标准错误响应

- [ ] **Step 1: 编写越权访问测试**

```java
@Test
void shouldRejectUnauthorizedAccess() throws Exception {
    // 用户A尝试访问用户B的周报
    mockMvc.perform(get("/api/reports/101")
        .header("X-User-Id", "999")) // 用户B的ID
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.msg").value("无权访问此周报"));
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=AccessControlTest -v`
Expected: FAIL with "Expected 403, got 200"

- [ ] **Step 3: 实现拦截器**

```java
@Component
public class ReportAccessInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Long reportId = extractReportId(request);
        Long currentUserId = getCurrentUserId(request);
        
        Report report = reportRepository.findById(reportId).orElseThrow();
        if (!report.getAuthorId().equals(currentUserId)) {
            throw new ForbiddenException("无权访问此周报");
        }
        return true;
    }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=AccessControlTest -v`
Expected: PASS

- [ ] **Step 5: 端到端验证**

Run: `mvn test` (运行全部测试)
Expected: All tests PASS

- [ ] **Step 6: 提交代码**

```bash
git add src/main/java/com/team/report/security/ src/main/java/com/team/report/exception/
git commit -m "feat(security): add access control interceptor and global exception handler"
```

---

## 验收标准

- [ ] 员工能够创建、编辑并提交周报，自动保存功能正常
- [ ] 主管能够查看周报列表（支持筛选和分页），并执行通过/打回操作
- [ ] 系统能够正确计算并展示团队统计数据
- [ ] 所有API接口符合规格文档定义的请求/响应格式
- [ ] 并发冲突、重复提交、越权访问等安全风险得到有效防护
- [ ] 性能指标达标：自动保存 < 500ms，列表查询 < 300ms，统计查询 < 1s