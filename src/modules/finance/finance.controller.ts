// src/modules/finance/finance.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { FinanceService } from './finance.service.js';
import { financeSchema, expenseSchema } from './finance.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

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
      const requester = request.user as any;
      const data = financeSchema.parse(request.body);
      const newEntry = await financeService.create(data) as any;

      // 📝 LOG: Nova entrada financeira registrada
      AuditService.log(requester.sub, 'CREATE', 'FINANCE_ENTRY', newEntry?.id, data);

      return reply.status(201).send(newEntry);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro de validação' });
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = financeSchema.parse(request.body);
      const updatedEntry = await financeService.update(id, data);

      // 📝 LOG: Alteração em um registro de entrada existente
      AuditService.log(requester.sub, 'UPDATE', 'FINANCE_ENTRY', id, data);

      return reply.send(updatedEntry);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await financeService.delete(id);

      // 📝 LOG: Exclusão de registro de entrada
      AuditService.log(requester.sub, 'DELETE', 'FINANCE_ENTRY', id);

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
      const requester = request.user as any;
      const data = expenseSchema.parse(request.body);
      const newExpense = await financeService.createExpense(data) as any;

      // 📝 LOG: Nova despesa cadastrada
      AuditService.log(requester.sub, 'CREATE', 'FINANCE_EXPENSE', newExpense?.id, data);

      return reply.status(201).send(newExpense);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro de validação' });
    }
  }

  async updateExpense(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = expenseSchema.parse(request.body);
      const updated = await financeService.updateExpense(id, data);

      // 📝 LOG: Atualização de dados da despesa
      AuditService.log(requester.sub, 'UPDATE', 'FINANCE_EXPENSE', id, data);

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async deleteExpense(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await financeService.deleteExpense(id);

      // 📝 LOG: Exclusão permanente de uma despesa
      AuditService.log(requester.sub, 'DELETE', 'FINANCE_EXPENSE', id);

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
      const requester = request.user as any;
      const { name } = request.body as { name: string };
      if (!name || name.trim() === '') throw new Error('Nome da categoria é obrigatório');
      
      const newCategory = await financeService.createCategory(name) as any;

      // 📝 LOG: Nova categoria financeira criada
      AuditService.log(requester.sub, 'CREATE', 'FINANCE_CATEGORY', newCategory?.id, { name });

      return reply.status(201).send(newCategory);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao criar categoria' });
    }
  }

  async deleteCategory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await financeService.deleteCategory(id);

      // 📝 LOG: Categoria financeira removida
      AuditService.log(requester.sub, 'DELETE', 'FINANCE_CATEGORY', id);

      return reply.send({ message: 'Categoria apagada' });
    } catch (error) {
      return reply.status(400).send({ error: 'Erro ao apagar categoria' });
    }
  }
}