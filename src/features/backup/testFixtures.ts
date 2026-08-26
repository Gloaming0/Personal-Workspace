import { createActivity } from '@/domain/activity'
import { finalizeDailyLog } from '@/domain/dailyLog'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createRoutineLog } from '@/domain/routineLog'
import { createTask, softDeleteTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import type { BackupData } from './format'

const USER = 'local-user'
const NOW = '2026-08-25T08:00:00.000Z'
const DELETED = '2026-08-25T09:00:00.000Z'

export const fixtureIds = {
  task: '00000000-0000-4000-8000-000000000001',
  deletedTask: '00000000-0000-4000-8000-000000000002',
  waiting: '00000000-0000-4000-8000-000000000003',
  memo: '00000000-0000-4000-8000-000000000004',
  routine: '00000000-0000-4000-8000-000000000005',
  routineLog: '00000000-0000-4000-8000-000000000006',
  activity: '00000000-0000-4000-8000-000000000007',
  dailyLog: '00000000-0000-4000-8000-000000000008',
} as const

export function createCompleteBackupData(userId = USER): BackupData {
  const task = createTask(
    {
      userId,
      title: '完成提案 ✓ Привет',
      notes: null,
      plannedDate: '2026-08-26',
    },
    { id: fixtureIds.task, now: NOW },
  )
  const deletedTask = softDeleteTask(
    createTask(
      {
        userId,
        title: '已删除历史',
        plannedDate: '2026-08-24',
      },
      { id: fixtureIds.deletedTask, now: NOW },
    ),
    DELETED,
  )
  const waiting = createWaiting(
    {
      userId,
      title: '等待 José 回复',
      person: null,
      notes: null,
      sourceTaskId: task.id,
      followUpDate: '2026-08-26',
    },
    { id: fixtureIds.waiting, now: NOW },
  )
  const memo = createMemo(
    { userId, content: '备忘：明天继续 🌙', pinned: true, projectId: null },
    { id: fixtureIds.memo, now: NOW },
  )
  const routine = createRoutine(
    {
      userId,
      title: 'Kiritimati review',
      schedule: { frequency: 'weekly', daysOfWeek: [2] },
      timezone: 'Pacific/Kiritimati',
    },
    { id: fixtureIds.routine, now: NOW },
  )
  const routineLog = createRoutineLog(
    { userId, routineId: routine.id, date: '2026-08-26' },
    { id: fixtureIds.routineLog, now: NOW },
  )
  const activity = createActivity(
    {
      userId,
      eventType: 'task_created',
      entityType: 'task',
      entityId: task.id,
      title: task.title,
      deviceId: null,
    },
    { id: fixtureIds.activity, now: NOW },
  )
  const dailyLog = finalizeDailyLog(
    {
      userId,
      date: '2026-08-25',
      finalizeTimezone: 'America/New_York',
      summary: '原始总结 — unchanged',
      snapshot: {
        completedTasks: [],
        openTasks: [
          {
            entityId: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            projectName: null,
            plannedDate: task.plannedDate,
            dueAt: null,
          },
        ],
        waiting: [
          {
            entityId: waiting.id,
            title: waiting.title,
            status: waiting.status,
            person: null,
            projectName: null,
            sentAt: waiting.sentAt,
            followUpDate: waiting.followUpDate,
          },
        ],
        memos: [{ entityId: memo.id, content: memo.content }],
        routines: [
          {
            entityId: routine.id,
            title: routine.title,
            completed: true,
            completedAt: routineLog.completedAt,
          },
        ],
      },
    },
    { id: fixtureIds.dailyLog, now: '2026-08-26T03:00:00.000Z' },
  )
  return {
    tasks: [task, deletedTask],
    waiting: [waiting],
    memos: [memo],
    routines: [routine],
    routineLogs: [routineLog],
    activities: [activity],
    dailyLogs: [dailyLog],
  }
}
