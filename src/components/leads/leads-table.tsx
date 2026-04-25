'use client'

import { Fragment, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PipelineBadge } from './pipeline-badge'
import { EditableCell } from './editable-cell'
import { trpc } from '@/lib/trpc-client'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Download,
  Tag,
  Trash2,
  X,
  ArrowRightLeft,
  KanbanSquare,
  Link2,
  Mail,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react'
import {
  StarRating,
  SourceBadge,
  ScoreBadge,
  getMeta,
  deriveFontesAtivas,
} from './lead-visuals'
import type { Lead, PipelineStatus } from '@/types'
import Link from 'next/link'
import { ImportCsvDialog } from './import-csv-dialog'
import { AssignPipelineDialog } from './assign-pipeline-dialog'
import { LeadDetailPanel } from './lead-detail-panel'
import { LeadMobileCards } from './lead-mobile-cards'
import { toast } from 'sonner'

const PIPELINE_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'contatado', label: 'Contatado' },
  { value: 'respondeu', label: 'Respondeu' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'perdido', label: 'Perdido' },
]

type PipelineFilter = 'all' | 'none' | string // uuid | 'all' | 'none'

export function LeadsTable() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [importOpen, setImportOpen] = useState(false)
  const [assignPipelineOpen, setAssignPipelineOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('all')
  const [segmentoFilter, setSegmentoFilter] = useState('')
  const [cidadeFilter, setCidadeFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pageSize = 50

  const utils = trpc.useUtils()

  const { data: pipelines } = trpc.pipelines.list.useQuery()

  const pipelineIdMap = (pipelines ?? []).reduce<Record<string, { nome: string; color: string | null }>>(
    (acc, p) => {
      acc[p.id] = { nome: p.nome, color: p.color ?? null }
      return acc
    },
    {}
  )

  const pipelineQueryArg: string | null | undefined =
    pipelineFilter === 'all' ? undefined : pipelineFilter === 'none' ? null : pipelineFilter

  const { data, isLoading } = trpc.leads.list.useQuery({
    page,
    pageSize,
    search: search || undefined,
    pipelineId: pipelineQueryArg,
    segmento: segmentoFilter.trim() || undefined,
    cidade: cidadeFilter.trim() || undefined,
  })

  const bulkUpdateTags = trpc.leads.bulkUpdateTags.useMutation({
    onSuccess: () => {
      toast.success('Tags atualizadas com sucesso')
      utils.leads.list.invalidate()
      setRowSelection({})
      setTagInput('')
      setShowTagInput(false)
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar tags: ${error.message}`)
    },
  })

  const bulkUpdateStatus = trpc.leads.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success('Status atualizado com sucesso')
      utils.leads.list.invalidate()
      setRowSelection({})
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar status: ${error.message}`)
    },
  })

  const bulkDelete = trpc.leads.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success('Leads excluídos com sucesso')
      utils.leads.list.invalidate()
      setRowSelection({})
    },
    onError: (error) => {
      toast.error(`Erro ao excluir leads: ${error.message}`)
    },
  })

  const columns: ColumnDef<Lead>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => {
            table.toggleAllPageRowsSelected(!!checked)
          }}
          aria-label="Selecionar todos"
          // Borda mais escura + tamanho maior pra destacar do fundo bege/creme.
          // Default era border-input (cinza muito claro) — usuário não enxergava.
          className="size-5 border-2 border-[var(--text-secondary)] data-checked:border-[var(--primary)]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => {
            row.toggleSelected(!!checked)
          }}
          aria-label="Selecionar linha"
          className="size-5 border-2 border-[var(--text-secondary)] data-checked:border-[var(--primary)]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    // EXPAND — inline detail toggle (Empresa, Decisor, Contato, Histórico)
    {
      id: 'expand',
      header: () => <span className="sr-only">Expandir</span>,
      cell: ({ row }) => {
        const isOpen = expandedId === row.original.id
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpandedId(isOpen ? null : row.original.id)
            }}
            aria-label={isOpen ? 'Fechar detalhes' : 'Abrir detalhes'}
            className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-2)]"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
            )}
          </button>
        )
      },
      enableSorting: false,
    },
    // SCORE — colored badge (same visual DNA as the generator preview)
    {
      accessorKey: 'lead_score',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
          Score <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <ScoreBadge score={row.original.lead_score} />,
    },
    // # — index within the current page
    {
      id: 'row_number',
      header: '#',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {String((page - 1) * pageSize + row.index + 1).padStart(3, '0')}
        </span>
      ),
      enableSorting: false,
    },
    // EMPRESA / CNPJ — nome + CNPJ mono + segmento stacked
    {
      accessorKey: 'empresa_nome',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
          Empresa / CNPJ <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/leads/${row.original.id}`}
            className="block truncate text-sm font-semibold text-[var(--text-primary)] hover:underline"
          >
            {row.original.empresa_nome}
          </Link>
          <p className="font-mono text-[11px] text-[var(--text-tertiary)]">
            {row.original.cnpj || '—'}
          </p>
        </div>
      ),
    },
    // ENDEREÇO — logradouro + bairro/cep OR cidade/estado fallback
    {
      id: 'endereco',
      header: 'Endereço',
      cell: ({ row }) => {
        const meta = getMeta(row.original.metadata)
        const hasLogradouro = !!meta.logradouro
        const line1 = hasLogradouro
          ? `${meta.logradouro}${meta.numero ? `, ${meta.numero}` : ''}`
          : [row.original.cidade, row.original.estado].filter(Boolean).join('/') || '—'
        const line2 =
          meta.bairro ??
          (hasLogradouro
            ? [row.original.cidade, row.original.estado].filter(Boolean).join('/')
            : meta.cep || '')
        return (
          <div className="min-w-0">
            <p className="truncate text-sm text-[var(--text-primary)]">{line1}</p>
            <p className="text-[11px] text-[var(--text-tertiary)] truncate">
              {line2}
              {meta.cep && hasLogradouro ? ` · ${meta.cep}` : ''}
            </p>
          </div>
        )
      },
    },
    // TELEFONE / RATING — phone (editável) + stars from maps
    {
      id: 'tel_rating',
      header: 'Telefone / Rating',
      cell: ({ row }) => {
        const meta = getMeta(row.original.metadata)
        return (
          <div>
            <EditableCell
              leadId={row.original.id}
              field="telefone"
              value={row.original.telefone || row.original.whatsapp}
              className="text-sm text-[var(--text-primary)]"
            />
            <div className="mt-0.5 flex items-center gap-1">
              <StarRating rating={meta.rating_maps ?? 0} />
              {!!meta.total_avaliacoes && meta.total_avaliacoes > 0 && (
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  ({meta.total_avaliacoes})
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    // PORTE — funcionarios_estimados from metadata
    {
      id: 'porte',
      header: 'Porte',
      cell: ({ row }) => {
        const meta = getMeta(row.original.metadata)
        const n = meta.funcionarios_estimados ?? 0
        if (n <= 0) return <span className="text-xs text-[var(--text-tertiary)]">—</span>
        return (
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{n}+</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">func.</p>
          </div>
        )
      },
    },
    // WEBSITE — icon-only (same pattern as LinkedIn)
    {
      id: 'website',
      header: () => <span className="block text-center">Website</span>,
      cell: ({ row }) => {
        const meta = getMeta(row.original.metadata)
        if (!meta.website) {
          return <div className="text-center text-xs text-[var(--text-tertiary)]">—</div>
        }
        const cleanLabel = meta.website
          .replace(/^https?:\/\/(www\.)?/, '')
          .replace(/\/$/, '')
        return (
          <div className="text-center">
            <a
              href={meta.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_15%,transparent)]"
              title={cleanLabel}
            >
              <ExternalLink className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
            </a>
          </div>
        )
      },
    },
    // DECISOR — name (link, editável via pencil) + cargo (inline edit)
    {
      accessorKey: 'decisor_nome',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
          Decisor <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <EditableCell
            leadId={row.original.id}
            field="decisor_nome"
            value={row.original.decisor_nome}
            className="text-sm font-medium text-[var(--text-primary)]"
          />
          <div className="text-[11px] text-[var(--text-tertiary)]">
            <EditableCell
              leadId={row.original.id}
              field="decisor_cargo"
              value={row.original.decisor_cargo}
            />
          </div>
        </div>
      ),
    },
    // LINKEDIN — icon link
    {
      id: 'linkedin',
      header: () => <span className="block text-center">LinkedIn</span>,
      cell: ({ row }) =>
        row.original.linkedin_url ? (
          <div className="text-center">
            <a
              href={row.original.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[color-mix(in_oklab,#0A66C2_15%,transparent)]"
              title="Ver LinkedIn"
            >
              <Link2 className="h-3.5 w-3.5" style={{ color: '#0A66C2' }} />
            </a>
          </div>
        ) : (
          <div className="text-center text-xs text-[var(--text-tertiary)]">—</div>
        ),
    },
    // EMAIL — icon (with tooltip)
    {
      id: 'email',
      header: () => <span className="block text-center">Email</span>,
      cell: ({ row }) =>
        row.original.email ? (
          <div className="text-center">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded"
              title={row.original.email}
            >
              <Mail className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
            </span>
          </div>
        ) : (
          <div className="text-center text-xs text-[var(--text-tertiary)]">—</div>
        ),
    },
    // FONTES — colored dot badges (one per source)
    {
      id: 'fontes',
      header: 'Fontes',
      cell: ({ row }) => {
        const meta = getMeta(row.original.metadata)
        const ids = deriveFontesAtivas(meta, {
          linkedin_url: row.original.linkedin_url,
          email: row.original.email,
        })
        return (
          <div className="flex items-center gap-1">
            {ids.map((id) => (
              <SourceBadge key={id} id={id} />
            ))}
          </div>
        )
      },
    },
    // SEGMENTO — dedicated sortable column (also used as filter target)
    {
      accessorKey: 'segmento',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
          Segmento <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-xs text-[var(--text-tertiary)]">—</span>
        return (
          <span className="inline-flex items-center rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {v}
          </span>
        )
      },
    },
    // PIPELINE — colored pipeline badge
    {
      accessorKey: 'pipeline_id',
      header: 'Pipeline',
      cell: ({ row }) => {
        const id = row.original.pipeline_id
        if (!id) {
          return <span className="text-xs text-[var(--text-tertiary)]">—</span>
        }
        const p = pipelineIdMap[id]
        if (!p) return <span className="text-xs text-[var(--text-tertiary)]">—</span>
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `color-mix(in oklab, ${p.color ?? 'var(--primary)'} 12%, transparent)`,
              color: p.color ?? 'var(--primary)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: p.color ?? 'var(--primary)' }}
            />
            {p.nome}
          </span>
        )
      },
    },
    // STATUS — pipeline stage badge (novo/contatado/...)
    {
      accessorKey: 'status_pipeline',
      header: 'Status',
      cell: ({ getValue }) => (
        <PipelineBadge status={getValue() as PipelineStatus} />
      ),
    },
    // AÇÕES — botão "Enriquecer" (busca dados adicionais via Receita + website probe)
    {
      id: 'actions',
      header: () => <span className="block text-center">Ações</span>,
      cell: ({ row }) => <EnrichButton leadId={row.original.id} />,
      enableSorting: false,
    },
  ]

  const table = useReactTable({
    data: data?.leads ?? [],
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  })

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize)
  const selectedCount = table.getSelectedRowModel().rows.length

  function getSelectedLeadIds(): string[] {
    return table.getSelectedRowModel().rows.map((r) => r.original.id)
  }

  function handleAddTag() {
    const tag = tagInput.trim()
    if (!tag) return
    const ids = getSelectedLeadIds()
    if (ids.length === 0) return
    bulkUpdateTags.mutate({ leadIds: ids, addTags: [tag] })
  }

  function handleStatusChange(status: PipelineStatus) {
    const ids = getSelectedLeadIds()
    if (ids.length === 0) return
    bulkUpdateStatus.mutate({ leadIds: ids, status })
  }

  function handleBulkDelete() {
    const ids = getSelectedLeadIds()
    if (ids.length === 0) return
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir ${ids.length} lead(s)? Esta ação não pode ser desfeita.`
    )
    if (!confirmed) return
    bulkDelete.mutate({ leadIds: ids })
  }

  return (
    <div className="space-y-4">
      {/* Search + filters + action buttons row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nome ou empresa..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="max-w-xs"
          />
          <Input
            placeholder="Segmento..."
            value={segmentoFilter}
            onChange={(e) => { setSegmentoFilter(e.target.value); setPage(1) }}
            className="h-9 w-40"
          />
          <Input
            placeholder="Cidade..."
            value={cidadeFilter}
            onChange={(e) => { setCidadeFilter(e.target.value); setPage(1) }}
            className="h-9 w-36"
          />
          <Select
            value={pipelineFilter}
            onValueChange={(v) => {
              setPipelineFilter(v as PipelineFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-52">
              <SelectValue placeholder="Todos os pipelines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pipelines</SelectItem>
              <SelectItem value="none">Sem pipeline</SelectItem>
              {(pipelines ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}{p.is_default ? ' · padrão' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || segmentoFilter || cidadeFilter || pipelineFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setSegmentoFilter('')
                setCidadeFilter('')
                setPipelineFilter('all')
                setPage(1)
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Importar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open('/api/leads/export', '_blank')}
            title="Baixar planilha Excel (.xlsx) com todos os leads"
          >
            <Download className="mr-1 h-4 w-4" /> Exportar Excel
          </Button>
          <Button nativeButton={false} render={<Link href="/leads/new" />}>
            <Plus className="mr-1 h-4 w-4" /> Novo lead
          </Button>
        </div>
      </div>

      {/* Bulk action bar — visible when 1+ rows selected */}
      {selectedCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--primary) 30%, transparent)',
          }}
        >
          <span className="text-sm font-medium">
            {selectedCount} lead{selectedCount > 1 ? 's' : ''} selecionado{selectedCount > 1 ? 's' : ''}
          </span>

          <div className="h-4 w-px bg-border" />

          {/* Add tag */}
          {showTagInput ? (
            <div className="flex items-center gap-1">
              <Input
                placeholder="Digite a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag()
                  if (e.key === 'Escape') {
                    setShowTagInput(false)
                    setTagInput('')
                  }
                }}
                className="h-8 w-40"
                autoFocus
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || bulkUpdateTags.isPending}
              >
                Adicionar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowTagInput(false); setTagInput('') }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTagInput(true)}
            >
              <Tag className="mr-1 h-3 w-3" /> Adicionar Tag
            </Button>
          )}

          {/* Move status */}
          <Select onValueChange={(value) => handleStatusChange(value as PipelineStatus)}>
            <SelectTrigger className="h-8 w-44">
              <ArrowRightLeft className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Mover Status" />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Send to pipeline */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignPipelineOpen(true)}
          >
            <KanbanSquare className="mr-1 h-3 w-3" /> Enviar ao pipeline
          </Button>

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDelete.isPending}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Excluir
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRowSelection({})}
          >
            <X className="mr-1 h-3 w-3" /> Limpar seleção
          </Button>
        </div>
      )}

      {/* Mobile (<md): card list. Bulk actions / sort hidden below md — revisit
          if tablet usage grows beyond occasional. */}
      <LeadMobileCards
        leads={data?.leads ?? []}
        isLoading={isLoading}
        pipelineIdMap={pipelineIdMap}
      />

      {/* Table — bounded viewport so H/V scrollbars sit inside, not at page bottom.
          Sticky header + sticky select+expand columns keep context while scrolling. */}
      <div className="hidden md:block rounded-md border overflow-auto max-h-[calc(100vh-260px)]">
        <Table className="min-w-[1400px] [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-[var(--surface-1)]">
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
              table.getRowModel().rows.map((row) => {
                const isExpanded = expandedId === row.original.id
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : row.original.id)
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          onClick={
                            cell.column.id === 'select' ||
                            cell.column.id === 'expand'
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columns.length} className="p-0">
                          <LeadDetailPanel lead={row.original} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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

      <AssignPipelineDialog
        open={assignPipelineOpen}
        onOpenChange={setAssignPipelineOpen}
        leadIds={getSelectedLeadIds()}
        onAssigned={() => setRowSelection({})}
      />
    </div>
  )
}

