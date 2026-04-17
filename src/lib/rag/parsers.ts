/**
 * Format-specific parsers — extract plain text from uploaded documents.
 * Each parser is isolated so one format's bugs don't break others.
 *
 * Security notes:
 *   - unpdf is pure JS (no native deps) and runs content through a sandbox.
 *   - mammoth converts docx → markdown without executing macros.
 *   - cheerio parses HTML as data (never runs scripts).
 *   - marked renders markdown to HTML, then we strip to text.
 *
 * We cap `rawLength` per parser so a hostile doc can't OOM the worker.
 */

import { extractText } from 'unpdf'
import { marked } from 'marked'
import * as cheerio from 'cheerio'
import mammoth from 'mammoth'
import { sanitizeForIngest } from './security'

const MAX_PARSED_CHARS = 5_000_000 // ~5 MB of text per doc — plenty for any practical KB

function cap(text: string): string {
  if (text.length <= MAX_PARSED_CHARS) return text
  return text.slice(0, MAX_PARSED_CHARS)
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(bytes, { mergePages: true })
  const merged = Array.isArray(text) ? text.join('\n\n') : String(text ?? '')
  return cap(sanitizeForIngest(merged))
}

async function parseDocx(bytes: Uint8Array): Promise<string> {
  // mammoth accepts Buffer in Node or ArrayBuffer in other runtimes.
  const buf = Buffer.from(bytes)
  const { value } = await mammoth.extractRawText({ buffer: buf })
  return cap(sanitizeForIngest(value ?? ''))
}

function parseMarkdown(text: string): string {
  // Render to HTML then strip tags — guarantees consistent handling of
  // code blocks, tables, etc.
  const html = marked.parse(text, { async: false }) as string
  const $ = cheerio.load(html)
  // Drop any leftover scripts/styles just in case.
  $('script, style').remove()
  return cap(sanitizeForIngest($.root().text()))
}

function parseHtml(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript').remove()
  return cap(sanitizeForIngest($.root().text()))
}

function parseText(text: string): string {
  return cap(sanitizeForIngest(text))
}

export async function parseByMime(mime: string, bytes: Uint8Array): Promise<string> {
  switch (mime) {
    case 'application/pdf':
      return parsePdf(bytes)
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return parseDocx(bytes)
    case 'text/markdown':
      return parseMarkdown(new TextDecoder('utf-8').decode(bytes))
    case 'text/html':
      return parseHtml(new TextDecoder('utf-8').decode(bytes))
    case 'text/plain':
      return parseText(new TextDecoder('utf-8').decode(bytes))
    default:
      throw new Error(`Unsupported mime type for RAG: ${mime}`)
  }
}
