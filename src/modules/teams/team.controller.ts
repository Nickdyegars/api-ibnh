// src/modules/teams/team.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { TeamService } from './team.service.js';
import { teamBodySchema, getTeamsQuerySchema } from './team.schemas.js';
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
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);

            const rawBody = request.body as any;
            const bodyData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

            // === TRAVA DE SEGURANÇA ===
            if (userLevel >= 3) {
                return reply.status(403).send({
                    error: 'Acesso negado: Voluntários não têm permissão para criar equipes.'
                });
            }

            if (userLevel > 0 && user?.congregation_id) {
                bodyData.congregation_id = user.congregation_id;
            }

            const { name, ministry, congregation_id } = teamBodySchema.parse(bodyData);

            if (userLevel === 2) {
                const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                const dMin = (ministry || '').trim().toLowerCase();

                if (userMinistryName !== 'all' && userMinistryName !== dMin) {
                    return reply.status(403).send({
                        error: `Acesso negado: Somente o Admin ou o Líder de ${ministry} podem criar bandas/equipes.`
                    });
                }
            }
            // ==========================

            const newTeam = await teamService.createTeam(name, ministry, congregation_id) as any;

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
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const { id } = request.params as { id: string };

            const team = await teamService.findById(id);
            if (!team) {
                return reply.status(404).send({ error: 'Equipe não encontrada.' });
            }

            // === TRAVA DE SEGURANÇA RBAC DINÂMICA ===
            if (userLevel >= 3) {
                return reply.status(403).send({ error: 'Acesso negado.' });
            }

            if (userLevel > 0) {
                const teamCongId = team.ministry?.congregation_id || team.ministry?.congregation?.id;
                if (user?.congregation_id && teamCongId && teamCongId !== user.congregation_id) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Você só pode excluir equipes da sua congregação.'
                    });
                }

                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const teamMin = (team.ministry?.name || '').trim().toLowerCase();
                    if (userMinistryName !== 'all' && userMinistryName !== teamMin) {
                        return reply.status(403).send({ 
                            error: `Acesso negado: Você não tem permissão para apagar equipes do ministério ${team.ministry?.name}.` 
                        });
                    }
                }
            }
            // =========================================

            await teamService.deleteTeam(id);

            AuditService.log(user.sub, 'DELETE', 'TEAM', id, { name: team.name, ministry: team.ministry?.name });

            return reply.send({ message: 'Equipe apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar equipe' });
        }
    }
}
