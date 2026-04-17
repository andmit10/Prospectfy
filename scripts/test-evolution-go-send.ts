/**
 * One-off send test via the channel dispatcher → Evolution Go provider.
 * Usage: npx tsx scripts/test-evolution-go-send.ts <phone> "<message>"
 *   phone: E.164 without +, e.g. 5531999990001
 */
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })

// Lazy-import after env is loaded so dispatcher module pickups the key.
async function main() {
  const [, , phone, ...msgParts] = process.argv
  if (!phone) {
    console.error('Usage: npx tsx scripts/test-evolution-go-send.ts <phone> "<message>"')
    process.exit(1)
  }
  const message = msgParts.join(' ') || 'Teste Orbya → Evolution Go ✅'

  const { dispatch } = await import('../src/lib/channels')

  const result = await dispatch({
    orgId: '53b11d5f-dfdd-42be-91f7-f6765bc56114',
    channel: 'whatsapp',
    payload: { to: phone, content: message },
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error('Send failed:', err)
  process.exit(1)
})
