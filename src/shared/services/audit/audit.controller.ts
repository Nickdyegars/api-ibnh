import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../database/prisma.js';

export class AuditController {
    async getLogs(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            
            // TRAVA: Apenas nível 0 (Administrador Master) pode ver a auditoria
            if (requester.level !== 0) {
                return reply.status(403).send({ error: 'Acesso negado. Apenas administradores master podem visualizar logs.' });
            }

            // Busca os últimos 150 logs para não pesar o servidor
            const logs = await prisma.auditLog.findMany({
                orderBy: { created_at: 'desc' },
                take: 150,
            });

            // Extrai todos os IDs únicos dos usuários que fizeram ações
            const userIds = [...new Set(logs.map(log => log.user_id))];

            // Busca os dados desses usuários
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { 
                    id: true, 
                    email: true, 
                    profile: { select: { full_name: true } } 
                }
            });

            // Mescla o log com o nome do usuário
            const formattedLogs = logs.map(log => {
                const user = users.find(u => u.id === log.user_id);
                return {
                    id: log.id,
                    action: log.action,
                    resource: log.resource,
                    resource_id: log.resource_id,
                    details: log.details,
                    created_at: log.created_at,
                    user_name: user?.profile?.full_name || user?.email || 'Usuário Deletado/Desconhecido'
                };
            });

            return reply.send(formattedLogs);
        } catch (error) {
            console.error("Erro ao buscar logs de auditoria:", error);
            return reply.status(500).send({ error: 'Erro interno ao buscar histórico.' });
        }
    }
}