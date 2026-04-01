// src/modules/finance/finance.schemas.ts
import { z } from 'zod';

export const financeSchema = z.object({
  type: z.enum(['DIZIMO', 'OFERTA']),
  value: z.number().positive('O valor deve ser maior que zero'),
  entry_date: z.string(), // O frontend vai enviar no formato 'YYYY-MM-DD'
  payment_method: z.string().min(1, 'Forma de pagamento é obrigatória'),
  member_name: z.string().optional().nullable(),
});

export type FinanceType = z.infer<typeof financeSchema>;