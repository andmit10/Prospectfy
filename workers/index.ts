/**
 * Worker entry point — starts all BullMQ consumers + the enqueuer cron.
 * Deploy on Railway as a separate service: `npm run worker`
 *
 * Registered consumers:
 *   - worker.ts                  → legacy prospecting agent loop (`agent-jobs`)
 *   - llm-telemetry-worker       → LLM Gateway telemetry inserts
 *   - rag-ingest-worker          → RAG document ingestion (parse + embed + store)
 *   - agent-executor-worker      → v2 agent DSL runtime (`agent-execute`)
 *   - agent-suggestions-worker   → nightly AI suggestions per org
 *   - enqueuer.ts                → local-dev tick for agent_queue → BullMQ
 */
import './worker'
import './llm-telemetry-worker'
import './rag-ingest-worker'
import './agent-executor-worker'
import './agent-suggestions-worker'
import './enqueuer'
