import { router } from '@/lib/trpc'
import { leadsRouter } from './leads'
import { campaignsRouter } from './campaigns'
import { profileRouter } from './profile'
import { dashboardRouter } from './dashboard'
import { stripeRouter } from './stripe'
import { agentRouter } from './agent'
import { generateRouter } from './generate'
import { pipelinesRouter } from './pipelines'
import { organizationsRouter } from './organizations'
import { knowledgeRouter } from './knowledge'
import { channelsRouter } from './channels'
import { agentsRouter } from './agents'
import { pipelineRulesRouter } from './pipeline-rules'
import { adminRouter } from './admin'
import { trialRouter } from './trial'

export const appRouter = router({
  leads: leadsRouter,
  campaigns: campaignsRouter,
  profile: profileRouter,
  dashboard: dashboardRouter,
  stripe: stripeRouter,
  agent: agentRouter,
  generate: generateRouter,
  pipelines: pipelinesRouter,
  organizations: organizationsRouter,
  knowledge: knowledgeRouter,
  channels: channelsRouter,
  agents: agentsRouter,
  pipelineRules: pipelineRulesRouter,
  admin: adminRouter,
  trial: trialRouter,
})

export type AppRouter = typeof appRouter
