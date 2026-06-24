const port = Number(process.env.STASH_MOCK_AI_PORT ?? 4175);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function titleFromPrompt(prompt: string): string {
  const match = prompt.match(/^Title:\s*(.+)$/m);
  return match?.[1]?.trim() || 'captured idea';
}

function providerText(prompt: string): string {
  const title = titleFromPrompt(prompt);
  if (prompt.includes('"reply":"string"')) {
    return JSON.stringify({
      reply: `Start by clarifying the next step for ${title}.`,
      suggestedActions: ['write the first concrete action'],
    });
  }
  if (prompt.includes('"summary":"string"')) {
    return JSON.stringify({
      summary: `AI summary for ${title}`,
      destination: prompt.includes('Requested destination: description') ? 'description' : 'journal',
      sourceSpans: [{ text: title }],
    });
  }
  return JSON.stringify({
    drafts: [{
      title: `Review ${title}`,
      description: `Turn "${title}" into an accepted task after human review.`,
      priority: 'p1',
      labels: ['ai-review'],
      checklist: [{ text: 'confirm the generated task', completed: false }],
      sourceSpans: [{ label: 'idea', text: title }],
    }],
  });
}

Bun.serve({
  port,
  async fetch(req) {
    if (req.method === 'GET' && new URL(req.url).pathname === '/health') {
      return json({ ok: true });
    }
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await req.json() as { messages?: Array<{ content?: string }> };
    const prompt = body.messages?.map((message) => message.content ?? '').join('\n') ?? '';
    return json({
      choices: [{
        message: {
          content: providerText(prompt),
        },
      }],
    });
  },
});

console.log(`[stash-mock-ai] listening on ${port}`);
