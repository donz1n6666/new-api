import { useEffect, useMemo, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { Users, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { computeTimeRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useTheme } from '@/context/theme-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserQuotaDataByUsers } from '@/features/dashboard/api'
import { DEFAULT_TIME_GRANULARITY } from '@/features/dashboard/constants'
import {
  getDefaultDays,
  getSavedGranularity,
  processUserChartData,
} from '@/features/dashboard/lib'
import type {
  DashboardFilters,
  ProcessedUserChartData,
} from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const USER_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedUserChartData
}[] = [
  {
    value: 'rank',
    labelKey: 'User Consumption Ranking',
    specKey: 'spec_user_rank',
  },
  {
    value: 'token-rank',
    labelKey: 'User Token Consumption Ranking',
    specKey: 'spec_user_token_rank',
  },
  {
    value: 'trend',
    labelKey: 'User Consumption Trend',
    specKey: 'spec_user_trend',
  },
]

const TOP_USER_LIMIT_OPTIONS = [5, 10, 20, 50]

export function UserCharts({ filters }: { filters?: DashboardFilters }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const [topUserLimit, setTopUserLimit] = useState(10)
  const timeGranularity =
    filters?.time_granularity ||
    (getSavedGranularity() as TimeGranularity) ||
    DEFAULT_TIME_GRANULARITY

  const timeRange = useMemo(
    () =>
      computeTimeRange(
        getDefaultDays(timeGranularity),
        filters?.start_timestamp,
        filters?.end_timestamp
      ),
    [filters?.start_timestamp, filters?.end_timestamp, timeGranularity]
  )

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    updateTheme()
  }, [resolvedTheme])

  const { data: userData, isLoading } = useQuery({
    queryKey: ['dashboard', 'user-quota', timeRange, filters?.channel || ''],
    queryFn: () =>
      getUserQuotaDataByUsers({
        ...timeRange,
        ...(filters?.channel ? { channel: filters.channel } : {}),
      }),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  const chartData = useMemo(
    () =>
      processUserChartData(
        isLoading ? [] : (userData ?? []),
        timeGranularity,
        t,
        topUserLimit
      ),
    [userData, isLoading, timeGranularity, t, topUserLimit]
  )

  return (
    <div className='space-y-4'>
      {/* Toolbar: top-user limit only */}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex items-center gap-1.5 rounded-md border p-0.5'>
          <span className='text-muted-foreground px-2 text-xs font-medium'>
            {t('Top Users')}
          </span>
          {TOP_USER_LIMIT_OPTIONS.map((limit) => (
            <button
              key={limit}
              type='button'
              onClick={() => setTopUserLimit(limit)}
              className={`rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors ${
                topUserLimit === limit
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t('Top {{count}}', { count: limit })}
            </button>
          ))}
        </div>

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-4'>
        {USER_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]

          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-4 py-3 sm:px-5'>
                <Users className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>{t(chart.labelKey)}</div>
              </div>

              <div className='h-96 p-2'>
                {isLoading ? (
                  <Skeleton className='h-full w-full' />
                ) : (
                  themeReady &&
                  spec && (
                    <VChart
                      key={`user-${chart.value}-${topUserLimit}-${resolvedTheme}`}
                      spec={{
                        ...spec,
                        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                        background: 'transparent',
                      }}
                      option={VCHART_OPTION}
                    />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
