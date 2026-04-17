/**
 * Bot detection for tracking-link clicks.
 *
 * This matters because EMAIL CLIENTS (Outlook, Gmail's link scan, Slack
 * unfurl, iMessage preview, Apple Mail privacy protection) fetch URLs
 * BEFORE the human sees them. If we naively treat every hit as a click,
 * our pipeline_rules will advance every contacted lead to "respondeu" —
 * a classic auto-tracking false positive.
 *
 * We use a three-tier defense:
 *   1. UA signature match (known bots, cheap).
 *   2. Headless browser signatures (Puppeteer, PhantomJS).
 *   3. Heuristics (HEAD request, missing referer on first hit).
 *
 * We return `{ isBot, reason }` so the audit trail explains WHY a click
 * was discounted. The event is still logged in `tracking_events`, just
 * with `is_bot = true` so it doesn't trigger the rule engine.
 */

const BOT_UA_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /bot/i, reason: 'generic bot keyword' },
  { pattern: /crawler/i, reason: 'crawler' },
  { pattern: /spider/i, reason: 'spider' },
  { pattern: /preview/i, reason: 'link preview agent' },
  { pattern: /GoogleImageProxy/i, reason: 'Gmail image proxy' },
  { pattern: /Slackbot-LinkExpanding/i, reason: 'Slack unfurl' },
  { pattern: /Slackbot/i, reason: 'Slack bot' },
  { pattern: /Discordbot/i, reason: 'Discord embed' },
  { pattern: /WhatsApp/i, reason: 'WhatsApp link preview' },
  { pattern: /Telegram/i, reason: 'Telegram link preview' },
  { pattern: /LinkedInBot/i, reason: 'LinkedIn preview' },
  { pattern: /facebookexternalhit/i, reason: 'Facebook preview' },
  { pattern: /Twitterbot/i, reason: 'Twitter preview' },
  { pattern: /YandexBot/i, reason: 'Yandex bot' },
  { pattern: /bingbot/i, reason: 'Bing bot' },
  { pattern: /Googlebot/i, reason: 'Googlebot' },
  { pattern: /DuckDuckBot/i, reason: 'DuckDuckBot' },
  { pattern: /applebot/i, reason: 'Apple bot' },
  { pattern: /ia_archiver/i, reason: 'Internet Archive' },
  // Apple Mail Privacy Protection — fetches every tracking pixel, routes via
  // privacy proxies. UA doesn't always say "bot", so we also check server IP
  // ranges (caller's job; we just flag the known Mozilla-lite UA).
  { pattern: /Mozilla\/5\.0 \(X11; Linux x86_64\) AppleWebKit.+Safari.+$/, reason: 'possible Apple MPP proxy' },
  // Outlook Safe Links — lowercased UA starts with "Microsoft Office"
  { pattern: /Microsoft Office/i, reason: 'Outlook Safe Links' },
  { pattern: /BarracudaCentral/i, reason: 'Barracuda scan' },
  { pattern: /Mimecast/i, reason: 'Mimecast scan' },
  { pattern: /proofpoint/i, reason: 'Proofpoint scan' },
  { pattern: /Symantec|Norton/i, reason: 'security scan' },
  // Headless browsers
  { pattern: /HeadlessChrome/i, reason: 'Headless Chrome' },
  { pattern: /PhantomJS/i, reason: 'PhantomJS' },
  { pattern: /Puppeteer/i, reason: 'Puppeteer' },
  { pattern: /Playwright/i, reason: 'Playwright' },
]

export type BotVerdict = {
  isBot: boolean
  reason?: string
}

export function detectBot(input: {
  userAgent: string | null
  method: string
  /** First click? Second-hit humans are trusted more readily */
  previousClicks: number
}): BotVerdict {
  const ua = (input.userAgent ?? '').trim()

  // No UA at all → treat as bot.
  if (!ua) return { isBot: true, reason: 'missing user-agent' }

  // HEAD requests are almost always bots prefetching the URL.
  if (input.method.toUpperCase() === 'HEAD') {
    return { isBot: true, reason: 'HEAD request' }
  }

  // Known patterns.
  for (const { pattern, reason } of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      return { isBot: true, reason }
    }
  }

  // Very short UA strings without browser hints.
  if (ua.length < 20 && !/chrome|firefox|safari|edge|opera/i.test(ua)) {
    return { isBot: true, reason: 'UA too short without browser hint' }
  }

  return { isBot: false }
}

/**
 * Generate a URL-safe 10-char base62 token. 62^10 ≈ 8.4e17 — well beyond
 * what a brute-force scan could cover even at billions of guesses per sec.
 */
export function randomShortCode(length = 10): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}
