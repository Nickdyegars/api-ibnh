import { FastifyReply, FastifyRequest } from 'fastify';
import { TeamService } from './team.service.js';
import { teamBodySchema, getTeamsQuerySchema } from './team.schemas.js';

const teamService = new TeamService();

export class TeamController {
    async list(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { ministry } = getTeamsQuerySchema.parse(request.query);
            const teams = await teamService.getTeams(ministry);
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

            const { name, ministry } = teamBodySchema.parse(bodyData);

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

            const newTeam = await teamService.createTeam(name, ministry);
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

            // === TRAVA DE SEGURANÇA ===
            if (user.level > 0) {
                const userMinistryName = user.ministry_access || user.ministry || '';
                // Para deletar, a pessoa tem que ser do Louvor (ou do ministério alvo). 
                // Como a rota delete não recebe o nome do ministério no body, travamos para o ministério do usuário logado.
                if (userMinistryName !== 'Louvor') {
                    return reply.status(403).send({ error: 'Acesso negado.' });
                }
            }
            // ==========================

            await teamService.deleteTeam(id);
            return reply.send({ message: 'Equipe apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar equipe' });
        }
    }
}