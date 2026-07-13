/**
 * 周报 HTTP 路由
 */

import express from 'express'
import { reportService } from './report.service'
import type { CreateReportInput, UpdateReportInput, AuditReportInput, ReportQueryInput } from './types'

const router = express.Router()

// 模拟用户认证中间件（实际项目中应替换为真实认证）
function getAuthUser(req: express.Request): { id: string; name: string; role: 'EMPLOYEE' | 'MANAGER' } {
  // 从请求头或session中获取用户信息
  const userId = req.headers['x-user-id'] as string || 'user-001'
  const userName = req.headers['x-user-name'] as string || '测试员工'
  const role = (req.headers['x-user-role'] as string) || 'EMPLOYEE'
  
  return {
    id: userId,
    name: userName,
    role: role as 'EMPLOYEE' | 'MANAGER'
  }
}

// 统一响应格式
function success<T>(data: T, msg: string = '操作成功') {
  return { code: 200, data, msg }
}

function fail(msg: string, code: number = 400) {
  return { code, data: null, msg }
}

/**
 * POST /api/reports - 创建周报草稿
 */
router.post('/', async (req, res) => {
  try {
    const user = getAuthUser(req)
    const input: CreateReportInput = req.body
    
    const report = await reportService.saveDraft(user.id, user.name, input)
    res.json(success({ id: report.id, updatedAt: report.updatedAt }, '保存成功'))
  } catch (error) {
    res.status(400).json(fail(error.message))
  }
})

/**
 * PUT /api/reports/:id - 更新周报
 */
router.put('/:id', async (req, res) => {
  try {
    const user = getAuthUser(req)
    const id = parseInt(req.params.id)
    const input: UpdateReportInput = req.body
    
    const report = await reportService.update(id, input)
    if (!report) {
      return res.status(404).json(fail('周报不存在'))
    }
    
    res.json(success({ id: report.id, updatedAt: report.updatedAt }, '保存成功'))
  } catch (error) {
    res.status(400).json(fail(error.message))
  }
})

/**
 * PUT /api/reports/:id/submit - 提交周报
 */
router.put('/:id/submit', async (req, res) => {
  try {
    const user = getAuthUser(req)
    const id = parseInt(req.params.id)
    
    const report = await reportService.submit(user.id, id)
    res.json(success(null, '提交成功'))
  } catch (error) {
    const msg = error.message
    if (msg.includes('已提交')) {
      return res.status(400).json(fail('您本周已提交过周报'))
    }
    res.status(400).json(fail(msg))
  }
})

/**
 * GET /api/reports - 查询周报列表
 */
router.get('/', async (req, res) => {
  try {
    const user = getAuthUser(req)
    const query: ReportQueryInput = {
      page: parseInt(req.query.page as string) || 1,
      size: parseInt(req.query.size as string) || 10,
      status: req.query.status as any,
      authorId: user.role === 'EMPLOYEE' ? user.id : req.query.authorId as string,
      weekDate: req.query.weekDate as string
    }
    
    const result = await reportService.query(query)
    res.json(success(result))
  } catch (error) {
    res.status(400).json(fail(error.message))
  }
})

/**
 * GET /api/reports/:id - 获取周报详情
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const report = await reportService.findById(id)
    
    if (!report) {
      return res.status(404).json(fail('周报不存在'))
    }
    
    res.json(success(report))
  } catch (error) {
    res.status(400).json(fail(error.message))
  }
})

/**
 * PUT /api/reports/:id/audit - 审核周报
 */
router.put('/:id/audit', async (req, res) => {
  try {
    const user = getAuthUser(req)
    
    // 权限检查：仅主管可审核
    if (user.role !== 'MANAGER') {
      return res.status(403).json(fail('无权审核周报'))
    }
    
    const id = parseInt(req.params.id)
    const input: AuditReportInput = req.body
    
    const report = await reportService.audit(id, input)
    res.json(success(null, input.action === 'APPROVE' ? '审核通过' : '已打回'))
  } catch (error) {
    res.status(400).json(fail(error.message))
  }
})

export default router