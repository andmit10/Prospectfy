# PRD — Orbya SaaS: Plataforma de Prospecção Inteligente

> Versão: 1.0 | Abril 2026 | Fase 1 — MVP

---

## 1. Visão do produto

Plataforma SaaS que automatiza prospecção B2B para PMEs brasileiras usando agentes de IA + WhatsApp (Directfy) como canal principal. O usuário importa uma lista de leads, configura cadências de mensagens e o agente de IA dispara, personaliza e acompanha automaticamente.

### Personas
- **SDR solo/freelancer**: precisa prospectar para vários clientes, busca automação
- **Dono de agência**: quer oferecer prospecção como serviço para seus clientes
- **Empresário PME**: time comercial de 1-5 pessoas, usa WhatsApp para vender

### Proposta de valor
"Importe sua lista, configure a cadência e deixe o agente de IA prospectar via WhatsApp enquanto você foca em fechar negócios."

---

## 2. Fase 1 — MVP: Escopo detalhado

### 2.1 Módulo: Importação de leads

**User stories:**
- Como usuário, quero importar leads via CSV/XLSX para começar rapidamente
- Como usuário, quero ver o status de cada lead (completo, parcial, pendente)
- Como usuário, quero editar dados de um lead manualmente

**Campos do lead:**
```
id: uuid (auto)
empresa_nome: string (required)
cnpj: string (optional)
segmento: string (optional)
cidade: string (optional)
estado: string (optional)
decisor_nome: string (required)
decisor_cargo: string (optional)
email: string (optional)
email_status: enum [valid, catch_all, invalid, unknown]
linkedin_url: string (optional)
telefone: string (optional)
whatsapp: string (required — pré-requisito para disparo)
lead_score: integer (default: 0)
fonte: enum [csv_import, manual, google_maps, api]
status_pipeline: enum [novo, contatado, respondeu, reuniao, convertido, perdido]
tags: text[] (array de tags)
created_at: timestamptz
updated_at: timestamptz
deleted_at: timestamptz (soft delete)
user_id: uuid (FK → auth.users)
campaign_id: uuid (FK → campaigns, nullable)
```

**Funcionalidades:**
- Upload CSV/XLSX com mapeamento de colunas (drag-and-drop)
- Validação automática: whatsapp obrigatório, formato de telefone BR
- Deduplicação por whatsapp + empresa_nome
- Bulk edit: adicionar tags, mover para campanha
- Filtros: por status, tags, score, fonte, data
- Export: CSV com todos os campos

### 2.2 Módulo: Campanhas + Cadências

**User stories:**
- Como usuário, quero criar uma campanha com nome, segmento e meta
- Como usuário, quero definir uma cadência de mensagens com intervalos
- Como usuário, quero usar variáveis (nome, empresa) nas mensagens
- Como usuário, quero que o agente pare de enviar quando o lead responder

**Modelo de dados — campanha:**
```
id: uuid
nome: string
descricao: string (optional)
status: enum [rascunho, ativa, pausada, concluida]
meta_reunioes: integer (optional)
created_at: timestamptz
updated_at: timestamptz
user_id: uuid (FK)
```

**Modelo de dados — cadência (steps):**
```
id: uuid
campaign_id: uuid (FK)
step_order: integer (1, 2, 3...)
canal: enum [whatsapp, email, linkedin, landing_page]
delay_hours: integer (horas após step anterior)
mensagem_template: text (com {{variáveis}})
tipo_mensagem: enum [texto, imagem, documento, audio]
ativo: boolean (default true)
```

**Modelo de dados — interação:**
```
id: uuid
lead_id: uuid (FK)
campaign_id: uuid (FK)
step_id: uuid (FK)
canal: enum [whatsapp, email, linkedin, landing_page]
tipo: enum [enviado, entregue, lido, respondido, clicado, bounce, erro]
mensagem_enviada: text
resposta_lead: text (nullable)
metadata: jsonb (timestamps de cada status, IDs externos)
created_at: timestamptz
```

**Funcionalidades:**
- Wizard de criação: nome → adicionar leads → configurar steps → ativar
- Editor de mensagem com variáveis: {{decisor_nome}}, {{empresa_nome}}, {{segmento}}
- Preview de mensagem com dados reais do primeiro lead
- Pausa automática: quando lead responde, para cadência e notifica usuário
- Dashboard por campanha: leads enviados, lidos, respondidos, reuniões

### 2.3 Módulo: Agente de prospecção (IA)

**User stories:**
- Como usuário, quero que o agente personalize mensagens automaticamente
- Como usuário, quero que o agente escolha o melhor horário de envio
- Como usuário, quero ver o log de decisões do agente

**Arquitetura do agente:**

O agente usa Claude API com tool_use. A cada execução (cron job a cada hora):

1. Buscar leads com ação pendente (step_order + delay cumprido)
2. Para cada lead, injetar contexto no prompt:
   - Dados do lead (nome, cargo, empresa, segmento)
   - Histórico de interações
   - Score atual
   - Template da cadência (step atual)
