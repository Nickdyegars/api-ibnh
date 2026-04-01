// src/modules/finance/finance.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { FinanceType } from './finance.schemas.js';

export class FinanceService {
  async getAll() {
    return await prisma.financialEntry.findMany({
      orderBy: { entry_date: 'desc' } // Mostra sempre os mais recentes primeiro
    });
  }

  async create(data: FinanceType) {
    return await prisma.financialEntry.create({
      data: {
        type: data.type,
        value: data.value,
        entry_date: new Date(data.entry_date), // Converte a string para Data real
        payment_method: data.payment_method,
        member_name: data.member_name || 'Anônimo', // Se vier vazio, salva como Anônimo
      }
    });
  }

  async update(id: string, data: FinanceType) {
    return await prisma.financialEntry.update({
      where: { id },
      data: {
        type: data.type,
        value: data.value,
        entry_date: new Date(data.entry_date),
        payment_method: data.payment_method,
        member_name: data.member_name || 'Anônimo',
      }
    });
  }

  async delete(id: string) {
    await prisma.financialEntry.delete({
      where: { id }
    });
    return { success: true };
  }
}