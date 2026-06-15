import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import { authRoutes } from './modules/auth/auth.routes.js';
import { rosterRoutes } from './modules/rosters/roster.routes.js';
import { memberRoutes } from './modules/members/member.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { cmsRoutes } from './modules/cms/cms.routes.js';
import multipart from '@fastify/multipart';
import { setupMinioBucket } from './shared/storage/minio.js';
import { eventRoutes } from './modules/events/event.routes.js';
import { constructionRoutes } from './modules/construction/construction.routes.js';
import { financeRoutes } from './modules/finance/finance.routes.js';
import { communityBusinessRoutes } from './modules/community-business/community-business.routes.js';
import { communityBusinessCategoryRoutes } from './modules/community-business-category/community-business-category.routes.js';
import { landingConfigRoutes } from './modules/landing-config/landing-config.routes.js';
import { ecdRoutes } from './modules/ecd/ecd.routes.js';
import { repertorioRoutes } from './modules/repertorio/repertorio.routes.js';
import { teamRoutes } from './modules/teams/team.routes.js';
import { ecdWorkersRoutes } from './modules/ecd-workers/ecd-workers.routes.js';
import fastifyRateLimit from '@fastify/rate-limit';

const app = Fastify({ logger: true });

app.register(fastifyRateLimit, {
  max: 150, // Permite no máximo 150 requisições...
  timeWindow: '1 minute', // ...por minuto, por IP.
  errorResponseBuilder: function (request, context) {
    return {
      code: 429,
      error: 'Too Many Requests',
      message: `Você fez muitas requisições. Tente novamente em 1 minuto.`
    };
  }
});

app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Ajuste as URLs abaixo conforme as APIs e fontes que utiliza no Front-end
      connectSrc: ["'self'", "https://api.ibnhitamaraju.com.br", "http://localhost:3333"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://painel.ibnhitamaraju.com.br", "https://ibnhitamaraju.com.br"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"]
    }
  },
  // Bloqueia que o seu site seja colocado dentro de um <iframe> de sites de terceiros (Clickjacking)
  frameguard: {
    action: 'deny'
  }
});

// app.register(cors, {
//   origin: [
//     "https://painel.ibnhitamaraju.com.br",
//     "https://ibnhitamaraju.com.br",
//     "http://localhost:5173",
//     "http://localhost:5174" // Seu ambiente local do Vite
//   ],
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Libera os métodos
//   allowedHeaders: ['Content-Type', 'Authorization'] // Libera o envio do Token
// });

app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Libera os métodos
  allowedHeaders: ['Content-Type', 'Authorization'] // Libera o envio do Token
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  console.error("🚨 CRÍTICO: JWT_SECRET não definido no ambiente de produção! Desligando o servidor por segurança.");
  process.exit(1);
}

// Registra o plugin de JWT usando a chave do .env
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'fallback-secret-dev'
});

app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
}); // 10MB max

app.addHook('onReady', async () => {
  await setupMinioBucket();
});

// Registra as nossas rotas de autenticação (ficarão em /auth/login)
app.register(async function apiV1(v1) {

  v1.register(authRoutes, { prefix: '/auth' });

  // Rotas que estavam sem prefixo agora estão devidamente isoladas
  v1.register(rosterRoutes, { prefix: '/rosters' });
  v1.register(memberRoutes, { prefix: '/members' });
  v1.register(cmsRoutes, { prefix: '/cms' });
  v1.register(eventRoutes, { prefix: '/events' });
  v1.register(constructionRoutes, { prefix: '/construction' });
  v1.register(financeRoutes, { prefix: '/finance' });
  v1.register(communityBusinessRoutes, { prefix: '/community-business' });
  v1.register(communityBusinessCategoryRoutes, { prefix: '/community-business-category' });
  v1.register(landingConfigRoutes, { prefix: '/landing-config' });
  v1.register(ecdRoutes, { prefix: '/ecd' });
  v1.register(repertorioRoutes, { prefix: '/repertorio' });
  v1.register(teamRoutes, { prefix: '/teams' });
  v1.register(ecdWorkersRoutes, { prefix: '/ecd-workers' });

  v1.register(analyticsRoutes, { prefix: '/analytics' });

}, { prefix: '/v1' }); // 👈 O prefixo global entra aqui!

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