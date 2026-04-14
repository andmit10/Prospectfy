'use client'

import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PipelineBadge } from './pipeline-badge'
import { trpc } from '@/lib/trpc-client'
import { ArrowUpDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Lead, PipelineStatus } from '@/types'
import Link from 'next/link'
import { ImportCsvDialog } from './import-csv-dialog'

const columns: ColumnDef<Lead>[] = [
  {
    accessorKey: 'decisor_nome',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Decisor <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link href={`/leads/${row.original.id}`} className="font-medium hover:underline">
        {row.original.decisor_nome}
      </Link>
    ),
  },
  {
    accessorKey: 'empresa_nome',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Empresa <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'whatsapp',
    header: 'WhatsApp',
  },
  {
    accessorKey: 'segmento',
    header: 'Segmento',
    cell: ({ getValue }) => getValue() ?? '—',
  },
  {
    accessorKey: 'status_pipeline',
    header: 'Status',
    cell: ({ getValue }) => (
      <PipelineBadge status={getValue() as PipelineStatus} />
    ),
  },
  {
    accessorKey: 'lead_score',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Score <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">{getValue() as number}</span>
    ),
  },
]

export function LeadsTable() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [importOpen, setImportOpen] = useState(false)
  const pageSize = 50

  const { data, isLoading } = trpc.leads.list.useQuery({
    page,
    pageSize,
    search: search || undefined,
  })

  const table = useReactTable({
    data: data?.leads ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  })

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar por nome ou empresa..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Importar CSV
          </Button>
          <Button render={<Link href="/leads/new" />}>
            <Plus className="mr-1 h-4 w-4" /> Novo lead
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Nenhum lead encontrado. Importe um CSV para começar.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data?.total ?? 0} leads · página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ImportCsvDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
