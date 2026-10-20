// src/modules/teams/team.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { TeamService } from './team.service.js';
import { teamBodySchema, getTeamsQuerySchema } from './team.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const teamService = new TeamService();

export class TeamController {
    async list(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { ministry, congregationId } = getTeamsQuerySchema.parse(request.query);
            const teams = await teamService.getTeams(ministry, congregationId);
            return reply.send(teams);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message || 'Erro ao buscar equipes' });
        }
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;

            // 👇 A VACINA CONTRA O ERRO DE STRING 👇
            const rawBody = request.body as any;
            const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

            const { name, ministry, congregation_id } = teamBodySchema.parse(bodyData);

            // === TRAVA DE SEGURANÇA ===
            if (user.level > 0) {
                const userMinistryName = user.ministry_access || user.ministry || '';

                if (userMinistryName !== ministry) {
                    return reply.status(403).send({
                        error: `Acesso negado: Somente o Admin ou o Líder de ${ministry} podem criar bandas.`
                    });
                }
            }
            // ==========================

            const newTeam = await teamService.createTeam(name, ministry, congregation_id) as any;

            // 📝 LOG: Nova banda/equipe integrada a um ministério
            AuditService.log(user.sub, 'CREATE', 'TEAM', newTeam?.id, { name, ministry, congregation_id });

            return reply.status(201).send(newTeam);
        } catch (error: any) {
            console.error("ERRO AO CRIAR BANDA:", error);
            return reply.status(400).send({ error: error.message });
        }
    }   

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const { id } = request.params as { id: string };

            const team = await teamService.findById(id);
            if (!team) {
                return reply.status(404).send({ error: 'Equipe não encontrada.' });
            }

            // === TRAVA DE SEGURANÇA RBAC DINÂMICA ===
            if (user.level > 0) {
                const userMinistryName = user.ministry_access || user.ministry || '';
                if (userMinistryName !== 'all' && userMinistryName !== team.ministry?.name) {
                    return reply.status(403).send({ 
                        error: `Acesso negado: Você não tem permissão para apagar equipes do ministério ${team.ministry?.name}.` 
                    });
                }
            }
            // =========================================

            await teamService.deleteTeam(id);

            // 📝 LOG: Remoção de banda/equipe do sistema
            AuditService.log(user.sub, 'DELETE', 'TEAM', id, { name: team.name, ministry: team.ministry?.name });

            return reply.send({ message: 'Equipe apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar equipe' });
        }
    }
}
