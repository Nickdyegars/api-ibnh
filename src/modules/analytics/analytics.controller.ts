import { FastifyReply, FastifyRequest } from 'fastify';
import { AnalyticsService } from './analytics.service.js';
import { registerActionBodySchema } from './analytics.schemas.js';

const analyticsService = new AnalyticsService();

export class AnalyticsController {

    async registerAction(request: FastifyRequest, reply: FastifyReply) {
        try {
            // Usa o Zod para validar e extrair os dados na hora!
            const { action, page } = registerActionBodySchema.parse(request.body);

            const newAction = await analyticsService.registerAction(action, page);
            return reply.status(201).send(newAction);
        } catch (error: any) {
            console.error("Erro ao registrar métrica do site:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao registrar métrica' });
        }
    }

    async getDashboardStats(request: FastifyRequest, reply: FastifyReply) {
        try {
            // Pegamos o período da URL (que pode ser undefined)
            const query = request.query as { period?: string };

            // A MÁGICA AQUI: Se query.period for undefined, forçamos a palavra 'mes'
            const periodoEscolhido = query.period || 'mes';

            // Agora passamos uma string 100% garantida para o seu Service
            const stats = await analyticsService.getDashboardStats(periodoEscolhido);

            return reply.send(stats);
        } catch (error: any) {
            console.error("Erro ao buscar estatísticas do dashboard:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao buscar métricas' });
        }
    }
}