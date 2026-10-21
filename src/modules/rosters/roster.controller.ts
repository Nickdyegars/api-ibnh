import { FastifyReply, FastifyRequest } from 'fastify';
import { RosterService } from './roster.service.js';
import { getRostersQuerySchema, createRosterBodySchema } from './roster.schemas.js';
import { AuditService } from '../../shared/services/audit/audit.service.js';

const rosterService = new RosterService();

export class RosterController {

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const data = createRosterBodySchema.parse(request.body);

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (userLevel > 0) {
                if (userLevel >= 3) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Voluntários não têm permissão para criar escalas.'
                    });
                }

                // Se não for Super Admin, força a congregação do usuário logado
                if (user?.congregation_id) {
                    data.congregationId = user.congregation_id;
                }

                // Líder de ministério (nível 2) só pode criar para o ministério dele (ou se tiver 'all')
                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const dataMin = (data.ministry || '').trim().toLowerCase();
                    const isMultimediaSub = userMinistryName === 'multimídia' && dataMin.includes('multimídia');

                    if (userMinistryName !== 'all' && userMinistryName !== dataMin && !isMultimediaSub) {
                        return reply.status(403).send({
                            error: `Acesso negado: Seu perfil (${user.ministry_access || 'Nenhum'}) não pode criar escalas de ${data.ministry}.`
                        });
                    }
                }
                // Admin de congregação (nível 1) pode criar escalas para qualquer ministério de sua congregação
            }
            // =================================

            const result = await rosterService.createRoster(data);

            AuditService.log(user.sub, 'CREATE', 'ROSTER', result.schedule?.id, data);

            return reply.status(201).send(result);
        } catch (error: any) {
            console.error("Erro ao criar escala:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao criar escala' });
        }
    }

    async generatePreview(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const data = request.body as any;

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (userLevel > 0) {
                if (userLevel >= 3) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Voluntários não têm permissão para gerar escalas.'
                    });
                }

                // Se não for Super Admin, força a congregação do usuário logado
                if (user?.congregation_id) {
                    data.congregationId = user.congregation_id;
                }

                // Líder de ministério (nível 2) só pode gerar para o ministério dele (ou se tiver 'all')
                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const dataMin = (data.ministry || '').trim().toLowerCase();
                    const isMultimediaSub = userMinistryName === 'multimídia' && dataMin.includes('multimídia');

                    if (userMinistryName !== 'all' && userMinistryName !== dataMin && !isMultimediaSub) {
                        return reply.status(403).send({
                            error: `Acesso negado: Seu perfil (${user.ministry_access || 'Nenhum'}) não pode gerenciar escalas de ${data.ministry}.`
                        });
                    }
                }
                // Admin de congregação (nível 1) tem permissão para gerenciar todos os ministérios da sua congregação!
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
            const requester = request.user as any;
            const requesterLevel = Number(requester?.level ?? requester?.user_level ?? 3);
            let { ministry, congregationId } = getRostersQuerySchema.parse(request.query);

            if (requesterLevel !== 0 && requester?.congregation_id) {
                congregationId = requester.congregation_id;
            }

            // Líder de ministério com acesso restrito
            if (requesterLevel === 2 && requester.ministry_access && requester.ministry_access !== 'all') {
                ministry = requester.ministry_access;
            }

            const rosters = await rosterService.getAllRosters(ministry, congregationId);
            return reply.send(rosters);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const { id } = request.params as { id: string };

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (userLevel > 0) {
                if (userLevel >= 3) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Voluntários não têm permissão para apagar escalas.'
                    });
                }

                const schedule = await rosterService.findScheduleById(id);
                if (!schedule) return reply.status(404).send({ error: 'Escala não encontrada.' });

                // Trava de congregação
                if (user?.congregation_id && schedule.congregation_id && schedule.congregation_id !== user.congregation_id) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Você só pode apagar escalas da sua congregação.'
                    });
                }

                // Trava de ministério para líder de ministério
                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const dataMin = (schedule.ministry?.name || '').trim().toLowerCase();
                    const isMultimediaSub = userMinistryName === 'multimídia' && dataMin.includes('multimídia');

                    if (userMinistryName !== 'all' && userMinistryName !== dataMin && !isMultimediaSub) {
                        return reply.status(403).send({
                            error: `Acesso negado: Seu perfil não tem permissão para apagar escalas de ${schedule.ministry?.name}.`
                        });
                    }
                }
            }
            // =================================

            await rosterService.deleteRoster(id);

            AuditService.log(user.sub, 'DELETE', 'ROSTER', id);

            return reply.send({ message: 'Escala apagada com sucesso' });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Erro ao apagar escala' });
        }
    }

    async updateShift(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const { shiftId } = request.params as { shiftId: string };
            const { team } = request.body as { team: string[] };

            const shift = await rosterService.findShiftById(shiftId);
            if (!shift) return reply.status(404).send({ error: "Turno não encontrado" });

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (userLevel > 0) {
                if (userLevel >= 3) {
                    return reply.status(403).send({ error: 'Acesso negado.' });
                }

                const scheduleCongId = shift.schedule?.congregation_id;
                if (user?.congregation_id && scheduleCongId && scheduleCongId !== user.congregation_id) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Você só pode editar escalas da sua congregação.'
                    });
                }

                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const dataMin = (shift.schedule?.ministry?.name || '').trim().toLowerCase();
                    const isMultimediaSub = userMinistryName === 'multimídia' && dataMin.includes('multimídia');

                    if (userMinistryName !== 'all' && userMinistryName !== dataMin && !isMultimediaSub) {
                        return reply.status(403).send({
                            error: `Acesso negado: Seu perfil não pode editar escalas de ${shift.schedule?.ministry?.name}.`
                        });
                    }
                }
            }
            // =================================

            const result = await rosterService.updateShiftTeam(shiftId, team);

            AuditService.log(user.sub, 'UPDATE_SHIFT', 'ROSTER', shiftId, { team });

            return reply.send(result);
        } catch (error: any) {
            console.error("Erro ao editar turno:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao editar escala' });
        }
    }

    async syncCalendar(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const { rosterData } = request.body as any;

            if (!rosterData) {
                return reply.status(400).send({ error: 'Dados da escala não informados.' });
            }

            // === TRAVA DE SEGURANÇA (RBAC) ===
            if (userLevel > 0) {
                if (userLevel >= 3) {
                    return reply.status(403).send({ error: 'Acesso negado.' });
                }

                const rCongId = rosterData.congregation_id || rosterData.congregation?.id;
                if (user?.congregation_id && rCongId && rCongId !== user.congregation_id) {
                    return reply.status(403).send({
                        error: 'Acesso negado: Você só pode sincronizar escalas da sua congregação.'
                    });
                }

                if (userLevel === 2) {
                    const userMinistryName = (user.ministry_access || user.ministry || '').trim().toLowerCase();
                    const dataMin = (rosterData.ministry || '').trim().toLowerCase();
                    const isMultimediaSub = userMinistryName === 'multimídia' && dataMin.includes('multimídia');

                    if (userMinistryName !== 'all' && userMinistryName !== dataMin && !isMultimediaSub) {
                        return reply.status(403).send({
                            error: `Acesso negado: Seu perfil não pode sincronizar agendas do ministério ${rosterData.ministry}.`
                        });
                    }
                }
            }
            // =================================

            await rosterService.syncRosterToCalendar(rosterData);

            return reply.send({ success: true, message: 'Escala sincronizada com sucesso!' });
        } catch (error: any) {
            console.error("Erro ao sincronizar calendário no controller:", error);
            return reply.status(400).send({ error: error.message || 'Erro ao sincronizar agenda.' });
        }
    }

    async getSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const settings = await rosterService.getRosterSettings();
            return reply.send({ settings });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async saveSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as any;
            const userLevel = Number(user?.level ?? user?.user_level ?? 3);
            const { congregationId, defaultMode, ministryModes } = request.body as any;

            if (userLevel > 1) {
                return reply.status(403).send({ error: 'Acesso negado: Apenas administradores podem alterar configurações de escala.' });
            }

            if (userLevel === 1 && user.congregation_id && congregationId !== user.congregation_id) {
                return reply.status(403).send({ error: 'Acesso negado: Você só pode configurar a sua congregação.' });
            }

            const updated = await rosterService.saveRosterSettings(congregationId, {
                defaultMode,
                ministryModes
            });

            return reply.send({ success: true, settings: updated });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }
}
