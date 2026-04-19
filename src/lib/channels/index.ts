/**
 * Public surface of the Channels module + provider bootstrapping. Importing
 * this file once (from the tRPC router, the worker, and the webhook route)
 * is enough to register every provider with the dispatcher's registry.
 */

import { registerProvider } from './dispatcher'

// WhatsApp
import { directfyProvider } from './providers/whatsapp/directfy'
import { evolutionProvider } from './providers/whatsapp/evolution'
import { evolutionGoProvider } from './providers/whatsapp/evolution-go'
import { zapiProvider } from './providers/whatsapp/zapi'
import { genericWebhookProvider } from './providers/whatsapp/generic-webhook'

// Email
import { resendProvider } from './providers/email/resend'
import { sendgridProvider } from './providers/email/sendgrid'
import { smtpProvider } from './providers/email/smtp'

// LinkedIn
import { unipileProvider } from './providers/linkedin/unipile'

// Instagram
import { metaInstagramProvider } from './providers/instagram/meta'

let registered = false

export function registerAllProviders(): void {
  if (registered) return
  registered = true
  registerProvider(directfyProvider)
  registerProvider(evolutionProvider)
  registerProvider(evolutionGoProvider)
  registerProvider(zapiProvider)
  registerProvider(genericWebhookProvider)
  registerProvider(resendProvider)
  registerProvider(sendgridProvider)
  registerProvider(smtpProvider)
  registerProvider(unipileProvider)
  registerProvider(metaInstagramProvider)
}

// Register on module load so callers don't need to remember.
registerAllProviders()

// ── Catalog metadata for the settings UI ───────────────────────────────────
// This describes each provider's human-facing config: which fields to render
// in the form, which are secret (redacted in UI), and short risk notes.

export type ProviderFieldSpec = {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number' | 'email' | 'textarea' | 'checkbox'
  required: boolean
  placeholder?: string
  help?: string
}

