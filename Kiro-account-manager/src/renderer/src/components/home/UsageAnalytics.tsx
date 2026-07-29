import { useMemo, type ReactElement } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Gauge,
  Layers3,
  TrendingUp,
  WalletCards,
  Zap
} from 'lucide-react'
import type { Account } from '@/types/account'
import { getMonthlyCycle } from '@/lib/usageHistory'
import { Card, CardContent, CardHeader, CardTitle } from '../ui'
import { cn } from '@/lib/utils'

interface UsageAnalyticsProps {
  accounts: Map<string, Account>
  usagePrecision: boolean
  isEn: boolean
}

interface TrendPoint {
  day: number
  used: number
  limit: number
  observedAccounts: number
}

const CHART_WIDTH = 820
const CHART_HEIGHT = 238
const PLOT = { left: 54, right: 798, top: 18, bottom: 194 }

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2
  }).format(value)
}

function formatDate(timestamp: number, isEn: boolean): string {
  return new Intl.DateTimeFormat(isEn ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric'
  }).format(timestamp)
}

function linePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

export function UsageAnalytics({
  accounts,
  usagePrecision,
  isEn
}: UsageAnalyticsProps): ReactElement | null {
  const dashboard = useMemo(() => {
    const now = Date.now()
    const cycle = getMonthlyCycle(now)
    const validAccounts = Array.from(accounts.values()).filter(
      (account) => account.status === 'active' && account.usage.limit > 0
    )

    const totalLimit = validAccounts.reduce((sum, account) => sum + account.usage.limit, 0)
    const totalUsed = validAccounts.reduce((sum, account) => sum + account.usage.current, 0)
    const remaining = totalLimit - totalUsed
    const percentUsed = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0
    const dailyAverage = cycle.dayOfCycle > 0 ? totalUsed / cycle.dayOfCycle : 0
    const projectedUsage = dailyAverage * cycle.daysInCycle
    const daysUntilReset = cycle.daysInCycle - cycle.dayOfCycle + 1

    const trend: TrendPoint[] = []
    for (let day = 1; day <= cycle.dayOfCycle; day++) {
      const endOfDay =
        new Date(new Date(now).getFullYear(), new Date(now).getMonth(), day + 1).getTime() - 1
      let used = 0
      let limit = 0
      let observedAccounts = 0

      for (const account of validAccounts) {
        const snapshot = (account.usage.history ?? [])
          .filter((item) => item.timestamp >= cycle.start && item.timestamp <= endOfDay)
          .sort((a, b) => b.timestamp - a.timestamp)[0]
        if (!snapshot) continue
        used += snapshot.current
        limit += snapshot.limit
        observedAccounts++
      }

      if (observedAccounts > 0) trend.push({ day, used, limit, observedAccounts })
    }

    const todayPoint = trend.at(-1)
    const previousPoint = trend.at(-2)
    const todayIncrease =
      todayPoint && previousPoint ? Math.max(0, todayPoint.used - previousPoint.used) : null

    const distribution = [
      {
        key: 'safe',
        label: isEn ? 'Healthy (<50%)' : '充足（<50%）',
        min: 0,
        max: 0.5,
        color: 'bg-emerald-500',
        text: 'text-emerald-500'
      },
      {
        key: 'medium',
        label: isEn ? 'Moderate (50–80%)' : '适中（50–80%）',
        min: 0.5,
        max: 0.8,
        color: 'bg-blue-500',
        text: 'text-blue-500'
      },
      {
        key: 'warning',
        label: isEn ? 'Low (80–100%)' : '告急（80–100%）',
        min: 0.8,
        max: 1,
        color: 'bg-amber-500',
        text: 'text-amber-500'
      },
      {
        key: 'empty',
        label: isEn ? 'Exhausted (≥100%)' : '已耗尽（≥100%）',
        min: 1,
        max: Number.POSITIVE_INFINITY,
        color: 'bg-red-500',
        text: 'text-red-500'
      }
    ].map((bucket) => ({
      ...bucket,
      count: validAccounts.filter((account) => {
        const ratio = account.usage.limit > 0 ? account.usage.current / account.usage.limit : 0
        return ratio >= bucket.min && ratio < bucket.max
      }).length
    }))

    const subscriptions = new Map<
      string,
      { label: string; used: number; limit: number; count: number }
    >()
    for (const account of validAccounts) {
      const key =
        account.subscription.rawType ||
        account.subscription.title ||
        account.subscription.type ||
        'Free'
      const label = account.subscription.title || account.subscription.type || 'Free'
      const current = subscriptions.get(key) ?? { label, used: 0, limit: 0, count: 0 }
      current.used += account.usage.current
      current.limit += account.usage.limit
      current.count++
      subscriptions.set(key, current)
    }

    const subscriptionRows = Array.from(subscriptions.values())
      .sort((a, b) => b.used - a.used)
      .slice(0, 5)

    const topAccounts = validAccounts
      .map((account) => ({
        id: account.id,
        name: account.nickname || account.email,
        email: account.email,
        used: account.usage.current,
        limit: account.usage.limit,
        ratio: account.usage.limit > 0 ? account.usage.current / account.usage.limit : 0
      }))
      .sort((a, b) => b.used - a.used)
      .slice(0, 5)
    const averageAccountUsage =
      validAccounts.length > 0
        ? validAccounts.reduce(
            (sum, account) => sum + account.usage.current / account.usage.limit,
            0
          ) / validAccounts.length
        : 0

    return {
      cycle,
      validAccountCount: validAccounts.length,
      totalLimit,
      totalUsed,
      remaining,
      percentUsed,
      dailyAverage,
      projectedUsage,
      daysUntilReset,
      todayIncrease,
      trend,
      distribution,
      subscriptionRows,
      topAccounts,
      averageAccountUsage
    }
  }, [accounts, isEn])

  if (dashboard.validAccountCount === 0) return null

  const precision = usagePrecision ? 2 : 1
  const chartMax = Math.max(
    dashboard.totalLimit,
    dashboard.projectedUsage,
    ...dashboard.trend.map((point) => Math.max(point.used, point.limit)),
    1
  )
  const chartX = (day: number): number => {
    const span = Math.max(1, dashboard.cycle.daysInCycle - 1)
    return PLOT.left + ((day - 1) / span) * (PLOT.right - PLOT.left)
  }
  const chartY = (value: number): number =>
    PLOT.bottom - (value / chartMax) * (PLOT.bottom - PLOT.top)
  const usedPoints = dashboard.trend.map((point) => ({
    x: chartX(point.day),
    y: chartY(point.used)
  }))
  const limitPoints = dashboard.trend.map((point) => ({
    x: chartX(point.day),
    y: chartY(point.limit)
  }))
  const usedPath = linePath(usedPoints)
  const limitPath = linePath(limitPoints)
  const areaPath =
    usedPoints.length > 0
      ? `${usedPath} L ${usedPoints.at(-1)!.x} ${PLOT.bottom} L ${usedPoints[0].x} ${PLOT.bottom} Z`
      : ''
  const xTicks = Array.from(new Set([1, 5, 10, 15, 20, 25, dashboard.cycle.daysInCycle])).filter(
    (day) => day <= dashboard.cycle.daysInCycle
  )
  const periodLabel = `${formatDate(dashboard.cycle.start, isEn)} – ${formatDate(dashboard.cycle.end - 1, isEn)}`

  const summaryCards = [
    {
      label: isEn ? 'Monthly quota' : '本月总额度',
      value: formatCompact(dashboard.totalLimit),
      detail: isEn
        ? `${dashboard.validAccountCount} active accounts`
        : `${dashboard.validAccountCount} 个有效账号`,
      icon: WalletCards,
      tone: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      label: isEn ? 'Used' : '已使用',
      value: formatCompact(dashboard.totalUsed),
      detail: `${dashboard.percentUsed.toFixed(precision)}%`,
      icon: Activity,
      tone: dashboard.percentUsed >= 90 ? 'text-red-500' : 'text-violet-500',
      bg: dashboard.percentUsed >= 90 ? 'bg-red-500/10' : 'bg-violet-500/10'
    },
    {
      label: isEn ? 'Remaining' : '剩余额度',
      value: formatCompact(dashboard.remaining),
      detail: isEn
        ? `Resets in ${dashboard.daysUntilReset}d`
        : `${dashboard.daysUntilReset} 天后重置`,
      icon: Zap,
      tone: dashboard.remaining < 0 ? 'text-red-500' : 'text-emerald-500',
      bg: dashboard.remaining < 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'
    },
    {
      label: isEn ? 'Daily average' : '日均消耗',
      value: formatCompact(dashboard.dailyAverage),
      detail: isEn
        ? `Projected ${formatCompact(dashboard.projectedUsage)}`
        : `预计月底 ${formatCompact(dashboard.projectedUsage)}`,
      icon: Gauge,
      tone: 'text-amber-500',
      bg: 'bg-amber-500/10'
    }
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3 text-base">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div>{isEn ? 'Quota Analytics' : '额度数据分析'}</div>
              <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                {isEn ? 'Current monthly cycle' : '当前月度周期'} · {periodLabel}
              </div>
            </div>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <CalendarDays className="h-3.5 w-3.5" />
              {isEn ? 'Resets on the 1st' : '每月 1 日刷新'}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              {isEn ? 'Keeps current month' : '保留本月数据'}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {summaryCards.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{item.value}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <div className={cn('rounded-lg p-2', item.bg)}>
                    <Icon className={cn('h-4 w-4', item.tone)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(250px,1fr)]">
          <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {isEn ? 'Monthly usage trend' : '月度额度消耗趋势'}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dashboard.trend.length > 1
                    ? isEn
                      ? 'Daily snapshots collected after each quota refresh'
                      : '每次额度刷新后记录当日最终快照'
                    : isEn
                      ? 'History starts today and builds automatically'
                      : '统计从今天开始，后续将自动形成趋势'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-violet-500" />
                  {isEn ? 'Used' : '已使用'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-blue-400" />
                  {isEn ? 'Quota' : '总额度'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="min-w-[620px] w-full"
                role="img"
                aria-label={isEn ? 'Monthly quota usage chart' : '月度额度使用趋势图'}
              >
                <defs>
                  <linearGradient id="usage-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = PLOT.bottom - ratio * (PLOT.bottom - PLOT.top)
                  return (
                    <g key={ratio}>
                      <line
                        x1={PLOT.left}
                        x2={PLOT.right}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        className="text-border"
                        strokeDasharray="3 5"
                      />
                      <text
                        x={PLOT.left - 9}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-muted-foreground text-[10px]"
                      >
                        {formatCompact(chartMax * ratio)}
                      </text>
                    </g>
                  )
                })}
                {xTicks.map((day) => (
                  <text
                    key={day}
                    x={chartX(day)}
                    y={PLOT.bottom + 24}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {day}
                  </text>
                ))}
                {areaPath && <path d={areaPath} fill="url(#usage-area-gradient)" />}
                {limitPath && (
                  <path
                    d={limitPath}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeDasharray="6 5"
                  />
                )}
                {usedPath && (
                  <path
                    d={usedPath}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {usedPoints.map((point, index) => (
                  <circle
                    key={dashboard.trend[index].day}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill="#8b5cf6"
                    stroke="var(--color-card)"
                    strokeWidth="2"
                  >
                    <title>{`${dashboard.trend[index].day}: ${formatCompact(dashboard.trend[index].used)} / ${formatCompact(dashboard.trend[index].limit)}`}</title>
                  </circle>
                ))}
              </svg>
            </div>

            <div className="mt-1 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground">{isEn ? 'Today' : '今日新增'}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {dashboard.todayIncrease == null
                    ? '—'
                    : `+${formatCompact(dashboard.todayIncrease)}`}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {isEn ? 'Projected rate' : '月底预计使用率'}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {dashboard.totalLimit > 0
                    ? `${((dashboard.projectedUsage / dashboard.totalLimit) * 100).toFixed(precision)}%`
                    : '0%'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {isEn ? 'Days recorded' : '已记录天数'}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {dashboard.trend.length}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">
                {isEn ? 'Account distribution' : '账号额度分布'}
              </h3>
            </div>
            <div className="space-y-4">
              {dashboard.distribution.map((bucket) => {
                const percentage =
                  dashboard.validAccountCount > 0
                    ? (bucket.count / dashboard.validAccountCount) * 100
                    : 0
                return (
                  <div key={bucket.key}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2">
                        <i className={cn('h-2 w-2 rounded-full', bucket.color)} />
                        {bucket.label}
                      </span>
                      <span className={cn('font-semibold tabular-nums', bucket.text)}>
                        {bucket.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', bucket.color)}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>{isEn ? 'Average account usage' : '账号平均使用率'}</span>
                <strong className="text-foreground">
                  {`${(dashboard.averageAccountUsage * 100).toFixed(precision)}%`}
                </strong>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold">{isEn ? 'Usage by plan' : '订阅类型消耗'}</h3>
            </div>
            <div className="space-y-3">
              {dashboard.subscriptionRows.map((row) => {
                const percentage = row.limit > 0 ? Math.min((row.used / row.limit) * 100, 100) : 0
                return (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium">
                        {row.label}{' '}
                        <span className="font-normal text-muted-foreground">× {row.count}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatCompact(row.used)} / {formatCompact(row.limit)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">{isEn ? 'Top consumers' : '高消耗账号排行'}</h3>
            </div>
            <div className="space-y-2">
              {dashboard.topAccounts.map((account, index) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                      index === 0
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{account.name}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          account.ratio >= 0.9
                            ? 'bg-red-500'
                            : account.ratio >= 0.7
                              ? 'bg-amber-500'
                              : 'bg-violet-500'
                        )}
                        style={{ width: `${Math.min(account.ratio * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums">
                      {formatCompact(account.used)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {(account.ratio * 100).toFixed(precision)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  )
}
