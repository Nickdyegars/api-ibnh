import { z } from 'zod';

// Schema para Entradas (Dízimos/Ofertas)
export const financeSchema = z.object({
  type: z.enum(['DIZIMO', 'OFERTA']),
  value: z.number().positive('O valor deve ser maior que zero'),
  entry_date: z.string(),
  payment_method: z.string().min(1, 'Forma de pagamento é obrigatória'),
  member_name: z.string().optional().nullable(),
});

// === NOVO: Schema para Saídas (Gastos) ===
export const expenseSchema = z.object({
  description: z.string().min(3, 'A descrição deve ter pelo menos 3 caracteres'),
  value: z.number().positive('O valor deve ser maior que zero'),
  category: z.string().min(1, 'A categoria é obrigatória'),
  expense_date: z.string(),
  payment_method: z.string().min(1, 'Forma de pagamento é obrigatória'),
});

export type FinanceType = z.infer<typeof financeSchema>;
export type ExpenseType = z.infer<typeof expenseSchema>;