3. Claude gera mensagem personalizada usando o template como base
4. Executa a tool correspondente ao canal (send_whatsapp, etc.)
5. Registra interação no banco

**Tools do agente (tool_use schemas):**

```typescript
// send_whatsapp
{
  name: "send_whatsapp",
  description: "Enviar mensagem WhatsApp via Directfy",
  input_schema: {
    type: "object",
    properties: {
      phone: { type: "string", description: "Número WhatsApp com DDI (ex: 5531999999999)" },
      message: { type: "string", description: "Mensagem personalizada" },
      lead_id: { type: "string", description: "UUID do lead" }
    },
    required: ["phone", "message", "lead_id"]
  }
}

// update_lead_score
{
  name: "update_lead_score",
  description: "Atualizar score do lead baseado em interação",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      points: { type: "integer", description: "Pontos a adicionar (positivo) ou remover (negativo)" },
      reason: { type: "string", description: "Motivo da atualização" }
    },
    required: ["lead_id", "points", "reason"]
  }
}

// move_pipeline_stage  
{
  name: "move_pipeline_stage",
  description: "Mover lead para outro estágio do pipeline",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      new_status: { type: "string", enum: ["novo","contatado","respondeu","reuniao","convertido","perdido"] }
    },
    required: ["lead_id", "new_status"]
  }
}

// schedule_meeting (Fase 1: apenas gera link Calendly)
{
  name: "schedule_meeting",
  description: "Enviar link de agendamento quando lead está quente",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      calendly_url: { type: "string" }
    },
    required: ["lead_id", "calendly_url"]  
  }
}
```

**Prompt do agente (system):**
```
Você é um SDR digital da {{empresa_usuario}}. Seu objetivo é agendar reuniões de vendas.

Regras:
- Personalize cada mensagem com dados do lead
- Mantenha tom profissional mas casual (WhatsApp é informal no Brasil)
- Mensagens curtas: máximo 3 parágrafos
- Inclua uma pergunta ou CTA no final
- Se o lead já respondeu positivamente, envie link de agendamento
- Se o lead pediu para parar, respeite e marque como "perdido"
- Horários de envio: seg-sex, 8h-18h (horário de Brasília)

Contexto do lead:
Nome: {{decisor_nome}}
Cargo: {{decisor_cargo}}
Empresa: {{empresa_nome}}
Segmento: {{segmento}}
Score: {{lead_score}}
Histórico: {{historico_interacoes}}
Step atual: {{step_order}} de {{total_steps}}
Template sugerido: {{mensagem_template}}
```

### 2.4 Módulo: Dashboard

**Páginas:**
1. `/dashboard` — Overview: leads ativos, campanhas, métricas gerais
2. `/leads` — Lista de leads com filtros, bulk actions
3. `/leads/[id]` — Detalhe do lead: dados + timeline de interações
4. `/campaigns` — Lista de campanhas com status
5. `/campaigns/[id]` — Detalhe: cadência + leads + métricas
6. `/campaigns/new` — Wizard de criação
7. `/settings` — Conta, integrações (Directfy API key, Calendly), billing

**Componentes core (shadcn/ui):**
- DataTable com sort, filter, pagination (leads, campaigns)
- KanbanBoard para pipeline visual (drag-and-drop)
- TimelineView para histórico de interações
- StepEditor para configurar cadência
- MessagePreview para preview com variáveis
- MetricCards para stats (leads, envios, respostas, reuniões)

---

## 3. Requisitos não-funcionais

- **Performance**: dashboard carrega em < 2s, lista de 1000 leads em < 1s
- **Segurança**: RLS em todas tabelas, API keys encriptadas, rate limiting
- **Multi-tenant**: isolamento total por user_id, nunca cruzar dados
- **Mobile**: dashboard responsivo (mobile-first não é prioridade no MVP)
- **Idioma**: interface 100% em pt-BR, código em inglês

---

## 4. Integrações MVP

| Serviço | Uso | Config |
|---------|-----|--------|
| Directfy | WhatsApp send/receive | API key no settings |
| Supabase | DB + Auth + Realtime | Env vars |
| Claude API | Agent intelligence | API key server-side |
| Calendly | Meeting scheduling | URL no settings |
| Stripe | Billing | API key server-side |

---

## 5. Critérios de aceite do MVP

- [ ] Usuário cria conta via magic link
- [ ] Usuário importa CSV com 500 leads em < 30s
- [ ] Usuário cria campanha com 5 steps de WhatsApp
- [ ] Agente personaliza e envia mensagens via Directfy
- [ ] Interações aparecem na timeline do lead em real-time
- [ ] Lead score atualiza automaticamente
- [ ] Dashboard mostra métricas: enviados, lidos, respondidos
- [ ] Campanha pausa automaticamente quando lead responde
- [ ] Usuário exporta leads para CSV
- [ ] Billing funciona (R$197/mês via Stripe)
