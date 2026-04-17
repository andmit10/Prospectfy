/**
 * Public surface of the pipeline auto-progression module.
 */

export {
  createTrackingLink,
  buildPublicUrl,
  resolveMessageTemplate,
  type CreateTrackingLinkInput,
} from './tracking'

export {
  onClickEvent,
  onInboundMessage,
  processNoResponseRules,
} from './auto-progression'

export { detectBot, randomShortCode, type BotVerdict } from './bot-detector'
