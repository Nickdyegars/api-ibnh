// src/modules/rosters/roster.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { RosterService } from './roster.service.js';
import { getRostersQuerySchema, createRosterBodySchema } from './roster.schemas.js';
import { prisma } from '../../shared/database/prisma.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const rosterService = new RosterService();

export class RosterController {

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any; // Pegamos quem está logado pelo Token JWT!
            const data = createRosterBodySchema.parse(request.body);

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
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

            const newRoster = await rosterService.createRoster(data) as any;

            // 📝 LOG: Geração e publicação de uma nova escala ministerial
            AuditService.log(user.sub, 'CREATE', 'ROSTER', newRoster?.id, data);

            return reply.status(201).send(newRoster);
        } catch (error: any) {
            console.error("Erro ao criar escala:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao criar escala' });
        }
    }

    async generatePreview(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any; 
            const data = request.body as any;

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
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
            const user = request.user as any;
            const { id } = request.params as { id: string };

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
                const schedule = await prisma.schedule.findUnique({
                    where: { id },
                    include: { ministry: true }
                });

                if (!schedule) return reply.status(404).send({ error: 'Escala não encontrada.' });

                const userMinistryName = user.ministry_access || user.ministry || '';
                const userMin = userMinistryName.trim().toLowerCase();
                const dataMin = (schedule.ministry?.name || '').trim().toLowerCase();

                const isMultimediaSub = userMin === 'multimídia' && dataMin.includes('multimídia');

                if (userMin !== dataMin && !isMultimediaSub) {
                    return reply.status(403).send({
                        error: `Acesso negado: Seu perfil não tem permissão para apagar escalas de ${schedule.ministry?.name}.`
                    });
                }
            }
            // =================================

            await rosterService.deleteRoster(id);

            // 📝 LOG: Escala ministerial apagada do sistema
            AuditService.log(user.sub, 'DELETE', 'ROSTER', id);

            return reply.send({ message: 'Escala apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar escala' });
        }
    }

    async updateShift(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const { shiftId } = request.params as { shiftId: string };
            const { team } = request.body as { team: string[] };

            const shift = await prisma.shift.findUnique({
                where: { id: shiftId },
                include: { schedule: { include: { ministry: true } } }
            });

            if (!shift) return reply.status(404).send({ error: "Turno não encontrado" });

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (user.level > 0) {
                const userMinistryName = user.ministry_access || user.ministry || '';
                const userMin = userMinistryName.trim().toLowerCase();
                const dataMin = (shift.schedule?.ministry?.name || '').trim().toLowerCase();

                const isMultimediaSub = userMin === 'multimídia' && dataMin.includes('multimídia');

                if (userMin !== dataMin && !isMultimediaSub) {
                    return reply.status(403).send({
                        error: `Acesso negado: Seu perfil não pode editar escalas de ${shift.schedule?.ministry?.name}.`
                    });
                }
            }
            // =================================

            const result = await rosterService.updateShiftTeam(shiftId, team);

            // 📝 LOG: Alteração manual de voluntários dentro de um turno (Edição rápida)
            AuditService.log(user.sub, 'UPDATE_SHIFT', 'ROSTER', shiftId, { team });

            return reply.send(result);
        } catch (error: any) {
            console.error("Erro ao editar turno:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao editar escala' });
        }
    }
}