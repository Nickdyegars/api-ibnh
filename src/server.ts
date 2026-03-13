import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { authRoutes } from './modules/auth/auth.routes.js';
import { rosterRoutes } from './modules/rosters/roster.routes.js';
import { memberRoutes } from './modules/members/member.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { cmsRoutes } from './modules/cms/cms.routes.js';
import multipart from '@fastify/multipart';
import { setupMinioBucket } from './shared/storage/minio.js';

const app = Fastify({ logger: true });

app.register(cors, { 
  origin: '*', // Permite que o React acesse a API
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Libera os métodos
  allowedHeaders: ['Content-Type', 'Authorization'] // Libera o envio do Token
});

// Registra o plugin de JWT usando a chave do .env
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'fallback-secret-dev'
});

app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

app.addHook('onReady', async () => {
    await setupMinioBucket();
});

// Registra as nossas rotas de autenticação (ficarão em /auth/login)
app.register(authRoutes, { prefix: '/auth' });
app.register(rosterRoutes);
app.register(memberRoutes);
app.register(analyticsRoutes, { prefix: '/analytics' });
app.register(cmsRoutes);

app.get('/health', async (request, reply) => {
  return { status: 'ok', message: 'API rodando! 🚀' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3333;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();