import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.string().email('Formato de e-mail inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  role: z.enum([
    'admin',
    'admin_geral',
    'admin_congregacao',
    'leader',
    'lider_ministerio',
    'storymaker',
    'member',
    'operator',
    'voluntario'
  ]).default('lider_ministerio'),
  ministry: z.string().default('all'),
  congregation_id: z.string().uuid('ID de congregação inválido').optional().nullable()
});

export const loginSchema = z.object({
  email: z.string().email('Formato de e-mail inválido'),
  password: z.string().min(1, 'A senha é obrigatória')
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório').optional(),
  email: z.string().email('Formato de e-mail inválido').optional(),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').optional(),
  role: z.enum([
    'admin',
    'admin_geral',
    'admin_congregacao',
    'leader',
    'lider_ministerio',
    'storymaker',
    'member',
    'operator',
    'voluntario'
  ]).optional(),
  ministry: z.string().optional(),
  congregation_id: z.string().uuid('ID de congregação inválido').optional().nullable()
});

export const firstAccessPasswordSchema = z.object({
  newPassword: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres')
});
