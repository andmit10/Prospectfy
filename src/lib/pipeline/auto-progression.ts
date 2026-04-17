import { createServiceClient } from '@/lib/supabase/service'
import { llm } from '@/lib/llm'

/**
 * Auto-progression engine — advances a lead's pipeline stage when a
 * triggering event fires. Two entrypoints wired today:
 *
 *   - `onClickEvent()` — called by `/r/[code]` after a human click
 *   - `onInboundMessage()` — called by the channel webhook route after
 *                            the dispatcher inserted an inbound row
 *
 * Flow:
 *   1. Derive the canonical trigger from the event (classify inbound via
 *      `llm.classify` when it's a message).
 *   2. Load org's `pipeline_rules` ordered by priority.
 *   3. Match rules by trigger_type + from_stage (null = wildcard).
 *   4. For the highest-priority match: update lead.status_pipeline, apply
 *      tag adds/removes, record in `pipeline_rule_applications` (idempotent
 *      via the unique index on (rule_id, lead_id, source_event_id)).
 *   5. Update the run's outcome if the click maps back to an agent_run
 *      (so agent_metrics funnel counters move).
 *
 * Never throws — callers are webhook routes that must return quickly.
 * Errors are logged to console + swallowed.
 */

type TriggerType =
  | 'click'
  | 'reply_positive'
  | 'reply_negative'
  | 'reply_question'
  | 'reply_unsubscribe'
  | 'meeting_requested'
  | 'no_response_days'
  | 'score_threshold'

type PipelineRuleRow = {
  id: string
  organization_id: string
  priority: number
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  from_stage: string | null
  to_stage: string
  add_tags: string[]
  remove_tags: string[]
  enabled: boolean
}

type ApplyOutcome = {
  applied: boolean
  ruleId: string | null
  newStage: string | null
  reason: string
}

async function loadRules(orgId: string, trigger: TriggerType): Promise<PipelineRuleRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pipeline_rules')
    .select('*')
    .eq('organization_id', orgId)
    .eq('enabled', true)
    .eq('trigger_type', trigger)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[auto-progression] loadRules error:', error)
    return []
  }
  return (data as PipelineRuleRow[] | null) ?? []
}

