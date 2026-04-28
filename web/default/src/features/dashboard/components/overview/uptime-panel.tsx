import { memo, useCallback, useEffect, useState } from 'react'
import { Activity, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getModelAvailability,
  getUptimeStatus,
} from '@/features/dashboard/api'
import type {
  ModelAvailabilityItem,
  UptimeGroupResult,
  UptimeMonitor,
} from '@/features/dashboard/types'
import { PanelWrapper } from '../ui/panel-wrapper'

const STATUS_COLOR_MAP: Record<number, string> = {
  1: 'bg-emerald-500',
  0: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
}
const DEFAULT_STATUS_COLOR = 'bg-muted-foreground/40'
const MODEL_STATUS_COLOR_MAP: Record<string, string> = {
  normal: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
  no_data: 'bg-slate-400',
}

const StatusDot = memo(function StatusDot(props: { status: number }) {
  const color = STATUS_COLOR_MAP[props.status] ?? DEFAULT_STATUS_COLOR
  return <span className={cn('inline-block size-2 rounded-full', color)} />
})

export function UptimePanel() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<UptimeGroupResult[]>([])
  const [modelAvailability, setModelAvailability] = useState<
    ModelAvailabilityItem[]
  >([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'uptime' | 'availability'>(
    'uptime'
  )

  const loadPanelData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [uptimeRes, availabilityRes] = await Promise.all([
        getUptimeStatus(),
        getModelAvailability(),
      ])

      if (signal?.aborted) return

      const nextGroups = uptimeRes?.data || []
      const nextAvailability = availabilityRes?.data || []
      setGroups(nextGroups)
      setModelAvailability(nextAvailability)

      if (nextGroups.length === 0 && nextAvailability.length > 0) {
        setActiveTab('availability')
      }
    } catch {
      if (signal?.aborted) return
      setGroups([])
      setModelAvailability([])
    }
  }, [])

  useEffect(() => {
    const abortController = new AbortController()

    loadPanelData(abortController.signal).finally(() => {
      if (!abortController.signal.aborted) {
        setLoading(false)
      }
    })

    return () => {
      abortController.abort()
    }
  }, [loadPanelData])

  const handleRefresh = () => {
    const abortController = new AbortController()
    setRefreshing(true)

    loadPanelData(abortController.signal)
      .finally(() => {
        if (!abortController.signal.aborted) {
          setRefreshing(false)
        }
      })
  }

  const hasAnyData = groups.length > 0 || modelAvailability.length > 0

  const renderModelAvailability = () => {
    if (modelAvailability.length === 0) {
      return (
        <div className='p-4 text-sm text-muted-foreground'>
          {t('No model availability data')}
        </div>
      )
    }

    return (
      <div className='divide-y'>
        {modelAvailability.map((model) => {
          const color =
            MODEL_STATUS_COLOR_MAP[model.status] ?? DEFAULT_STATUS_COLOR
          return (
            <div
              key={model.model_name}
              className='px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5'
            >
              <div className='flex items-center justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-2.5'>
                  <span className={cn('inline-block size-2 rounded-full', color)} />
                  <span className='truncate text-sm'>{model.model_name}</span>
                </div>
                <span className='font-mono text-sm font-semibold tabular-nums'>
                  {model.total_count > 0
                    ? `${model.success_rate.toFixed(2)}%`
                    : '-'}
                </span>
              </div>

              <div className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
                <span>{t('Total')}: {model.total_count}</span>
                <span>{t('Success')}: {model.success_count}</span>
                <span>{t('Failed')}: {model.error_count}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <Activity className='text-muted-foreground/60 size-4' />
          {t('Uptime')}
        </span>
      }
      loading={loading}
      empty={!hasAnyData}
      emptyMessage={t('No uptime monitoring configured')}
      height='h-80'
      headerActions={
        <div className='flex items-center gap-1'>
          <Button
            variant={activeTab === 'uptime' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 px-2 text-xs'
            onClick={() => setActiveTab('uptime')}
            disabled={groups.length === 0}
          >
            {t('Uptime Kuma')}
          </Button>
          <Button
            variant={activeTab === 'availability' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 px-2 text-xs'
            onClick={() => setActiveTab('availability')}
            disabled={modelAvailability.length === 0}
          >
            {t('Model Availability')}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRefresh}
            disabled={refreshing}
            className='size-7 p-0'
          >
            <RotateCw
              className={cn('size-3.5', refreshing && 'animate-spin')}
              aria-label={t('Refresh')}
            />
          </Button>
        </div>
      }
    >
      <ScrollArea className='h-80'>
        {activeTab === 'availability' ? (
          renderModelAvailability()
        ) : (
          <div className='-mx-4 space-y-0 sm:-mx-5'>
            {groups.map((group, groupIdx) => (
              <div key={group.categoryName}>
                <div className='bg-muted/30 border-border/60 border-b px-4 py-2 sm:px-5'>
                  <div className='flex items-center gap-2'>
                    <h4 className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
                      {group.categoryName}
                    </h4>
                    <span className='text-muted-foreground/40 font-mono text-xs tabular-nums'>
                      {group.monitors?.length || 0}
                    </span>
                  </div>
                </div>

                {group.monitors?.map(
                  (monitor: UptimeMonitor, monitorIdx: number) => (
                    <div
                      key={monitor.name}
                      className={cn(
                        'hover:bg-muted/40 flex items-center justify-between px-4 py-2.5 transition-colors sm:px-5',
                        monitorIdx < (group.monitors?.length || 0) - 1 &&
                          'border-border/40 border-b',
                        groupIdx < groups.length - 1 &&
                          monitorIdx === (group.monitors?.length || 0) - 1 &&
                          'border-border/60 border-b'
                      )}
                    >
                      <div className='flex min-w-0 items-center gap-2.5'>
                        <StatusDot status={monitor.status} />
                        <span className='truncate text-sm'>{monitor.name}</span>
                        {monitor.group && (
                          <span className='text-muted-foreground/40 shrink-0 text-xs'>
                            ({monitor.group})
                          </span>
                        )}
                      </div>
                      <span className='text-foreground shrink-0 font-mono text-sm font-semibold tabular-nums'>
                        {((monitor.uptime ?? 0) * 100).toFixed(2)}%
                      </span>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </PanelWrapper>
  )
}
