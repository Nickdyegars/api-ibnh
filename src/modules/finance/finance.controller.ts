import { FastifyReply, FastifyRequest } from 'fastify';
import { FinanceService } from './finance.service.js';
import { financeSchema, expenseSchema } from './finance.schemas.js';

const financeService = new FinanceService();

export class FinanceController {
  
  // --- HANDLERS DE ENTRADAS ---
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

  // --- HANDLERS DE SAÍDAS (DESPESAS) ---
  async getAllExpenses(request: FastifyRequest, reply: FastifyReply) {
    try {
      const expenses = await financeService.getAllExpenses();
      return reply.send(expenses);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar despesas.' });
    }
  }

  async createExpense(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = expenseSchema.parse(request.body);
      const newExpense = await financeService.createExpense(data);
      return reply.status(201).send(newExpense);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro de validação' });
    }
  }

  async updateExpense(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const data = expenseSchema.parse(request.body);
      const updated = await financeService.updateExpense(id, data);
      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async deleteExpense(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await financeService.deleteExpense(id);
      return reply.send({ message: 'Despesa apagada com sucesso' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar despesa' });
    }
  }

  // --- HANDLERS DE CATEGORIAS ---
  async getCategories(request: FastifyRequest, reply: FastifyReply) {
    try {
      const categories = await financeService.getCategories();
      return reply.send(categories);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar categorias.' });
    }
  }

  async createCategory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name } = request.body as { name: string };
      if (!name || name.trim() === '') throw new Error('Nome da categoria é obrigatório');
      
      const newCategory = await financeService.createCategory(name);
      return reply.status(201).send(newCategory);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao criar categoria' });
    }
  }

  async deleteCategory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await financeService.deleteCategory(id);
      return reply.send({ message: 'Categoria apagada' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar categoria' });
    }
  }
}