// src/modules/finance/finance.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { FinanceService } from './finance.service.js';
import { financeSchema } from './finance.schemas.js';

const financeService = new FinanceService();

export class FinanceController {
  async getAll(request: FastifyRequest, reply: FastifyReply) {
    try {
      const entries = await financeService.getAll();
      return reply.send(entries);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar registros financeiros.' });
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = financeSchema.parse(request.body);
      const newEntry = await financeService.create(data);
      return reply.status(201).send(newEntry);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro de validação' });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const data = financeSchema.parse(request.body);
      const updatedEntry = await financeService.update(id, data);
      return reply.send(updatedEntry);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await financeService.delete(id);
      return reply.send({ message: 'Registro apagado com sucesso' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar registro' });
    }
  }
}