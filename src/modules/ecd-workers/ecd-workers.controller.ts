// src/modules/ecd-workers/ecd-workers.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdWorkersService } from './ecd-workers.service.js';
import { workerAreaSchema, workerLeaderSchema, registerWorkerSchema } from './ecd-workers.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const service = new EcdWorkersService();

export class EcdWorkersController {

    // --- REGISTRO PÚBLICO (Rota Pública) ---
    async register(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = registerWorkerSchema.parse(request.body);
            const registration = await service.createRegistration(data);
            return reply.status(201).send({ success: true, registrationId: registration.id });
        } catch (error: any) {
            if (error instanceof z.ZodError) return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
            if (error.message === "TOKEN_NOT_FOUND" || error.message === "TOKEN_ALREADY_USED") return reply.status(400).send({ success: false, message: error.message });
            return reply.status(500).send({ success: false, message: "Erro interno no servidor." });
        }
    }

    // --- Rota Pública ---
    async validateToken(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
        try {
            return reply.send(await service.validateToken(request.params.token));
        } catch (error: any) {

            // 👇 Mapeamento correto dos erros para o Front-end
            if (error.message === "SLOTS_FULL") {
                return reply.status(400).send({ success: false, message: "SLOTS_FULL" });
            }
            if (error.message === "TOKEN_NOT_FOUND") {
                return reply.status(404).send({ success: false, message: "Link inválido." });
            }
            if (error.message === "TOKEN_ALREADY_USED") {
                return reply.status(400).send({ success: false, message: "Este link já foi utilizado." });
            }

            return reply.status(500).send({ success: false, message: "Erro ao validar o link." });
        }
    }

    // --- ÁREAS ---
    async getAreas(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await service.getAreas());
    }

    async createArea(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const data = workerAreaSchema.parse(request.body);
            const newArea = await service.createArea(data) as any;

            // 📝 LOG: Criação de nova área para equipes (ex: Cozinha)
            AuditService.log(requester.sub, 'CREATE', 'ECD_WORKER_AREA', newArea?.id, data);

            return reply.status(201).send(newArea);
        } catch (error: any) {
            if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma área com este nome.' });
            return reply.status(500).send({ error: 'Erro ao criar área.' });
        }
    }

    async deleteArea(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await service.deleteArea(id);

            // 📝 LOG: Exclusão de área de equipe
            AuditService.log(requester.sub, 'DELETE', 'ECD_WORKER_AREA', id);

            return reply.send({ success: true });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async updateArea(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const { name } = request.body as { name: string };
            const updated = await service.updateArea(id, name);

            // 📝 LOG: Edição de nome de área
            AuditService.log(requester.sub, 'UPDATE', 'ECD_WORKER_AREA', id, { name });

            return reply.send(updated);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    // --- LÍDERES ---
    async getLeaders(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { editionId } = request.query as { editionId?: string };
            return reply.send(await service.getLeaders(editionId));
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao buscar líderes.' });
        }
    }

    async createLeader(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { name, area_id, edition_id, slots } = request.body as any;

            if (!name || !area_id || !edition_id) {
                return reply.status(400).send({ error: 'Nome, área e edição são obrigatórios.' });
            }

            const newLeader = await service.createLeader(name, area_id, edition_id, Number(slots) || 0) as any;

            // 📝 LOG: Cadastro de Líder de Equipe alocado em uma área e edição específica
            AuditService.log(requester.sub, 'CREATE', 'ECD_WORKER_LEADER', newLeader?.id, { name, area_id, edition_id, slots });

            return reply.status(201).send(newLeader);
        } catch (error) {
            console.error("Erro ao criar líder:", error);
            return reply.status(500).send({ error: 'Erro ao criar líder.' });
        }
    }

    async deleteLeader(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await service.deleteLeader(id);

            // 📝 LOG: Exclusão de líder de equipe do banco
            AuditService.log(requester.sub, 'DELETE', 'ECD_WORKER_LEADER', id);

            return reply.send({ success: true });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    async updateLeader(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const { name, area_id, slots } = request.body as any;
            const updated = await service.updateLeader(id, name, area_id, Number(slots));

            // 📝 LOG: Alteração nos dados de um líder de voluntários
            AuditService.log(requester.sub, 'UPDATE', 'ECD_WORKER_LEADER', id, { name, area_id, slots });

            return reply.send(updated);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }

    // --- FICHAS (REGISTRO) ---
    async getRegistrations(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await service.getRegistrations());
    }

    async approveWorker(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const { edition_id, area_id, leader_id, payment_status, receipt_photo_url } = request.body as any;

            if (!edition_id || !area_id || !leader_id || !payment_status) {
                return reply.status(400).send({ error: 'Edição, Área, Líder e Status Financeiro são obrigatórios para aprovar.' });
            }

            const result = await service.approveRegistration(id, edition_id, area_id, leader_id, payment_status, receipt_photo_url);

            // 📝 LOG: Aprovação do voluntário e alocação na equipe definitiva
            AuditService.log(requester.sub, 'APPROVE', 'ECD_WORKER_REGISTRATION', id, { edition_id, area_id, leader_id, payment_status });

            return reply.send(result);
        } catch (error) {
            console.error("Erro interno:", error);
            return reply.status(500).send({ error: 'Erro ao aprovar trabalhador.' });
        }
    }

    async rejectWorker(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const result = await service.updateStatus(id, 'RECUSADO', null);

            // 📝 LOG: Ficha do voluntário foi recusada pela liderança
            AuditService.log(requester.sub, 'REJECT', 'ECD_WORKER_REGISTRATION', id);

            return reply.send(result);
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao recusar trabalhador.' });
        }
    }

    async updatePayment(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const { status, receipt_photo_url } = request.body as { status: string, receipt_photo_url?: string };

            const updated = await service.updatePaymentStatus(id, status, receipt_photo_url);

            // 📝 LOG: Alteração no status financeiro da inscrição da equipe
            AuditService.log(requester.sub, 'UPDATE_PAYMENT', 'ECD_WORKER_REGISTRATION', id, { status });

            return reply.send(updated);
        } catch (error) {
            console.error("Erro no updatePayment controller:", error);
            return reply.status(500).send({ error: 'Erro ao atualizar dados de pagamento.' });
        }
    }

    async deleteRegistration(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            await service.deleteRegistration(id);

            // 📝 LOG: Remoção definitiva da ficha de equipe do sistema
            AuditService.log(requester.sub, 'DELETE', 'ECD_WORKER_REGISTRATION', id);

            return reply.send({ success: true });
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao excluir ficha.' });
        }
    }

    // --- Rota Pública ---
    async registerGeneric(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = registerWorkerSchema.omit({ token: true }).parse(request.body);
            const registration = await service.createRegistrationGeneric(data);
            return reply.status(201).send({ success: true, registrationId: registration.id });
        } catch (error: any) {
            console.error("ERRO NO BACK-END (registerGeneric):", error);
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
            }
            return reply.status(500).send({ success: false, message: error.message || 'Erro ao realizar pré-inscrição.' });
        }
    }

    async updateWorkerData(request: FastifyRequest, reply: FastifyReply) {
        try {
            const requester = request.user as any;
            const { id } = request.params as { id: string };
            const updated = await service.updateRegistrationData(id, request.body);

            // 📝 LOG: Quando a liderança escuta o áudio e corrige os dados de texto na ficha
            AuditService.log(requester.sub, 'UPDATE_DATA', 'ECD_WORKER_REGISTRATION', id, request.body);

            return reply.send(updated);
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao atualizar dados da ficha.' });
        }
    }

    async generatePdf(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            const pdfDoc = await service.generateWorkerLeaderPdf(id);

            // Define os headers para forçar o download de um arquivo PDF
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `attachment; filename="fichas_equipe_${id.substring(0, 5)}.pdf"`);

            return reply.send(pdfDoc);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    }
}