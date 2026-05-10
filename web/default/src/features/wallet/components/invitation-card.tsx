import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Copy, Plus, Trash2 } from 'lucide-react'

interface InvitationCodeItem {
  id: number
  code: string
  quota: number
  status: number
  used_user_id: number
  used_time: number
  created_time: number
  remark: string
}

interface InvitationCodePage {
  items: InvitationCodeItem[]
  total: number
}

export function InvitationCard() {
  const { t } = useTranslation()
  const [codes, setCodes] = useState<InvitationCodeItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(1)
  const [remark, setRemark] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(
        `/api/invitation_code/mine?p=${page}&page_size=${pageSize}`
      )
      if (res.data.success) {
        const data = res.data.data as InvitationCodePage
        setCodes(data.items || [])
        setTotal(data.total || 0)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    loadCodes()
  }, [loadCodes])

  const handleGenerate = async () => {
    if (generateCount <= 0 || generateCount > 100) {
      toast.error(t('数量必须在 1-100 之间'))
      return
    }
    setGenerating(true)
    try {
      const res = await api.post('/api/invitation_code/generate', {
        count: generateCount,
        remark: remark || undefined,
      })
      if (res.data.success) {
        toast.success(
          t('创建成功，生成了 {{count}} 个邀请码', {
            count: res.data.data.count,
          })
        )
        setRemark('')
        loadCodes()
      } else {
        toast.error(res.data.message)
      }
    } catch {
      toast.error(t('创建失败'))
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/register?invitation_code=${code}`
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success(t('已复制到剪贴板')))
      .catch(() => toast.error(t('复制失败')))
  }

  const handleBatchDelete = async () => {
    try {
      const res = await api.post('/api/invitation_code/mine/delete_used')
      if (res.data.success) {
        toast.success(t('清理成功，删除了 {{count}} 条', { count: res.data.data.deleted }))
        loadCodes()
      }
    } catch {
      toast.error(t('清理失败'))
    }
  }

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 1:
        return <Badge variant='outline' className='text-green-600 border-green-600'>{t('未使用')}</Badge>
      case 2:
        return <Badge variant='secondary'>{t('已使用')}</Badge>
      case 3:
        return <Badge variant='destructive'>{t('已禁用')}</Badge>
      default:
        return <Badge variant='secondary'>{t('未知')}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-4'>
        <CardTitle className='text-base'>{t('我的邀请码')}</CardTitle>
        <Button
          variant='outline'
          size='sm'
          onClick={handleBatchDelete}
          className='gap-1'
        >
          <Trash2 className='h-3.5 w-3.5' />
          {t('清理已使用')}
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Generate section */}
        <div className='flex flex-wrap items-end gap-2'>
          <div className='grid gap-1.5'>
            <Label className='text-xs'>{t('数量')}</Label>
            <Input
              type='number'
              min={1}
              max={100}
              value={generateCount}
              onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
              className='w-20 h-8'
            />
          </div>
          <div className='grid gap-1.5 flex-1 min-w-[150px]'>
            <Label className='text-xs'>{t('备注（可选）')}</Label>
            <Input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder={t('备注')}
              className='h-8'
            />
          </div>
          <Button
            size='sm'
            onClick={handleGenerate}
            disabled={generating}
            className='gap-1'
          >
            <Plus className='h-3.5 w-3.5' />
            {generating ? t('生成中...') : t('生成邀请码')}
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : codes.length === 0 ? (
          <p className='text-muted-foreground text-sm text-center py-4'>
            {t('暂无邀请码')}
          </p>
        ) : (
          <>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('邀请码')}</TableHead>
                    <TableHead className='w-20'>{t('状态')}</TableHead>
                    <TableHead className='w-32'>{t('创建时间')}</TableHead>
                    <TableHead className='w-16'>{t('操作')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className='font-mono text-xs'>
                        {item.code.slice(0, 16)}...
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className='text-xs'>
                        {item.created_time
                          ? new Date(item.created_time * 1000).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {item.status === 1 && (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-7 w-7 p-0'
                            onClick={() => handleCopyLink(item.code)}
                          >
                            <Copy className='h-3.5 w-3.5' />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {total > pageSize && (
              <div className='flex justify-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('上一页')}
                </Button>
                <span className='text-sm text-muted-foreground leading-8'>
                  {page} / {Math.ceil(total / pageSize)}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('下一页')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
