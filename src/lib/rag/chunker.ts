import { MAX_CHUNKS_PER_DOCUMENT } from './security'

/**
 * Recursive text splitter — splits by the strongest natural boundary first
 * (double newline → newline → sentence → word → char) until each chunk fits
 * within the token budget. Overlap keeps semantic continuity across chunks.
 *
 * Token counting is approximated by a char/4 heuristic — exact tiktoken is
 * overkill at ingest time (costs CPU; we don't charge by chunker tokens).
 */

export type Chunk = {
  content: string
  index: number
  approxTokens: number
  sourceHint: string | null
}

const DEFAULT_CHUNK_TOKENS = 512
const DEFAULT_OVERLAP_TOKENS = 64

function approxTokens(text: string): number {
  // Empirical: ~4 chars per token in pt-BR; rounded up to be safe.
  return Math.ceil(text.length / 4)
}

/** Split-priority separators, strongest first. */
const SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']

function splitByFirstSeparator(text: string): string[] {
  for (const sep of SEPARATORS) {
    if (text.includes(sep)) {
      return text.split(sep).filter((s) => s.length > 0)
    }
  }
  // Last resort: chunks of ~1500 chars.
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += 1500) {
    pieces.push(text.slice(i, i + 1500))
  }
  return pieces
}

/**
 * Recursive greedy merge: concatenate contiguous pieces while staying under
 * the target token budget. Pieces that already exceed the budget are recursed
 * into with the next separator.
 */
function packPieces(pieces: string[], maxTokens: number): string[] {
  const chunks: string[] = []
  let current = ''

  for (const p of pieces) {
    const pTokens = approxTokens(p)

    if (pTokens > maxTokens) {
      // Flush whatever we accumulated before recursing.
      if (current) {
        chunks.push(current)
        current = ''
      }
      // Recurse to a finer split on this oversized piece.
      const sub = splitByFirstSeparator(p)
      if (sub.length === 1 && sub[0] === p) {
        // No smaller separator available — emit as-is (shouldn't happen with
        // the char fallback above, but defensive).
        chunks.push(p)
      } else {
        chunks.push(...packPieces(sub, maxTokens))
      }
      continue
    }

    const tentative = current ? `${current} ${p}` : p
    if (approxTokens(tentative) > maxTokens) {
      if (current) chunks.push(current)
      current = p
    } else {
      current = tentative
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * Append an overlap tail from each previous chunk onto the next one so
 * topic continuity survives chunk boundaries.
 */
function addOverlap(chunks: string[], overlapTokens: number): string[] {
  if (overlapTokens <= 0 || chunks.length <= 1) return chunks
  const out: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const overlapChars = overlapTokens * 4
    const tail = prev.slice(Math.max(0, prev.length - overlapChars))
    out.push(`${tail} ${chunks[i]}`)
  }
  return out
}

export type ChunkOptions = {
  maxTokens?: number
  overlapTokens?: number
  sourceHint?: string | null
}

export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const maxTokens = opts.maxTokens ?? DEFAULT_CHUNK_TOKENS
  const overlapTokens = opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS
  const sourceHint = opts.sourceHint ?? null

  if (!text.trim()) return []

  const pieces = splitByFirstSeparator(text)
  const packed = packPieces(pieces, maxTokens)
  const withOverlap = addOverlap(packed, overlapTokens)

  // Hard cap: drop extra chunks beyond MAX_CHUNKS_PER_DOCUMENT to bound cost.
  const bounded = withOverlap.slice(0, MAX_CHUNKS_PER_DOCUMENT)

  return bounded.map((content, index) => ({
    content,
    index,
    approxTokens: approxTokens(content),
    sourceHint,
  }))
}
