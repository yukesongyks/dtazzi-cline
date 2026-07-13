/**
 * 统计 HTTP 路由
 */

import express from 'express'
import { reportService } from '../report/report.service'

const router = express.Router()

// 统一响应格式
function success<T>(data: T, msg: string = '操作成功') {
  return { code: 200, data, msg }
}

/**
 * GET /api/statistics/weekly - 获取周统计数据
 */
router.get('/weekly', async (req, res) => {
  try {
    const weekDate = (req.query.weekDate as string) || getWeekStart()
    
    // TODO: 从用户服务获取团队总人数
    // 这里暂时硬编码，实际应从数据库查询
    const totalMembers = 20
    
    const stats = await reportService.getStatistics(weekDate, totalMembers)
    res.json(success(stats))
  } catch (error) {
    res.status(400).json({ code: 400, data: null, msg: error.message })
  }
})

// 获取当前周的开始日期（周一）
function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export default router