export type ProviderCatalogEntry = {
  id: string
  channel: 'whatsapp' | 'email' | 'linkedin' | 'instagram'
  name: string
  description: string
  risk?: string
  priceNote?: string
  fields: ProviderFieldSpec[]
  /** Whether this provider supports inbound webhooks (status + replies). */
  hasWebhook: boolean
  /** Webhook URL suffix the customer must configure on the provider side. */
  webhookPath?: string
  /** Hide until the operator flips a feature flag (e.g. Meta review pending). */
  preview?: boolean
  /** Public marketing/pricing page — opens in a new tab from the card. */
  homepageUrl?: string
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'directfy',
    channel: 'whatsapp',
    name: 'Directfy (nativo Orbya)',
    description: 'Integração oficial do Orbya. Default recomendado para WhatsApp.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      {
        key: 'apiUrl',
        label: 'URL da API',
        type: 'url',
        required: false,
        placeholder: 'https://api.directfy.com',
      },
      {
        key: 'webhookSecret',
        label: 'Segredo do Webhook',
        type: 'password',
        required: false,
        help: 'Usado para verificar assinatura HMAC de eventos recebidos.',
      },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/whatsapp/directfy',
    homepageUrl: 'https://directfy.com',
  },
  {
    id: 'evolution',
    channel: 'whatsapp',
    name: 'Evolution API (self-host)',
    description: 'Gateway open-source baseado em Baileys. Requer VPS próprio.',
    risk:
      'Usa API não-oficial do WhatsApp. Meta pode banir a sessão. Adequado para planos Agency avançados.',
    fields: [
      { key: 'baseUrl', label: 'URL do servidor', type: 'url', required: true },
      { key: 'apiKey', label: 'API Key global', type: 'password', required: true },
      {
        key: 'instanceName',
        label: 'Nome da instância',
        type: 'text',
        required: true,
        placeholder: 'instancia-principal',
      },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/whatsapp/evolution',
    homepageUrl: 'https://evolution-api.com',
  },
  {
    id: 'evolution_go',
    channel: 'whatsapp',
    name: 'Evolution Go (self-host)',
    description:
      'Reescrita em Go do Evolution. Endpoints diferentes (POST /send/text). Self-host em VPS próprio.',
    risk:
      'Usa API não-oficial do WhatsApp. Mesmo risco de ban da Evolution clássica.',
    fields: [
      {
        key: 'baseUrl',
        label: 'URL do servidor',
        type: 'url',
        required: true,
        placeholder: 'https://seu-servidor:443',
      },
      {
        key: 'instanceToken',
        label: 'Token da instância (UUID)',
        type: 'password',
        required: true,
        help: 'Token gerado quando você criou a instância no painel Evolution Go.',
      },
      {
        key: 'instanceName',
        label: 'Nome da instância',
        type: 'text',
        required: true,
        placeholder: 'Labfy',
      },
      {
        key: 'instanceId',
        label: 'ID da instância (UUID, opcional)',
        type: 'text',
        required: false,
        help: 'Necessário para alguns endpoints administrativos (header instanceId).',
      },
      {
        key: 'globalApiKey',
        label: 'GLOBAL_API_KEY (opcional)',
        type: 'password',
        required: false,
        help: 'Apenas se for configurar webhook automaticamente via /instance/connect.',
      },
      {
        key: 'ignoreTls',
        label: 'Ignorar verificação TLS (cert autoassinado)',
        type: 'checkbox',
        required: false,
        help: 'Marque APENAS se o servidor usa cert autoassinado (ex: HTTPS num IP cru).',
      },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/whatsapp/evolution_go',
    homepageUrl: 'https://docs.evolutionfoundation.com.br/evolution-go',
  },
  {
    id: 'zapi',
    channel: 'whatsapp',
    name: 'Z-API',
    description: 'Gateway comercial brasileiro. Gerenciado, menor fricção que Evolution.',
    risk: 'Usa API não-oficial do WhatsApp. Mesmo risco de ban da Evolution.',
    priceNote: 'A partir de R$ 99/mês por instância',
    fields: [
      { key: 'instanceId', label: 'Instance ID', type: 'text', required: true },
      { key: 'instanceToken', label: 'Instance Token', type: 'password', required: true },
      { key: 'clientToken', label: 'Client Token (opcional)', type: 'password', required: false },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/whatsapp/zapi',
    homepageUrl: 'https://z-api.io/precos',
  },
  {
    id: 'generic_webhook',
    channel: 'whatsapp',
    name: 'Webhook genérico',
    description: 'Integre qualquer provedor HTTPS próprio. Orbya envia + recebe via webhooks.',
    fields: [
      { key: 'endpoint', label: 'Endpoint HTTPS', type: 'url', required: true },
      { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: true },
      {
        key: 'webhookSecret',
        label: 'Segredo HMAC (16+ chars)',
        type: 'password',
        required: true,
      },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/whatsapp/generic_webhook',
  },
  {
    id: 'resend',
    channel: 'email',
    name: 'Resend (recomendado)',
    description: 'Deliverability alta, API limpa, React Email. Primeira escolha.',
    priceNote: '3k emails/mês grátis; depois US$ 20/50k',
    fields: [
      { key: 'apiKey', label: 'API Key (re_...)', type: 'password', required: true },
      {
        key: 'fromAddress',
        label: 'Remetente verificado',
        type: 'text',
        required: true,
        placeholder: 'Orbya <sales@orbya.io>',
      },
      {
        key: 'webhookSigningSecret',
        label: 'Webhook signing secret (whsec_...)',
        type: 'password',
        required: false,
      },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/email/resend',
    homepageUrl: 'https://resend.com/pricing',
  },
  {
    id: 'sendgrid',
    channel: 'email',
    name: 'SendGrid',
    description: 'Enterprise-oriented, quota grátis 100 emails/dia.',
    priceNote: 'US$ 19.95/mês por 50k emails',
    fields: [
      { key: 'apiKey', label: 'API Key (SG.)', type: 'password', required: true },
      { key: 'fromAddress', label: 'Remetente verificado', type: 'email', required: true },
      { key: 'fromName', label: 'Nome do remetente', type: 'text', required: false },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/email/sendgrid',
    homepageUrl: 'https://sendgrid.com/pricing',
  },
  {
    id: 'smtp',
    channel: 'email',
    name: 'SMTP customizado',
    description: 'Conecte Amazon SES, Mailgun, Postfix, ou qualquer servidor SMTP.',
    fields: [
      { key: 'host', label: 'Host', type: 'text', required: true },
      { key: 'port', label: 'Porta', type: 'number', required: true, placeholder: '587' },
      { key: 'secure', label: 'TLS implícito (465)', type: 'checkbox', required: false },
      { key: 'username', label: 'Usuário', type: 'text', required: true },
      { key: 'password', label: 'Senha', type: 'password', required: true },
      { key: 'fromAddress', label: 'Remetente', type: 'email', required: true },
      { key: 'fromName', label: 'Nome do remetente', type: 'text', required: false },
    ],
    hasWebhook: false,
  },
  {
    id: 'unipile',
    channel: 'linkedin',
    name: 'Unipile (LinkedIn)',
    description:
      'Conecte LinkedIn via Unipile. Dois modelos: BYOU (você contrata Unipile e cola credenciais — grátis para o Prospectfy) ou Managed (Prospectfy gerencia por R$ 299/mês por conta).',
    risk:
      'LinkedIn proíbe automação no ToS. Unipile é a via mais segura, mas a conta pode ser banida em uso agressivo.',
    priceNote: 'BYOU: grátis · Managed: R$ 299/mês por conta conectada',
    fields: [
      { key: 'dsn', label: 'DSN', type: 'text', required: true, placeholder: 'api8.unipile.com:14001' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'accountId', label: 'Account ID', type: 'text', required: true },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/linkedin/unipile',
    homepageUrl: 'https://www.unipile.com/pricing',
  },
  {
    id: 'meta_instagram',
    channel: 'instagram',
    name: 'Instagram (Meta Business)',
    description:
      'Requer conta Business + Page FB + revisão de App Meta (4-8 semanas). Disponível após aprovação.',
    risk: 'Depende de aprovação da Meta e do cumprimento das regras de janela de 24h para DMs.',
    preview: true,
    fields: [
      { key: 'pageAccessToken', label: 'Page Access Token', type: 'password', required: true },
      {
        key: 'igBusinessAccountId',
        label: 'IG Business Account ID',
        type: 'text',
        required: true,
      },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
    ],
    hasWebhook: true,
    webhookPath: '/api/webhooks/channels/instagram/meta_instagram',
    homepageUrl: 'https://developers.facebook.com/docs/instagram-platform',
  },
]

export { dispatch, handleWebhook, getProvider, type DispatchInput, type DispatchOutcome } from './dispatcher'
export type {
  Channel,
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  MessageStatus,
  WebhookEvent,
  WebhookVerifyInput,
} from './types'
export { encryptConfig, decryptConfig, redactConfigForUI } from './crypto'
