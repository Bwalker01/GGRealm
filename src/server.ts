import { buildApp } from './app.js';

const app = buildApp();

app.listen({ host: '::', port: Number(process.env.PORT ?? 3000) });