async function applyRule(args: {
  rule: PipelineRuleRow
  leadId: string
  sourceEventId: string | null
  sourceEventType: 'click' | 'inbound_message' | 'cron' | 'manual'
}): Promise<ApplyOutcome> {
  const supabase = createServiceClient()

  // Fetch the lead's current stage + tags.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, status_pipeline, tags, organization_id')
    .eq('id', args.leadId)
    .eq('organization_id', args.rule.organization_id)
    .maybeSingle()

  if (leadErr || !lead) {
    return { applied: false, ruleId: args.rule.id, newStage: null, reason: 'lead not found' }
  }

  // from_stage gate — skip rules that don't match the current stage.
  if (args.rule.from_stage && lead.status_pipeline !== args.rule.from_stage) {
    return {
      applied: false,
      ruleId: args.rule.id,
      newStage: null,
      reason: `current stage "${lead.status_pipeline}" ≠ required "${args.rule.from_stage}"`,
    }
  }

  // Terminal states — never advance out of convertido/perdido automatically.
  if (['convertido', 'perdido'].includes(lead.status_pipeline as string)) {
    return {
      applied: false,
      ruleId: args.rule.id,
      newStage: null,
      reason: `lead in terminal stage "${lead.status_pipeline}"`,
    }
  }

  // Write the audit row FIRST so idempotency kicks in before we mutate state.
  const { error: ledgerErr } = await supabase
    .from('pipeline_rule_applications')
    .insert({
      rule_id: args.rule.id,
      organization_id: args.rule.organization_id,
      lead_id: args.leadId,
      from_stage: lead.status_pipeline,
      to_stage: args.rule.to_stage,
      source_event_id: args.sourceEventId,
      source_event_type: args.sourceEventType,
    })

  if (ledgerErr) {
    // Unique violation = we already applied this event/rule/lead combo — skip silently.
    if ((ledgerErr as { code?: string }).code === '23505') {
      return {
        applied: false,
        ruleId: args.rule.id,
        newStage: null,
        reason: 'already applied (idempotency)',
      }
    }
    console.error('[auto-progression] ledger insert error:', ledgerErr)
    return {
      applied: false,
      ruleId: args.rule.id,
      newStage: null,
      reason: 'ledger error',
    }
  }

  // Apply stage + tags.
  const currentTags = ((lead.tags as string[] | null) ?? []).filter(
    (t) => !args.rule.remove_tags.includes(t)
  )
  const nextTags = Array.from(new Set([...currentTags, ...args.rule.add_tags]))

  const { error: updateErr } = await supabase
    .from('leads')
    .update({
      status_pipeline: args.rule.to_stage,
      tags: nextTags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.leadId)
    .eq('organization_id', args.rule.organization_id)

  if (updateErr) {
    console.error('[auto-progression] lead update error:', updateErr)
    return {
      applied: false,
      ruleId: args.rule.id,
      newStage: null,
      reason: updateErr.message,
    }
  }

  return {
    applied: true,
    ruleId: args.rule.id,
    newStage: args.rule.to_stage,
    reason: 'ok',
  }
}

/**
 * Click event — fires after a human click is recorded in tracking_events.
 * Ignores bot clicks at the caller; we assume `isBot=false` rows only.
 */
export async function onClickEvent(args: {
  orgId: string
  leadId: string | null
  trackingLinkId: string
  trackingEventId: string
  agentRunId: string | null
}): Promise<ApplyOutcome | null> {
  if (!args.leadId) return null
  const rules = await loadRules(args.orgId, 'click')
  for (const rule of rules) {
    const outcome = await applyRule({
      rule,
      leadId: args.leadId,
      sourceEventId: args.trackingEventId,
      sourceEventType: 'click',
    })
    if (outcome.applied) {
      await maybeTagAgentOutcome(args.agentRunId, 'replied')
      return outcome
    }
  }
  return null
}

/**
 * Inbound message event — fires after a channel webhook inserted an
 * `channel_messages` row with `direction='inbound'`. Uses `llm.classify`
 * to convert the message body into one of our canonical intents, then
 * matches rules.
 */
export async function onInboundMessage(args: {
  orgId: string
  leadId: string | null
  channelMessageId: string
  content: string
}): Promise<ApplyOutcome | null> {
  if (!args.leadId) return null
  if (!args.content.trim()) return null

  // Classify the message. The classify task is tuned for Qwen local with
  // Claude Haiku fallback — low cost per inbound.
  let intent: string | null = null
  try {
    const result = await llm.classify<{
      intent: string
      confidence: number
      summary: string
    }>({
      user: `Classifique a mensagem abaixo. Responda JSON com {intent, confidence (0-1), summary (<200 chars)}.
Mensagem:
${args.content.slice(0, 1500)}`,
      orgId: args.orgId,
    })
    intent = result.data.intent ?? null
  } catch (err) {
    console.error('[auto-progression] classify failed:', err)
    return null
  }

  const triggerFromIntent: Record<string, TriggerType> = {
    positive: 'reply_positive',
    negative: 'reply_negative',
    question: 'reply_question',
    neutral: 'reply_question',
    schedule_request: 'meeting_requested',
    unsubscribe: 'reply_unsubscribe',
  }
  const trigger = triggerFromIntent[intent ?? ''] ?? null
  if (!trigger) return null

  const rules = await loadRules(args.orgId, trigger)
  for (const rule of rules) {
    const outcome = await applyRule({
      rule,
      leadId: args.leadId,
      sourceEventId: args.channelMessageId,
      sourceEventType: 'inbound_message',
    })
    if (outcome.applied) {
      // Propagate outcome to the most recent agent_run that touched this lead.
      const supabase = createServiceClient()
      const { data: run } = await supabase
        .from('agent_runs')
        .select('id')
        .eq('organization_id', args.orgId)
        .eq('lead_id', args.leadId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (run?.id) {
        const outcomeLabel =
          trigger === 'meeting_requested'
            ? 'meeting_scheduled'
            : trigger === 'reply_unsubscribe'
              ? 'unsubscribed'
              : 'replied'
        await supabase
          .from('agent_runs')
          .update({ outcome: outcomeLabel, outcome_at: new Date().toISOString() })
          .eq('id', run.id as string)
      }
      return outcome
    }
  }
  return null
}

async function maybeTagAgentOutcome(agentRunId: string | null, outcome: string): Promise<void> {
  if (!agentRunId) return
  const supabase = createServiceClient()
  await supabase
    .from('agent_runs')
    .update({ outcome, outcome_at: new Date().toISOString() })
    .eq('id', agentRunId)
}

/**
 * Cron entrypoint for `no_response_days` rules — called by the daily cron
 * endpoint in Phase 6. Walks leads that haven't responded in N days and
 * applies stalled-lead rules.
 */
export async function processNoResponseRules(orgId: string): Promise<number> {
  const rules = await loadRules(orgId, 'no_response_days')
  if (rules.length === 0) return 0

  const supabase = createServiceClient()
  let applied = 0

  for (const rule of rules) {
    const days = Number((rule.trigger_config as { days?: number }).days ?? 7)
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()

    const { data: leads } = await supabase
      .from('leads')
      .select('id, status_pipeline')
      .eq('organization_id', orgId)
      .eq('status_pipeline', rule.from_stage ?? 'contatado')
      .lt('updated_at', cutoff)
      .is('deleted_at', null)
      .limit(500)

    for (const lead of leads ?? []) {
      const outcome = await applyRule({
        rule,
        leadId: lead.id as string,
        sourceEventId: null,
        sourceEventType: 'cron',
      })
      if (outcome.applied) applied++
    }
  }

  return applied
}
