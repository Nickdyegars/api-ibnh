import { prisma } from '../../shared/database/prisma.js';
import { FinanceType, ExpenseType } from './finance.schemas.js';

export class FinanceService {
  // --- MÉTODOS DE ENTRADAS (Existentes) ---
  async getAll() {
    return await prisma.financialEntry.findMany({
      orderBy: { entry_date: 'desc' }
    });
  }

  async create(data: FinanceType) {
    return await prisma.financialEntry.create({
      data: {
        type: data.type,
        value: data.value,
        entry_date: new Date(data.entry_date),
        payment_method: data.payment_method,
        member_name: data.member_name || 'Anônimo',
      }
    });
  }

  async update(id: string, data: FinanceType) {
    return await prisma.financialEntry.update({
      where: { id },
      data: {
        ...data,
        entry_date: new Date(data.entry_date),
        member_name: data.member_name || 'Anônimo',
      }
    });
  }

  async delete(id: string) {
    await prisma.financialEntry.delete({ where: { id } });
    return { success: true };
  }

  // --- NOVO: MÉTODOS DE SAÍDAS (GASTOS) ---
  async getAllExpenses() {
    return await prisma.financialExpense.findMany({
      orderBy: { expense_date: 'desc' }
    });
  }

  async createExpense(data: ExpenseType) {
    return await prisma.financialExpense.create({
      data: {
        description: data.description,
        value: data.value,
        category: data.category,
        expense_date: new Date(data.expense_date),
        payment_method: data.payment_method,
      }
    });
  }

  async updateExpense(id: string, data: ExpenseType) {
    return await prisma.financialExpense.update({
      where: { id },
      data: {
        description: data.description,
        value: data.value,
        category: data.category, // 👈 ADICIONE ESTA LINHA
        expense_date: new Date(data.expense_date),
        payment_method: data.payment_method,
      }
    });
  }
  async deleteExpense(id: string) {
    await prisma.financialExpense.delete({ where: { id } });
    return { success: true };
  }

  async getCategories() {
    return await prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async createCategory(name: string) {
    // Transforma para maiúsculo para manter o padrão (ex: CONSTRUCAO)
    return await prisma.expenseCategory.create({
      data: { name: name.toUpperCase() }
    });
  }

  async deleteCategory(id: string) {
    await prisma.expenseCategory.delete({ where: { id } });
    return { success: true };
  }
}