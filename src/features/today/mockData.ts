import type { TodayDashboardData } from './types'

export const todayDashboardMock: TodayDashboardData = {
  focus: [
    {
      id: 'focus-1',
      title: { en: 'Finish event proposal', 'zh-CN': '完成活动方案' },
      context: { en: 'Spring campaign', 'zh-CN': '春季活动' },
    },
    {
      id: 'focus-2',
      title: { en: 'Confirm the new UI flow', 'zh-CN': '确认新版界面流程' },
      context: { en: 'Product review · 14:30', 'zh-CN': '产品评审 · 14:30' },
    },
    {
      id: 'focus-3',
      title: { en: 'Review weekly analytics', 'zh-CN': '复盘本周数据' },
      context: { en: 'Growth dashboard', 'zh-CN': '增长数据看板' },
    },
  ],
  tasks: [
    {
      id: 'task-1',
      title: {
        en: 'Review player retention data',
        'zh-CN': '检查玩家留存数据',
      },
      project: { en: 'Analytics', 'zh-CN': '数据分析' },
      time: '10:00',
      priority: 'high',
      completed: false,
    },
    {
      id: 'task-2',
      title: { en: 'Update event configuration', 'zh-CN': '更新活动配置' },
      project: { en: 'Spring campaign', 'zh-CN': '春季活动' },
      time: '13:30',
      priority: 'normal',
      completed: false,
    },
    {
      id: 'task-3',
      title: { en: 'Send proposal for review', 'zh-CN': '发送方案供评审' },
      project: { en: 'Planning', 'zh-CN': '策划' },
      time: '09:15',
      priority: 'normal',
      completed: true,
    },
    {
      id: 'task-4',
      title: {
        en: 'Prepare afternoon sync notes',
        'zh-CN': '准备下午同步会记录',
      },
      project: { en: 'Team sync', 'zh-CN': '团队同步' },
      time: '16:00',
      priority: 'normal',
      completed: false,
    },
  ],
  waiting: [
    {
      id: 'waiting-1',
      title: { en: 'New UI flow confirmation', 'zh-CN': '新版界面流程确认' },
      person: { en: 'Mina · Design', 'zh-CN': 'Mina · 设计' },
      followUp: { en: 'Follow up tomorrow', 'zh-CN': '明天跟进' },
    },
    {
      id: 'waiting-2',
      title: { en: 'Backend effort estimate', 'zh-CN': '后端工作量评估' },
      person: { en: 'Alex · Engineering', 'zh-CN': 'Alex · 工程' },
      followUp: { en: 'Waiting 2 days', 'zh-CN': '已等待 2 天' },
    },
  ],
  checkIns: [
    {
      id: 'check-in-1',
      title: { en: 'Check analytics dashboard', 'zh-CN': '检查数据看板' },
      completed: true,
    },
    {
      id: 'check-in-2',
      title: { en: 'Review user feedback', 'zh-CN': '查看用户反馈' },
      completed: true,
    },
    {
      id: 'check-in-3',
      title: { en: 'Update daily report', 'zh-CN': '更新工作日报' },
      completed: false,
    },
  ],
  memo: {
    id: 'memo-1',
    content: {
      en: 'Check the A/B test sample size before tomorrow’s review.',
      'zh-CN': '明天评审前确认 A/B 测试样本量。',
    },
    updatedAt: { en: 'Updated 12 min ago', 'zh-CN': '12 分钟前更新' },
  },
  activity: [
    {
      id: 'activity-1',
      kind: 'task',
      description: {
        en: 'Completed “Send proposal”',
        'zh-CN': '完成「发送方案」',
      },
      occurredAt: { en: '24 min ago', 'zh-CN': '24 分钟前' },
    },
    {
      id: 'activity-2',
      kind: 'memo',
      description: { en: 'Updated quick memo', 'zh-CN': '更新了快速便笺' },
      occurredAt: { en: '1 hr ago', 'zh-CN': '1 小时前' },
    },
    {
      id: 'activity-3',
      kind: 'waiting',
      description: {
        en: 'Added backend estimate',
        'zh-CN': '新增后端工作量评估',
      },
      occurredAt: { en: 'Yesterday', 'zh-CN': '昨天' },
    },
  ],
}

export const emptyTodayDashboardMock: TodayDashboardData = {
  focus: [],
  tasks: [],
  waiting: [],
  checkIns: [],
  memo: null,
  activity: [],
}
