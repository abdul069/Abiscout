// Generic Claude Managed Agent loop.
//
// This is the heart of CarScout: every agent calls runAgentLoop with its own
// tools and tool executor. Claude decides which tool to call next, we execute
// the tool, hand the result back, and repeat until stop_reason === 'end_turn'
// or a safety limit is hit.

import {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicTool,
  AnthropicToolResultBlock,
  AnthropicToolUseBlock,
  createMessage,
} from './anthropic.ts';
import { getServiceClient } from './supabase.ts';

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

export interface AgentRunOptions {
  agent: string;
  systemPrompt: string;
  userPrompt: string;
  tools: AnthropicTool[];
  executeTool: ToolExecutor;
  maxIterations?: number;
  searchId?: string | null;
  listingId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  success: boolean;
  iterations: number;
  finalText: string;
  toolCalls: { name: string; input: Record<string, unknown>; ok: boolean }[];
  runId: string | null;
  error?: string;
}

const DEFAULT_MAX_ITERATIONS = 25;

export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunResult> {
  const supabase = getServiceClient();
  const startedAt = Date.now();

  // Log start of run.
  const { data: run, error: insertErr } = await supabase
    .from('agent_runs')
    .insert({
      agent: opts.agent,
      status: 'running',
      input: { prompt: opts.userPrompt, metadata: opts.metadata ?? null },
      search_id: opts.searchId ?? null,
      listing_id: opts.listingId ?? null,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error(`[${opts.agent}] failed to log run start:`, insertErr);
  }

  const runId = run?.id ?? null;
  const messages: AnthropicMessage[] = [
    { role: 'user', content: opts.userPrompt },
  ];

  const toolCalls: { name: string; input: Record<string, unknown>; ok: boolean }[] = [];
  let finalText = '';
  let iterations = 0;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  try {
    while (iterations < maxIterations) {
      iterations++;

      const response = await createMessage({
        system: opts.systemPrompt,
        messages,
        tools: opts.tools,
      });

      // Append Claude's full response to the conversation.
      messages.push({ role: 'assistant', content: response.content });

      // Pull text out for return value.
      const textBlocks = response.content.filter(
        (b): b is { type: 'text'; text: string } => b.type === 'text',
      );
      if (textBlocks.length > 0) {
        finalText = textBlocks.map((b) => b.text).join('\n');
      }

      if (response.stop_reason === 'end_turn') break;

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is AnthropicToolUseBlock => b.type === 'tool_use',
        );

        const toolResults: AnthropicToolResultBlock[] = [];

        for (const block of toolUseBlocks) {
          let result: unknown;
          let isError = false;

          try {
            result = await opts.executeTool(block.name, block.input);
            toolCalls.push({ name: block.name, input: block.input, ok: true });
          } catch (err) {
            isError = true;
            const message = err instanceof Error ? err.message : String(err);
            result = { error: message };
            toolCalls.push({ name: block.name, input: block.input, ok: false });
            console.error(`[${opts.agent}] tool ${block.name} failed:`, err);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
            is_error: isError,
          });
        }

        messages.push({ role: 'user', content: toolResults as AnthropicContentBlock[] });
        continue;
      }

      // Any other stop_reason (max_tokens, stop_sequence, ...) → stop.
      break;
    }

    const durationMs = Date.now() - startedAt;
    if (runId) {
      await supabase
        .from('agent_runs')
        .update({
          status: iterations >= maxIterations ? 'max_iterations' : 'success',
          output: { iterations, toolCalls, finalText },
          duration_ms: durationMs,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    return {
      success: true,
      iterations,
      finalText,
      toolCalls,
      runId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    if (runId) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'error',
          error: message,
          output: { iterations, toolCalls },
          duration_ms: durationMs,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    return {
      success: false,
      iterations,
      finalText,
      toolCalls,
      runId,
      error: message,
    };
  }
}
