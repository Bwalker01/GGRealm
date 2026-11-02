import fastify from 'fastify';

const app = fastify({ logger: true });

app.get(
  '/health',
  async (_request, reply) => {
    reply.code(200);
    return "Healthy";
  }
);

app.listen({ port: Number(process.env.PORT ?? 3000) });