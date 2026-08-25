import { set, subMinutes } from 'date-fns'
import { addLocalDateDays, instantToLocalDate } from '@/domain/time'
import type { Language } from '@/features/settings/language/types'
import type { TodayDashboardViewModel } from './viewModel'

const demoCopy = {
  en: {
    focus: [
      ['Finish event proposal', 'Spring campaign'],
      ['Confirm the new UI flow', 'Product review'],
      ['Review weekly analytics', 'Growth dashboard'],
    ],
    tasks: [
      ['Review player retention data', 'Analytics'],
      ['Update event configuration', 'Spring campaign'],
      ['Send proposal for review', 'Planning'],
      ['Prepare afternoon sync notes', 'Team sync'],
    ],
    waiting: [
      ['New UI flow confirmation', 'Mina · Design'],
      ['Backend effort estimate', 'Alex · Engineering'],
    ],
    checkIns: [
      'Check analytics dashboard',
      'Review user feedback',
      'Update daily report',
    ],
    memo: 'Check the A/B test sample size before tomorrow’s review.',
  },
  'zh-CN': {
    focus: [
      ['完成活动方案', '春季活动'],
      ['确认新版界面流程', '产品评审'],
      ['复盘本周数据', '增长数据看板'],
    ],
    tasks: [
      ['检查玩家留存数据', '数据分析'],
      ['更新活动配置', '春季活动'],
      ['发送方案供评审', '策划'],
      ['准备下午同步会记录', '团队同步'],
    ],
    waiting: [
      ['新版界面流程确认', 'Mina · 设计'],
      ['后端工作量评估', 'Alex · 工程'],
    ],
    checkIns: ['检查数据看板', '查看用户反馈', '更新工作日报'],
    memo: '明天评审前确认 A/B 测试样本量。',
  },
} as const

function atTime(date: Date, hours: number, minutes: number) {
  return set(date, {
    hours,
    minutes,
    seconds: 0,
    milliseconds: 0,
  }).toISOString()
}

export function createTodayDashboardMock(
  language: Language,
): TodayDashboardViewModel {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = instantToLocalDate(now.toISOString(), timezone)
  const tomorrow = addLocalDateDays(today, 1)
  const copy = demoCopy[language]

  return {
    date: today,
    summary: {
      openTaskCount: 3,
      waitingCount: 2,
      completedCheckInCount: 2,
      totalCheckInCount: 3,
    },
    focus: copy.focus.map(([title, projectName], index) => ({
      taskId: `task-${index + 1}`,
      entityVersion: 1,
      title,
      projectName,
      plannedAt: index === 1 ? atTime(now, 14, 30) : null,
      focusOrder: (index + 1) as 1 | 2 | 3,
    })),
    tasks: copy.tasks.map(([title, projectName], index) => ({
      taskId: `task-${index + 1}`,
      entityVersion: 1,
      title,
      projectName,
      plannedAt: atTime(now, [10, 13, 9, 16][index] ?? 9, index === 1 ? 30 : 0),
      priority: index === 0 ? 'P1' : 'P2',
      status: index === 2 ? 'done' : 'todo',
      focusOrder: index < 2 ? ((index + 1) as 1 | 2) : null,
    })),
    waiting: copy.waiting.map(([title, person], index) => ({
      waitingId: `waiting-${index + 1}`,
      entityVersion: 1,
      title,
      person,
      notes: null,
      status: 'waiting',
      projectName: null,
      sourceTaskId: null,
      followUpDate: index === 0 ? tomorrow : today,
      daysWaiting: index === 0 ? 0 : 2,
      needsFollowUp: index === 1,
    })),
    checkIns: copy.checkIns.map((title, index) => ({
      routineId: `routine-${index + 1}`,
      routineVersion: 1,
      routineLogId: index < 2 ? `routine-log-${index + 1}` : null,
      date: today,
      title,
      completed: index < 2,
    })),
    quickMemo: {
      memoId: 'memo-1',
      entityVersion: 1,
      content: copy.memo,
      pinned: false,
      projectId: null,
      projectName: null,
      updatedAt: subMinutes(now, 12).toISOString(),
    },
    recentActivity: [],
  }
}

export const todayDashboardMock = createTodayDashboardMock('en')

export const emptyTodayDashboardMock: TodayDashboardViewModel = {
  date: instantToLocalDate(
    new Date().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ),
  summary: {
    openTaskCount: 0,
    waitingCount: 0,
    completedCheckInCount: 0,
    totalCheckInCount: 0,
  },
  focus: [],
  tasks: [],
  waiting: [],
  checkIns: [],
  quickMemo: null,
  recentActivity: [],
}
