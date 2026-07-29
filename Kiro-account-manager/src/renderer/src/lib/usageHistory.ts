import type { AccountUsage, UsageSnapshot } from '../types/account'

export function toLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMonthlyCycle(timestamp = Date.now()): {
  start: number
  end: number
  daysInCycle: number
  dayOfCycle: number
} {
  const date = new Date(timestamp)
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
  return {
    start,
    end,
    // 使用日历日期计算，避免跨越夏令时时 23/25 小时的一天导致月份天数取整偏差。
    daysInCycle: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
    dayOfCycle: date.getDate()
  }
}

/**
 * 合并一条额度观测：同一天覆盖，跨天追加；跨月时丢弃上月数据。
 * 若数值没有变化则保留原引用，避免每次启动都触发无意义写盘。
 */
export function captureUsageSnapshot(
  usage: AccountUsage,
  timestamp = Date.now(),
  previousHistory: UsageSnapshot[] = usage.history ?? []
): AccountUsage {
  const { start, end } = getMonthlyCycle(timestamp)
  const retained = previousHistory
    .filter((item) => item.timestamp >= start && item.timestamp < end)
    .sort((a, b) => a.timestamp - b.timestamp)

  // 无有效额度时不创建快照，但仍清掉跨月遗留数据。
  if (!Number.isFinite(usage.current) || !Number.isFinite(usage.limit) || usage.limit <= 0) {
    return retained.length === previousHistory.length
      ? usage
      : { ...usage, history: retained }
  }

  const date = toLocalDateKey(timestamp)

  const existingIndex = retained.findIndex((item) => item.date === date)
  const existing = existingIndex >= 0 ? retained[existingIndex] : undefined

  if (
    existing &&
    existing.current === usage.current &&
    existing.limit === usage.limit &&
    retained.length === previousHistory.length
  ) {
    return usage.history === previousHistory ? usage : { ...usage, history: previousHistory }
  }

  const snapshot: UsageSnapshot = {
    date,
    timestamp,
    current: usage.current,
    limit: usage.limit
  }

  if (existingIndex >= 0) retained[existingIndex] = snapshot
  else retained.push(snapshot)

  return { ...usage, history: retained.slice(-31) }
}
