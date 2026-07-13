/**
 * 周报数据存储层
 * 使用内存存储模拟数据库（轻量级实现）
 */

import { v4 as uuidv4 } from 'uuid'
import type { Report, CreateReportInput, UpdateReportInput, ReportStatus, ReportQueryInput } from './types'

// 内存存储
const reports: Map<number, Report> = new Map()
let nextId = 1

// 获取当前周的开始日期（周一）
function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export class ReportRepository {
  /**
   * 创建周报
   */
  async create(authorId: string, authorName: string, input: CreateReportInput): Promise<Report> {
    const now = new Date().toISOString()
    const report: Report = {
      id: nextId++,
      authorId,
      authorName,
      thisWeekWork: input.thisWeekWork,
      nextWeekPlan: input.nextWeekPlan,
      status: input.status || 'DRAFT',
      weekDate: getWeekStart(),
      createdAt: now,
      updatedAt: now
    }
    reports.set(report.id, report)
    return report
  }

  /**
   * 更新周报
   */
  async update(id: number, input: UpdateReportInput): Promise<Report | null> {
    const report = reports.get(id)
    if (!report) return null

    if (input.thisWeekWork !== undefined) report.thisWeekWork = input.thisWeekWork
    if (input.nextWeekPlan !== undefined) report.nextWeekPlan = input.nextWeekPlan
    if (input.status !== undefined) report.status = input.status
    report.updatedAt = new Date().toISOString()

    reports.set(id, report)
    return report
  }

  /**
   * 根据ID查询
   */
  async findById(id: number): Promise<Report | null> {
    return reports.get(id) || null
  }

  /**
   * 检查员工本周是否已提交周报
   */
  async hasSubmittedThisWeek(authorId: string): Promise<boolean> {
    const weekStart = getWeekStart()
    for (const report of reports.values()) {
      if (report.authorId === authorId && report.weekDate === weekStart && report.status !== 'DRAFT') {
        return true
      }
    }
    return false
  }

  /**
   * 查询列表
   */
  async query(input: ReportQueryInput): Promise<{ total: number; list: Report[] }> {
    const { page = 1, size = 10, status, authorId, weekDate } = input
    
    let filtered = Array.from(reports.values())
    
    if (status) {
      filtered = filtered.filter(r => r.status === status)
    }
    if (authorId) {
      filtered = filtered.filter(r => r.authorId === authorId)
    }
    if (weekDate) {
      filtered = filtered.filter(r => r.weekDate === weekDate)
    }

    // 按更新时间倒序
    filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    const total = filtered.length
    const start = (page - 1) * size
    const list = filtered.slice(start, start + size)

    return { total, list }
  }

  /**
   * 统计本周数据
   */
  async getStatistics(weekDate: string, totalMembers: number): Promise<{
    submittedMembers: number
    approvedMembers: number
  }> {
    let submittedMembers = 0
    let approvedMembers = 0
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

    return { submittedMembers, approvedMembers }
  }
}

// 单例实例
export const reportRepository = new ReportRepository()