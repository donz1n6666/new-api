import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Copy,
  Link2,
  Plus,
  RefreshCw,
  Ticket,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/status-badge'

type InvitationCodeItem = {
  id: number
  code: string
  status: number
  remark?: string
  created_time?: number
}

type InvitationListResponse = {
  items?: InvitationCodeItem[]
  total?: number
}

const PAGE_SIZE = 10
const DEFAULT_BATCH_COUNT = 10

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function buildInvitationLink(code: string) {
  return `${window.location.origin}/sign-up?invitation_code=${encodeURIComponent(code)}`
}

function getStatusConfig(
  status: number,
  t: (key: string) => string
): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 1:
      return { label: t('Unused'), variant: 'success' }
    case 2:
      return { label: t('Used'), variant: 'neutral' }
    case 3:
      return { label: t('Disabled'), variant: 'danger' }
    default:
      return { label: t('Unknown'), variant: 'warning' }
  }
}

async function copyText(text: string, successMessage: string) {
  await navigator.clipboard.writeText(text)
  toast.success(successMessage)
}

export function InvitationCard() {
  const { t } = useTranslation()
  const [items, setItems] = useState<InvitationCodeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [batchCreating, setBatchCreating] = useState(false)
  const [batchAction, setBatchAction] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchCount, setBatchCount] = useState(DEFAULT_BATCH_COUNT)
  const [batchRemark, setBatchRemark] = useState('')

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  )

  const fetchCodes = useCallback(
    async (nextPage = page) => {
      setLoading(true)
      try {
        const res = await api.get<{
          success: boolean
          message?: string
          data?: InvitationListResponse
        }>(`/api/invitation_code/mine?p=${nextPage}&page_size=${PAGE_SIZE}`)

        if (!res.data.success) {
          toast.error(res.data.message || t('Failed to load invitation codes'))
          return
        }

        const payload = res.data.data || {}
        const nextItems = payload.items || []
        const nextTotal = payload.total || 0
        setItems(nextItems)
        setTotal(nextTotal)
        setSelectedIds((prev) =>
          prev.filter((id) => nextItems.some((item) => item.id === id))
        )
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load invitation codes')
        )
      } finally {
        setLoading(false)
      }
    },
    [page, t]
  )

  useEffect(() => {
    fetchCodes(page)
  }, [fetchCodes, page])

  const fetchAllCodes = useCallback(async () => {
    const allItems: InvitationCodeItem[] = []
    let currentPage = 1
    let totalCount = 0

    while (currentPage === 1 || allItems.length < totalCount) {
      const res = await api.get<{
        success: boolean
        message?: string
        data?: InvitationListResponse
      }>(`/api/invitation_code/mine?p=${currentPage}&page_size=100`)

      if (!res.data.success) {
        throw new Error(res.data.message || t('Failed to load invitation codes'))
      }

      const payload = res.data.data || {}
      const pageItems = payload.items || []
      totalCount = payload.total || 0
      allItems.push(...pageItems)

      if (pageItems.length === 0) {
        break
      }
      currentPage += 1
    }

    return allItems
  }, [t])

  const refreshCurrentPage = useCallback(async () => {
    await fetchCodes(page)
  }, [fetchCodes, page])

  const handleGenerate = async () => {
    setCreating(true)
    try {
      const res = await api.post('/api/invitation_code/generate', { count: 1 })
      if (res.data?.success) {
        toast.success(t('Invitation code created successfully'))
        setPage(1)
        await fetchCodes(1)
      } else {
        toast.error(res.data?.message || t('Failed to create invitation code'))
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to create invitation code')
      )
    } finally {
      setCreating(false)
    }
  }

  const handleBatchGenerate = async () => {
    if (batchCount <= 0 || batchCount > 100) {
      toast.error(t('Batch count must be between 1 and 100'))
      return
    }

    setBatchCreating(true)
    try {
      const res = await api.post('/api/invitation_code/generate', {
        count: batchCount,
        remark: batchRemark,
      })
      if (res.data?.success) {
        toast.success(t('Invitation codes created successfully'))
        setBatchDialogOpen(false)
        setBatchCount(DEFAULT_BATCH_COUNT)
        setBatchRemark('')
        setSelectedIds([])
        setPage(1)
        await fetchCodes(1)
      } else {
        toast.error(
          res.data?.message || t('Failed to create invitation codes')
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to create invitation codes')
      )
    } finally {
      setBatchCreating(false)
    }
  }

  const handleDeleteSelected = async (ids: number[]) => {
    if (ids.length === 0) return
    setBatchAction('delete')
    try {
      const res = await api.post('/api/invitation_code/mine/batch_delete', {
        ids,
      })
      if (res.data?.success) {
        toast.success(t('Deleted successfully'))
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
        await refreshCurrentPage()
      } else {
        toast.error(res.data?.message || t('Failed to delete invitation code'))
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to delete invitation code')
      )
    } finally {
      setBatchAction('')
    }
  }

  const handleClearUsed = async () => {
    setBatchAction('clear')
    try {
      const res = await api.post('/api/invitation_code/mine/delete_used')
      if (res.data?.success) {
        toast.success(t('Used invitation codes cleared'))
        setSelectedIds([])
        await refreshCurrentPage()
      } else {
        toast.error(
          res.data?.message || t('Failed to clear used invitation codes')
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to clear used invitation codes')
      )
    } finally {
      setBatchAction('')
    }
  }

  const copyCodes = async (codes: InvitationCodeItem[]) => {
    const usableCodes = codes.filter((item) => item.status === 1)
    if (usableCodes.length === 0) {
      toast.info(t('No unused invitation codes available to copy'))
      return
    }
    await copyText(
      usableCodes.map((item) => item.code).join('\n'),
      t('Copied to clipboard')
    )
  }

  const copyLinks = async (codes: InvitationCodeItem[]) => {
    const usableCodes = codes.filter((item) => item.status === 1)
    if (usableCodes.length === 0) {
      toast.info(t('No invitation links available to copy'))
      return
    }
    await copyText(
      usableCodes.map((item) => buildInvitationLink(item.code)).join('\n'),
      t('Invitation links copied')
    )
  }

  const handleCopyAllUnusedCodes = async () => {
    setBatchAction('copy-raw-all')
    try {
      await copyCodes(await fetchAllCodes())
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Copy failed')
      )
    } finally {
      setBatchAction('')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Ticket className='h-4 w-4' />
            {t('My Invitation Codes')}
          </CardTitle>
          <CardDescription>
            {t(
              'Generate invitation codes for friends to register or redeem quota'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              className='gap-2'
              onClick={handleGenerate}
              disabled={creating}
            >
              <Plus className='h-4 w-4' />
              {creating ? t('Creating...') : t('Generate')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setBatchDialogOpen(true)}
            >
              {t('Batch Create')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={handleClearUsed}
              disabled={batchAction === 'clear'}
            >
              {t('Clear Used')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={handleCopyAllUnusedCodes}
              disabled={batchAction === 'copy-raw-all'}
            >
              <Copy className='h-4 w-4' />
              {t('Copy All Unused Codes')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => copyCodes(selectedItems)}
              disabled={selectedItems.length === 0}
            >
              <Copy className='h-4 w-4' />
              {t('Copy Selected Codes')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => copyLinks(selectedItems)}
              disabled={selectedItems.length === 0}
            >
              <Link2 className='h-4 w-4' />
              {t('Copy Selected Links')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => handleDeleteSelected(selectedIds)}
              disabled={selectedIds.length === 0 || batchAction === 'delete'}
            >
              <Trash2 className='h-4 w-4' />
              {t('Delete Selected')}
            </Button>
            <Button
              size='icon'
              variant='ghost'
              onClick={refreshCurrentPage}
              disabled={loading}
              aria-label={t('Refresh')}
            >
              <RefreshCw className='h-4 w-4' />
            </Button>
          </div>

          <div className='flex items-center justify-between text-xs text-muted-foreground'>
            <span>
              {t('Total invitation codes')}: {total}
            </span>
            <span>
              {t('Selected')}: {selectedIds.length}
            </span>
          </div>

          <ScrollArea className='h-[420px] rounded-md border'>
            <div className='divide-y'>
              {loading ? (
                <div className='p-4 text-sm text-muted-foreground'>
                  {t('Loading invitation codes...')}
                </div>
              ) : items.length === 0 ? (
                <div className='p-4 text-sm text-muted-foreground'>
                  {t('No invitation codes yet. Generate one above to get started.')}
                </div>
              ) : (
                items.map((item) => {
                  const status = getStatusConfig(item.status, t)
                  return (
                    <div
                      key={item.id}
                      className='flex gap-3 p-3 transition-colors hover:bg-muted/40'
                    >
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) =>
                            checked
                              ? [...prev, item.id]
                              : prev.filter((id) => id !== item.id)
                          )
                        }}
                        className='mt-1'
                      />
                      <div className='min-w-0 flex-1 space-y-2'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <code className='rounded bg-muted px-2 py-1 text-xs'>
                            {item.code}
                          </code>
                          <StatusBadge
                            label={status.label}
                            variant={status.variant}
                            copyable={false}
                          />
                        </div>
                        {item.remark ? (
                          <p className='text-sm text-muted-foreground'>
                            {item.remark}
                          </p>
                        ) : null}
                        <div className='text-xs text-muted-foreground'>
                          {t('Created at')}: {formatTimestamp(item.created_time)}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => copyLinks([item])}
                            disabled={item.status !== 1}
                          >
                            {t('Copy Link')}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => copyCodes([item])}
                            disabled={item.status !== 1}
                          >
                            {t('Copy Code')}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => handleDeleteSelected([item.id])}
                          >
                            {t('Delete')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>

          <div className='flex items-center justify-between'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
            >
              {t('Previous')}
            </Button>
            <span className='text-xs text-muted-foreground'>
              {t('Page')} {page} / {totalPages}
            </span>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages || loading}
            >
              {t('Next')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Batch Create Invitation Codes')}</DialogTitle>
            <DialogDescription>
              {t('Generate multiple invitation codes at once.')}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <LabelText>{t('Quantity')}</LabelText>
              <Input
                type='number'
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) =>
                  setBatchCount(
                    Number.isFinite(e.target.valueAsNumber)
                      ? Math.max(1, Math.min(100, e.target.valueAsNumber))
                      : DEFAULT_BATCH_COUNT
                  )
                }
              />
            </div>
            <div className='grid gap-2'>
              <LabelText>{t('Remark')}</LabelText>
              <Input
                value={batchRemark}
                onChange={(e) => setBatchRemark(e.target.value)}
                placeholder={t('Optional note for this batch')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setBatchDialogOpen(false)}
              disabled={batchCreating}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleBatchGenerate} disabled={batchCreating}>
              {batchCreating ? t('Creating...') : t('Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LabelText(props: { children: ReactNode }) {
  return <div className='text-sm font-medium'>{props.children}</div>
}
