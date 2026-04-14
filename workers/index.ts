/**
 * Worker entry point — starts both the BullMQ consumer and the enqueuer cron.
 * Deploy on Railway as a separate service: `npm run worker`
 */
import './worker'
import './enqueuer'
