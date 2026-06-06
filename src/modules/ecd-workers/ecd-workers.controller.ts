import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdWorkersService } from './ecd-workers.service.js';
import { workerAreaSchema, workerLeaderSchema, registerWorkerSchema } from './ecd-workers.schemas.js';

const service = new EcdWorkersService();

export class EcdWorkersController {

    // --- REGISTRO PÚBLICO ---
    async register(request: FastifyRequest, reply: FastifyReply) {
        try {
            // Simplificado assumindo que pode vir como JSON. 
            // Se tiver upload de foto no futuro, use o request.parts() como nos encontristas.
            const data = registerWorkerSchema.parse(request.body);
            const registration = await service.createRegistration(data);
            return reply.status(201).send({ success: true, registrationId: registration.id });
        } catch (error: any) {
            if (error instanceof z.ZodError) return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
            if (error.message === "TOKEN_NOT_FOUND" || error.message === "TOKEN_ALREADY_USED") return reply.status(400).send({ success: false, message: error.message });
            return reply.status(500).send({ success: false, message: "Erro interno no servidor." });
        }
    }

    async validateToken(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
        try {
            return reply.send(await service.validateToken(request.params.token));
        } catch (error: any) {
            return reply.status(400).send({ success: false, message: error.message });
        }
    }

    // --- ÁREAS ---
    async getAreas(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await service.getAreas());
    }

    async createArea(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = workerAreaSchema.parse(request.body);
            return reply.status(201).send(await service.createArea(data));
        } catch (error: any) {
            if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma área com este nome.' });
            return reply.status(500).send({ error: 'Erro ao criar área.' });
        }
    }

    async deleteArea(request: FastifyRequest, reply: FastifyReply) {
        try {
            await service.deleteArea((request.params as any).id);
            return reply.send({ success: true });
        } catch (error: any) {
            if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem líderes ou fichas atreladas a esta área.' });
            return reply.status(500).send({ error: 'Erro ao excluir área.' });
        }
    }

    // --- LÍDERES ---
    async getLeaders(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await service.getLeaders());
    }

    async createLeader(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = workerLeaderSchema.parse(request.body);
            return reply.status(201).send(await service.createLeader(data));
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao criar líder.' });
        }
    }

    async deleteLeader(request: FastifyRequest, reply: FastifyReply) {
        try {
            await service.deleteLeader((request.params as any).id);
            return reply.send({ success: true });
        } catch (error: any) {
            if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem fichas atreladas a este líder.' });
            return reply.status(500).send({ error: 'Erro ao excluir líder.' });
        }
    }

    // --- FICHAS (REGISTRO) ---
    async getRegistrations(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await service.getRegistrations());
    }

    async approveWorker(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            const { edition_id, area_id, leader_id, payment_status, receipt_photo_url } = request.body as any;

            if (!edition_id || !area_id || !leader_id || !payment_status) {
                return reply.status(400).send({ error: 'Edição, Área, Líder e Status Financeiro são obrigatórios para aprovar.' });
            }

            const result = await service.approveRegistration(id, edition_id, area_id, leader_id, payment_status, receipt_photo_url);
            return reply.send(result);
        } catch (error) {
            console.error("Erro interno:", error);
            return reply.status(500).send({ error: 'Erro ao aprovar trabalhador.' });
        }
    }

    async rejectWorker(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            return reply.send(await service.updateStatus(id, 'RECUSADO', null));
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao recusar trabalhador.' });
        }
    }

    async updatePayment(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };

            // Garante que aceita tanto o status text quanto a string da URL do comprovante
            const { status, receipt_photo_url } = request.body as { status: string, receipt_photo_url?: string };

            const updated = await service.updatePaymentStatus(id, status, receipt_photo_url);
            return reply.send(updated);
        } catch (error) {
            console.error("Erro no updatePayment controller:", error);
            return reply.status(500).send({ error: 'Erro ao atualizar dados de pagamento.' });
        }
    }

    async deleteRegistration(request: FastifyRequest, reply: FastifyReply) {
        try {
            await service.deleteRegistration((request.params as any).id);
            return reply.send({ success: true });
        } catch (error) {
            return reply.status(500).send({ error: 'Erro ao excluir ficha.' });
        }
    }

    async registerGeneric(request: FastifyRequest, reply: FastifyReply) {
        try {
            const data = registerWorkerSchema.omit({ token: true }).parse(request.body);
            const registration = await service.createRegistrationGeneric(data);
            return reply.status(201).send({ success: true, registrationId: registration.id });
        } catch (error: any) {
            // 👇 ISSO AQUI VAI MOSTRAR O ERRO REAL NO TERMINAL DO SEU BACK-END 👇
            console.error("ERRO NO BACK-END (registerGeneric):", error);

            if (error instanceof z.ZodError) {
                return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
            }

            // Retorna a mensagem real do erro para o front-end
            return reply.status(500).send({ success: false, message: error.message || 'Erro ao realizar pré-inscrição.' });
        }
    }
}