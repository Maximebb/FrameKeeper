import type { FastifyReply } from 'fastify';

/** Minimal SSE broadcaster for frontend live updates. */
export class EventBus {
  private clients = new Set<FastifyReply>();

  add(reply: FastifyReply): void {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');
    this.clients.add(reply);
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        this.remove(reply, heartbeat);
      }
    }, 25000);
    reply.raw.on('close', () => this.remove(reply, heartbeat));
  }

  private remove(reply: FastifyReply, heartbeat: NodeJS.Timeout): void {
    clearInterval(heartbeat);
    this.clients.delete(reply);
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.raw.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
