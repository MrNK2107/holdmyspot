import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS } from '../src/engine/engine.js';
import { Workspaces } from '../src/workspaces.js';

// Hardening checks referenced from docs/SECURITY.md.

describe('security hardening', () => {
  it('visitor workspace ids are not guessable from each other', async () => {
    const w = new Workspaces();
    const a = (await w.create()).engine.id;
    const b = (await w.create()).engine.id;
    expect(a).toMatch(/^ws\d+-[0-9a-f]{12}$/);
    expect(b).toMatch(/^ws\d+-[0-9a-f]{12}$/);
    expect(a.split('-')[1]).not.toBe(b.split('-')[1]);
  });

  it('a client text is cut to MAX_MESSAGE_CHARS before the model and the audit log see it', async () => {
    const e = (await new Workspaces().create('sec')).engine;
    const huge = 'please refund me '.repeat(5000);
    await e.receiveMessage('sam', huge);
    const stored = e.messages.filter((m) => m.from === 'client').at(-1)!;
    expect(stored.text.length).toBe(MAX_MESSAGE_CHARS);
    expect(e.audit.all().every((x) => x.summary.length < MAX_MESSAGE_CHARS + 200)).toBe(true);
  });
});
