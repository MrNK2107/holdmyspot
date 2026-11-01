import type { AuditLog } from '../audit.js';
import type { AgentHistoryItem, LlmProvider } from './provider.js';

/**
 * The front desk as a tool-calling agent. The model picks one tool per step from the toolset it is
 * given; this loop executes it and feeds the result back. The toolset is the security boundary:
 * the agent gets read tools, one constrained model call, and a single *proposal* tool. There is no
 * tool that captures, voids, refunds or authorizes. A proposal goes to the deterministic policy
 * engine, and any charge waits for the owner's tap. Asking for a tool outside the set is recorded
 * as denied and nothing runs.
 *
 * This file must not import the payments gateway or the engine (enforced by test/ai.test.ts);
 * the engine passes its tools in as plain functions.
 */
export type ToolAccess = 'read' | 'model' | 'propose' | 'end';

export interface AgentTool {
  name: string;
  access: ToolAccess;
  description: string;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface TraceStep {
  n: number;
  kind: 'tool' | 'denied' | 'code' | 'effect' | 'gate' | 'owner';
  name: string;
  access?: ToolAccess;
  why?: string;
  args?: Record<string, unknown>;
  result?: string;
}

/** Tools that move money exist only inside the engine. Listed so the UI can show what the agent cannot do. */
export const MONEY_TOOLS_NOT_GIVEN = ['create_order (authorize)', 'capture_authorization', 'void_authorization', 'create_refund'];

export const MAX_STEPS = 8;

const clip = (x: unknown, max: number) => {
  const s = typeof x === 'string' ? x : JSON.stringify(x);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
/** what the trace shows */
const short = (x: unknown) => clip(x, 800);
/** what the model sees back (bounded so a tool cannot flood the context) */
const forModel = (x: unknown) => clip(x, 6000);

export class FrontDeskAgent {
  constructor(
    private llm: LlmProvider,
    private audit: AuditLog,
  ) {}

  async run(
    input: { trigger: string; clientName: string; text: string },
    tools: AgentTool[],
    /** records a step; may return the stored step so its result can be filled in after the tool runs */
    onStep: (s: Omit<TraceStep, 'n'>) => TraceStep | void,
    bookingId?: string,
  ): Promise<{ history: AgentHistoryItem[]; finished: boolean; final?: Record<string, unknown> }> {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const history: AgentHistoryItem[] = [];
    for (let i = 0; i < MAX_STEPS; i++) {
      const step = await this.llm.run('agent_step', {
        trigger: input.trigger,
        clientName: input.clientName,
        text: input.text,
        tools: tools.map(({ name, access, description }) => ({ name, access, description })),
        history,
      });
      const name = String(step.tool ?? '').slice(0, 60);
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(step.argsJson || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
      } catch {
        args = {};
      }
      const why = String(step.why ?? '').slice(0, 200);
      const tool = byName.get(name);
      if (!tool) {
        const result = `denied: "${name}" is not in the front desk's toolset. Money moves only through the policy engine, after the owner's tap.`;
        this.audit.add('ai', `agent asked for ${name} → denied (not in toolset)`, { bookingId, data: { args, why } });
        onStep({ kind: 'denied', name, why, args, result });
        history.push({ tool: name, argsJson: JSON.stringify(args), result, denied: true });
        continue;
      }
      if (tool.access === 'end') {
        onStep({ kind: 'tool', name, access: 'end', why, args, result: 'done' });
        return { history, finished: true, final: args };
      }
      // record the call before it runs, so what the tool triggers (policy check, owner gate) is listed after it
      this.audit.add('ai', `agent → ${name}`, { bookingId, data: { args, why } });
      const rec = onStep({ kind: 'tool', name, access: tool.access, why, args });
      let result: unknown;
      try {
        result = await tool.run(args);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      if (rec) rec.result = short(result);
      history.push({ tool: name, argsJson: JSON.stringify(args), result: forModel(result) });
    }
    return { history, finished: false };
  }
}
