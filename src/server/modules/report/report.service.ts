/**
 * 周报业务逻辑层
 */

import { reportRepository } from './report.repository'
import type { Report, CreateReportInput, UpdateReportInput, AuditReportInput, ReportQueryInput, WeeklyStatistics } from './types'

export class ReportService {
  /**
   * 创建或更新周报草稿（自动保存）
   */
  async saveDraft(authorId: string, authorName: string, input: CreateReportInput): Promise<Report> {
    // 查找本周已有草稿
    const existing = await this.findDraftByAuthor(authorId)
    
    if (existing) {
      const updated = await reportRepository.update(existing.id, {
        thisWeekWork: input.thisWeekWork,
        nextWeekPlan: input.nextWeekPlan
      })
      return updated!
    }
    
    return reportRepository.create(authorId, authorName, input)
  }

  /**
   * 更新周报
   */
  async update(id: number, input: UpdateReportInput): Promise<Report | null> {
    const report = await reportRepository.findById(id)
    if (!report) return null

    // 只允许更新草稿状态的周报
    if (report.status !== 'DRAFT') {
      throw new Error('只能修改草稿状态的周报')
    }

    return reportRepository.update(id, input)
  }

  /**
   * 提交周报
   */
  async submit(authorId: string, id: number): Promise<Report> {
    const report = await reportRepository.findById(id)
    
    if (!report) {
      throw new Error('周报不存在')
    }

    // 权限检查
    if (report.authorId !== authorId) {
      throw new Error('无权提交此周报')
    }

    // 状态检查
    if (report.status !== 'DRAFT') {
      throw new Error('只能提交草稿状态的周报')
    }

    // 内容校验
    if (!report.thisWeekWork || report.thisWeekWork.length < 10) {
      throw new Error('本周工作内容至少需要10个字')
    }
    if (!report.nextWeekPlan || report.nextWeekPlan.length < 10) {
      throw new Error('下周计划至少需要10个字')
    }

    // 防重检查
    const hasSubmitted = await reportRepository.hasSubmittedThisWeek(authorId)
    if (hasSubmitted) {
      throw new Error('您本周已提交过周报')
    }

    // 更新状态为待审核
    const updated = await reportRepository.update(id, { status: 'PENDING' })
    return updated!
  }

  /**
   * 审核周报
   */
  async audit(id: number, input: AuditReportInput): Promise<Report> {
    const report = await reportRepository.findById(id)
    
    if (!report) {
      throw new Error('周报不存在')
    }

    if (report.status !== 'PENDING') {
      throw new Error('只能审核待审核状态的周报')
    }

    if (input.action === 'APPROVE') {
      return reportRepository.update(id, { status: 'APPROVED' })!
    } else {
      if (!input.rejectReason) {
        throw new Error('打回时必须填写原因')
      }
      const updated = await reportRepository.update(id, { 
        status: 'DRAFT',
        rejectReason: input.rejectReason 
      })
      return updated!
    }
  }

  /**
   * 查询周报列表
   */
  async query(input: ReportQueryInput): Promise<{ total: number; list: Report[] }> {
    return reportRepository.query(input)
  }

  /**
   * 获取周报详情
   */
  async findById(id: number): Promise<Report | null> {
    return reportRepository.findById(id)
  }

  /**
   * 查找员工的草稿
   */
  async findDraftByAuthor(authorId: string): Promise<Report | null> {
    const { list } = await reportRepository.query({ 
      authorId, 
      status: 'DRAFT',
      size: 1 
    })
    return list[0] || null
  }

  /**
   * 获取统计数据
   */
  async getStatistics(weekDate: string, totalMembers: number): Promise<WeeklyStatistics> {
    const { submittedMembers, approvedMembers } = await reportRepository.getStatistics(weekDate, totalMembers)
    
    return {
      submitRate: totalMembers > 0 ? submittedMembers / totalMembers : 0,
      approvalRate: submittedMembers > 0 ? approvedMembers / submittedMembers : 0,
      totalMembers,
      submittedMembers,
      approvedMembers,
      weekDate
    }
  }
}

// 单例实例
export const reportService = new ReportService()