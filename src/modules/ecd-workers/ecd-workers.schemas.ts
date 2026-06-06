import { z } from 'zod';

const simNaoToBool = z.enum(['sim', 'nao']).transform((val) => val === 'sim').or(z.boolean());

export const workerAreaSchema = z.object({
  name: z.string().min(2, "O nome da área é obrigatório"),
});

export const workerLeaderSchema = z.object({
  name: z.string().min(3, "O nome do líder é obrigatório"),
  areaId: z.string().uuid("ID da área inválido"),
  slots: z.number().int().min(1, "O líder precisa ter pelo menos 1 vaga").or(z.string().transform(Number)),
});

export const registerWorkerSchema = z.object({
  token: z.string().uuid("Token de inscrição inválido."),
  
  // Dados Básicos
  fullName: z.string().min(3, "Nome completo é obrigatório"),
  gender: z.enum(['M', 'F']),
  phone: z.string().min(10, "Telefone inválido"),
  age: z.union([z.number(), z.string().transform(Number)]),
  maritalStatus: z.string().min(2, "Estado civil obrigatório"),
  
  // Ficha Específica
  hasServedBefore: simNaoToBool,
  previousTeam: z.string().optional().nullable(),
  bringingTarget: simNaoToBool,
  targetName: z.string().optional().nullable(),
  cellLeader: z.string().optional().nullable(),
  relativeParticipating: simNaoToBool,
  relativeKinship: z.string().optional().nullable(),

  // Saúde e Logística
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  healthIssues: z.string().optional().nullable(),
  dietaryRestrictions: z.string().optional().nullable(),
  observations: z.string().optional().nullable(),

  profilePhotoUrl: z.string().optional().nullable(),
  receiptPhotoUrl: z.string().optional().nullable(),
});

export type WorkerAreaType = z.infer<typeof workerAreaSchema>;
export type WorkerLeaderType = z.infer<typeof workerLeaderSchema>;
export type RegisterWorkerType = z.infer<typeof registerWorkerSchema>;