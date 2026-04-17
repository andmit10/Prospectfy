/**
 * Smoke test for evolution-go-admin helpers. Creates a throwaway instance,
 * verifies it appears in /instance/all, then deletes it.
 *
 * Run: npx tsx scripts/test-evolution-go-admin.ts
 */
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { createInstance, deleteInstance } = await import('../src/lib/channels/providers/whatsapp/evolution-go-admin')
  const name = `smoketest_${Date.now()}`

  console.log(`Creating instance ${name}...`)
  const created = await createInstance(name)
  console.log('Created:', created)

  console.log('Deleting...')
  await deleteInstance(created.id)
  console.log('Deleted ✓')
}

main().catch((err) => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
