import { useState, useEffect, useCallback } from 'react'
import { Download, Search, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { useAuthStore } from '@renderer/stores/authStore'

interface AuditEntry {
  id: string
  timestamp: string
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
}

const ACTION_BADGE_VARIANTS: Record<string, string> = {
  SALE_CREATED: 'bg-green-100 text-green-800',
  SALE_VOIDED: 'bg-red-100 text-red-800',
  SALE_REFUNDED: 'bg-orange-100 text-orange-800',
  USER_LOGIN: 'bg-blue-100 text-blue-800',
  USER_LOGOUT: 'bg-gray-100 text-gray-700',
  STOCK_ADJUSTED: 'bg-yellow-100 text-yellow-800',
  PRODUCT_CREATED: 'bg-purple-100 text-purple-800',
  PRODUCT_UPDATED: 'bg-purple-100 text-purple-800',
  PRODUCT_DELETED: 'bg-red-100 text-red-800',
  SHIFT_STARTED: 'bg-teal-100 text-teal-800',
  SHIFT_ENDED: 'bg-teal-100 text-teal-800',
  SETTINGS_UPDATED: 'bg-indigo-100 text-indigo-800'
}

export function AuditLogPage(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const PAGE_SIZE = 50

  const loadEntries = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.audit.query(userId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action: actionFilter || undefined
      })
      setEntries(result.entries)
      setTotal(result.total)
    } finally {
      setIsLoading(false)
    }
  }, [page, actionFilter, userId])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleExport = async () => {
    await window.electron.audit.exportCsv(userId, {
      action: actionFilter || undefined
    })
  }

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString('en-LK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const parseDetails = (details: string | null): string => {
    if (!details) return ''
    try {
      const obj = JSON.parse(details)
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    } catch {
      return details
    }
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Immutable record of all system actions — {total.toLocaleString()} entries
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadEntries} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by action (e.g. SALE_CREATED)"
                className="pl-8"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value)
                  setPage(0)
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No audit entries found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-44">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">
                    User
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-48">
                    Action
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">
                    Entity
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-4 py-2 font-medium truncate max-w-0">
                      {entry.user_name ?? (
                        <span className="text-muted-foreground italic">system</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ACTION_BADGE_VARIANTS[entry.action] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{entry.entity_type}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-xs">
                      {parseDetails(entry.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
