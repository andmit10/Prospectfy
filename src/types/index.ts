export type PipelineStatus =
  | 'novo'
  | 'contatado'
  | 'respondeu'
  | 'reuniao'
  | 'convertido'
  | 'perdido'

export type LeadFonte = 'csv_import' | 'manual' | 'google_maps' | 'api'

export type CanalTipo = 'whatsapp' | 'email' | 'linkedin' | 'landing_page'

export type InteracaoTipo =
  | 'enviado'
  | 'entregue'
  | 'lido'
  | 'respondido'
  | 'clicado'
  | 'bounce'
  | 'erro'

export type CampaignStatus = 'rascunho' | 'ativa' | 'pausada' | 'concluida'

export interface Lead {
  id: string
  user_id: string
  campaign_id: string | null
  empresa_nome: string
  cnpj: string | null
  segmento: string | null
  cidade: string | null
  estado: string | null
  decisor_nome: string
  decisor_cargo: string | null
  email: string | null
  email_status: 'valid' | 'catch_all' | 'invalid' | 'unknown'
  linkedin_url: string | null
  telefone: string | null
  whatsapp: string
  lead_score: number
  fonte: LeadFonte
  status_pipeline: PipelineStatus
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Campaign {
  id: string
  user_id: string
  nome: string
  descricao: string | null
  status: CampaignStatus
  meta_reunioes: number | null
  total_leads: number
  total_enviados: number
  total_respondidos: number
  total_reunioes: number
  created_at: string
  updated_at: string
}

export interface CadenciaStep {
  id: string
  campaign_id: string
  step_order: number
  canal: CanalTipo
  delay_hours: number
  mensagem_template: string
  tipo_mensagem: 'texto' | 'imagem' | 'documento' | 'audio'
  ativo: boolean
  created_at: string
}

export interface Interaction {
  id: string
  lead_id: string
  campaign_id: string | null
  step_id: string | null
  canal: CanalTipo
  tipo: InteracaoTipo
  mensagem_enviada: string | null
  resposta_lead: string | null
  agent_reasoning: string | null
  metadata: Record<string, unknown>
  created_at: string
}
