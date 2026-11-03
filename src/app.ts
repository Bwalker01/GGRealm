import fastify from 'fastify';

export function buildApp(opts: { logger?: boolean } = {}) {
  const app = fastify({ logger: opts.logger ?? true });

  app.get(
    '/health',
    async (_request, reply) => {
      reply.code(200);
      return "Healthy";
    }
  );

  return app;
}
