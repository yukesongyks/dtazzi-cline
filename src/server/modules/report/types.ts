/**
 * 团队周报系统类型定义
 */

export enum ReportStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface Report {
  id: number
  authorId: string
  authorName: string
  thisWeekWork: string
  nextWeekPlan: string
  status: ReportStatus
  rejectReason?: string
  weekDate: string // ISO date string, e.g., "2026-07-13"
  createdAt: string
  updatedAt: string
}

export interface CreateReportInput {
  thisWeekWork: string
  nextWeekPlan: string
  status?: ReportStatus
}

export interface UpdateReportInput {
  thisWeekWork?: string
  nextWeekPlan?: string
  status?: ReportStatus
}

export interface SubmitReportInput {
  // empty, just trigger submit
}

export interface AuditReportInput {
  action: 'APPROVE' | 'REJECT'
  rejectReason?: string
}

export interface ReportQueryInput {
  page?: number
  size?: number
  status?: ReportStatus
  authorId?: string
  weekDate?: string
}

export interface ReportListResponse {
  total: number
  list: Report[]
}

export interface WeeklyStatistics {
  submitRate: number
  approvalRate: number
  totalMembers: number
  submittedMembers: number
  approvedMembers: number
  weekDate: string
}