/**
 * Botão "Enriquecer" por linha — chama leads.enrich, que roda BrasilAPI +
 * ReceitaWS + website probe e preenche apenas campos vazios do lead.
 *
 * Mostra o spinner durante a busca, toast com resumo dos findings ao fim,
 * e força refetch da listagem pra UI mostrar os campos novos imediatos.
 */
function EnrichButton({ leadId }: { leadId: string }) {
  const utils = trpc.useUtils()
  const enrich = trpc.leads.enrich.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate()
      if (data.updated) {
        toast.success('Dados atualizados', {
          description: data.findings.length > 0 ? data.findings.join(' · ') : undefined,
        })
      } else {
        toast.info('Nada novo encontrado', {
          description: data.findings.length > 0 ? data.findings.join(' · ') : 'Lead já está completo.',
        })
      }
    },
    onError: (err) => {
      toast.error('Falha no enriquecimento', { description: err.message })
    },
  })

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (!enrich.isPending) enrich.mutate({ id: leadId })
        }}
        disabled={enrich.isPending}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-hover)] disabled:opacity-50"
        title="Buscar dados adicionais (Receita + Website)"
      >
        {enrich.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {enrich.isPending ? 'Buscando...' : 'Enriquecer'}
      </button>
    </div>
  )
}
