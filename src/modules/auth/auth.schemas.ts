import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.string().email('Formato de e-mail inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  role: z.enum(['admin', 'leader']).default('leader'),
  ministry: z.string().default('all')
});

export const loginSchema = z.object({
  email: z.string().email('Formato de e-mail inválido'),
  password: z.string().min(1, 'A senha é obrigatória')
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório').optional(),
  email: z.string().email('Formato de e-mail inválido').optional(),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').optional(), // Senha opcional!
  role: z.enum(['admin', 'leader']).optional(),
  ministry: z.string().optional()
});