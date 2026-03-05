// src/modules/rosters/roster.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { RosterService } from './roster.service.js';
import { getRostersQuerySchema, createRosterBodySchema } from './roster.schemas.js';

const rosterService = new RosterService();

export class RosterController {

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any; // Pegamos quem está logado pelo Token JWT!
            const data = createRosterBodySchema.parse(request.body);

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
                // Agora o backend pega o ministry_access do token!
                const userMinistryName = user.ministry_access || user.ministry || '';

                const userMin = userMinistryName.trim().toLowerCase();
                const dataMin = (data.ministry || '').trim().toLowerCase();

                const isMultimediaSub = userMin === 'multimídia' && dataMin.includes('multimídia');

                if (userMin !== dataMin && !isMultimediaSub) {
                    return reply.status(403).send({
                        error: `Acesso negado: Seu perfil (${userMinistryName || 'Nenhum'}) não pode gerenciar escalas de ${data.ministry}.`
                    });
                }
            }
            // =================================

            const newRoster = await rosterService.createRoster(data);
            return reply.status(201).send(newRoster);
        } catch (error: any) {
            console.error("Erro ao criar escala:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao criar escala' });
        }
    }

    async generatePreview(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any; // Pegamos quem está logado
            const data = request.body as any;

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
                // Agora o backend pega o ministry_access do token!
                const userMinistryName = user.ministry_access || user.ministry || '';

                const userMin = userMinistryName.trim().toLowerCase();
                const dataMin = (data.ministry || '').trim().toLowerCase();

                const isMultimediaSub = userMin === 'multimídia' && dataMin.includes('multimídia');

                if (userMin !== dataMin && !isMultimediaSub) {
                    return reply.status(403).send({
                        error: `Acesso negado: Seu perfil (${userMinistryName || 'Nenhum'}) não pode gerenciar escalas de ${data.ministry}.`
                    });
                }
            }
            // =================================

            const preview = await rosterService.generateRosterPreview(data);
            return reply.send(preview);
        } catch (error: any) {
            console.error("Erro ao gerar preview da escala:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao gerar a escala' });
        }
    }

    async list(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { ministry } = getRostersQuerySchema.parse(request.query);
            const rosters = await rosterService.getAllRosters(ministry);
            return reply.send(rosters);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            await rosterService.deleteRoster(id);
            return reply.send({ message: 'Escala apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar escala' });
        }
    }

}