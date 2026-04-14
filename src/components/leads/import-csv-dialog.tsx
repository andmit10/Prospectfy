'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import {
  parseCsv,
  parseXlsx,
  normalizeWhatsapp,
  isValidBrPhone,
  COLUMN_LABELS,
  REQUIRED_FIELDS,
  type RawRow,
} from '@/lib/csv-import'
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react'

type Step = 'upload' | 'mapping' | 'preview' | 'done'
type FieldMap = Record<string, string> // fieldName → csvColumn

interface ImportCsvDialogProps {
  open: boolean
  onClose: () => void
}

export function ImportCsvDialog({ open, onClose }: ImportCsvDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<RawRow[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [fieldMap, setFieldMap] = useState<FieldMap>({})
  const [validRows, setValidRows] = useState<RawRow[]>([])
  const [invalidCount, setInvalidCount] = useState(0)
  const [importing, setImporting] = useState(false)

  const utils = trpc.useUtils()
  const createLead = trpc.leads.create.useMutation()

  const handleFile = useCallback(async (file: File) => {
    try {
      let data: RawRow[]
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        data = await parseXlsx(file)
      } else {
        data = await parseCsv(file)
      }

      if (data.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos')
        return
      }

      const headers = Object.keys(data[0])
      setCsvHeaders(headers)
      setRows(data)

      // Auto-map columns by similarity
      const autoMap: FieldMap = {}
      for (const field of Object.keys(COLUMN_LABELS)) {
        const match = headers.find(
          (h) =>
            h.toLowerCase().replace(/[^a-z]/g, '') ===
            field.toLowerCase().replace(/_/g, '')
        )
        if (match) autoMap[field] = match
      }
      setFieldMap(autoMap)
      setStep('mapping')
    } catch {
      toast.error('Erro ao ler o arquivo. Verifique o formato.')
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function buildPreview() {
    const valid: RawRow[] = []
    let invalid = 0

    for (const row of rows) {
      const whatsappRaw = row[fieldMap['whatsapp'] ?? ''] ?? ''
      const whatsapp = normalizeWhatsapp(whatsappRaw)
      const empresa = row[fieldMap['empresa_nome'] ?? ''] ?? ''
      const decisor = row[fieldMap['decisor_nome'] ?? ''] ?? ''

      if (!empresa || !decisor || !isValidBrPhone(whatsapp)) {
        invalid++
        continue
      }
      valid.push({ ...row, _whatsapp_normalized: whatsapp })
    }

    setValidRows(valid)
    setInvalidCount(invalid)
    setStep('preview')
  }

  async function handleImport() {
    setImporting(true)
    let success = 0
    let errors = 0

    for (const row of validRows) {
      try {
        await createLead.mutateAsync({
          empresa_nome: row[fieldMap['empresa_nome']] ?? '',
          decisor_nome: row[fieldMap['decisor_nome']] ?? '',
          whatsapp: row['_whatsapp_normalized'],
          cnpj: row[fieldMap['cnpj'] ?? ''] || undefined,
          segmento: row[fieldMap['segmento'] ?? ''] || undefined,
          cidade: row[fieldMap['cidade'] ?? ''] || undefined,
          estado: row[fieldMap['estado'] ?? ''] || undefined,
          decisor_cargo: row[fieldMap['decisor_cargo'] ?? ''] || undefined,
          email: row[fieldMap['email'] ?? ''] || undefined,
          linkedin_url: row[fieldMap['linkedin_url'] ?? ''] || undefined,
          telefone: row[fieldMap['telefone'] ?? ''] || undefined,
        })
        success++
      } catch {
        errors++
      }
    }

    await utils.leads.list.invalidate()
    toast.success(`${success} leads importados${errors > 0 ? `, ${errors} com erro (duplicados)` : ''}`)
    setImporting(false)
    setStep('done')
  }

  function handleClose() {
    setStep('upload')
    setRows([])
    setCsvHeaders([])
    setFieldMap({})
    setValidRows([])
    setInvalidCount(0)
    onClose()
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !fieldMap[f])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar leads</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-10 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Arraste um arquivo CSV ou XLSX</p>
              <p className="text-sm text-muted-foreground">ou clique para selecionar</p>
            </div>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">
              {rows.length} linhas encontradas. Mapeie as colunas do arquivo para os campos do sistema.
            </p>
            {Object.entries(COLUMN_LABELS).map(([field, label]) => (
              <div key={field} className="flex items-center gap-3">
                <span className="w-40 text-sm shrink-0">{label}</span>
                <Select
                  value={fieldMap[field] ?? '__none__'}
                  onValueChange={(v) => {
                    const val = v ?? ''
                    setFieldMap((prev) => {
                      const next: FieldMap = { ...prev }
                      next[field] = val === '__none__' ? '' : val
                      return next
                    })
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecionar coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— não importar —</SelectItem>
                    {csvHeaders.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {missingRequired.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Campos obrigatórios não mapeados: {missingRequired.join(', ')}
              </p>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{validRows.length} leads válidos para importar</p>
                {invalidCount > 0 && (
                  <p className="text-muted-foreground">
                    {invalidCount} linhas ignoradas (WhatsApp inválido ou campos obrigatórios vazios)
                  </p>
                )}
              </div>
            </div>
            <div className="rounded border max-h-48 overflow-y-auto text-xs">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Decisor</th>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r[fieldMap['decisor_nome']]}</td>
                      <td className="p-2">{r[fieldMap['empresa_nome']]}</td>
                      <td className="p-2 font-mono">{r['_whatsapp_normalized']}</td>
                    </tr>
                  ))}
                  {validRows.length > 10 && (
                    <tr className="border-t">
                      <td colSpan={3} className="p-2 text-muted-foreground text-center">
                        +{validRows.length - 10} mais...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-medium">Importação concluída!</p>
          </div>
        )}

        <DialogFooter>
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={buildPreview} disabled={missingRequired.length > 0}>
                Pré-visualizar
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                {importing ? 'Importando...' : `Importar ${validRows.length} leads`}
              </Button>
            </>
          )}
          {(step === 'upload' || step === 'done') && (
            <Button variant="outline" onClick={handleClose}>
              {step === 'done' ? 'Fechar' : 'Cancelar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
