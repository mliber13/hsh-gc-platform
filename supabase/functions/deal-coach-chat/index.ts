// ============================================================================
// Supabase Edge Function: deal-coach-chat
// ============================================================================
//
// Minimal Anthropic-backed deal coach endpoint for DealWorkspace.
// Expected request body:
// {
//   model?: string,
//   systemPrompt: string,
//   deal: object,
//   stage: "coaching" | "scenario" | "proforma",
//   currentInput: object,
//   history: Array<{ role: "user" | "assistant", text: string }>,
//   userMessage: string
// }
//
// Response shape:
// {
//   reply: string,
//   fieldUpdates: object,
//   confidence: number,
//   stageSuggestion?: "coaching" | "scenario" | "proforma"
// }
//
// Required secret:
// supabase secrets set ANTHROPIC_API_KEY=...
//

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const DEFAULT_MODEL = 'claude-sonnet-4-5'

type Stage = 'coaching' | 'scenario' | 'proforma'

interface CoachRequestBody {
  model?: string
  systemPrompt?: string
  deal?: Record<string, unknown>
  stage?: Stage
  currentInput?: Record<string, unknown>
  history?: Array<{ role: 'user' | 'assistant'; text: string }>
  userMessage?: string
}

interface CoachResponseBody {
  reply: string
  fieldUpdates: Record<string, unknown>
  confidence: number
  stageSuggestion?: Stage
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function coerceCoachJson(rawText: string): CoachResponseBody {
  const trimmed = rawText.trim()
  const extractJsonCandidate = (text: string): string => {
    const t = text.trim()
    if (t.startsWith('```')) {
      const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (fenced?.[1]) return fenced[1].trim()
    }
    const firstBrace = t.indexOf('{')
    const lastBrace = t.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return t.slice(firstBrace, lastBrace + 1).trim()
    }
    return t
  }
  try {
    const parsed = JSON.parse(extractJsonCandidate(trimmed)) as Partial<CoachResponseBody>
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'I reviewed your update.',
      fieldUpdates:
        parsed.fieldUpdates && typeof parsed.fieldUpdates === 'object' && !Array.isArray(parsed.fieldUpdates)
          ? (parsed.fieldUpdates as Record<string, unknown>)
          : {},
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      stageSuggestion:
        parsed.stageSuggestion === 'coaching' ||
        parsed.stageSuggestion === 'scenario' ||
        parsed.stageSuggestion === 'proforma'
          ? parsed.stageSuggestion
          : undefined,
    }
  } catch {
    // Fallback: Anthropic replied with plain text.
    return {
      reply: trimmed || 'I could not parse structured output from the model.',
      fieldUpdates: {},
      confidence: 0,
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: CoachRequestBody
  try {
    body = (await req.json()) as CoachRequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.userMessage || !body.userMessage.trim()) {
    return jsonResponse({ error: 'Missing userMessage' }, 400)
  }

  if (!ANTHROPIC_API_KEY) {
    // Graceful fallback so UI can still function in non-AI mode.
    return jsonResponse({
      reply:
        'Deal coach is not configured yet (missing ANTHROPIC_API_KEY). I did not apply any field updates.',
      fieldUpdates: {},
      confidence: 0,
    })
  }

  const model = body.model || DEFAULT_MODEL
  const systemPrompt =
    body.systemPrompt ||
    'Return strict JSON with keys: reply (string), fieldUpdates (object), confidence (0..1), optional stageSuggestion.'

  const historyText = (body.history || [])
    .slice(-20)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join('\n')

  const userPayload = [
    'Context:',
    `Stage: ${body.stage || 'coaching'}`,
    `Deal JSON: ${JSON.stringify(body.deal || {})}`,
    `Current ProFormaInput JSON: ${JSON.stringify(body.currentInput || {})}`,
    '',
    'Recent conversation:',
    historyText || '(none)',
    '',
    `Latest user message: ${body.userMessage}`,
    '',
    'Respond as strict JSON only.',
  ].join('\n')

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPayload }],
      }),
    })

    const raw = await anthropicRes.text()
    if (!anthropicRes.ok) {
      return jsonResponse(
        {
          error: 'Anthropic API request failed',
          details: raw,
        },
        502,
      )
    }

    const parsed = JSON.parse(raw) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = (parsed.content || []).find((c) => c.type === 'text')?.text || ''
    const coachJson = coerceCoachJson(textBlock)

    return jsonResponse(coachJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(
      {
        error: 'deal-coach-chat failed',
        message,
      },
      500,
    )
  }
})

