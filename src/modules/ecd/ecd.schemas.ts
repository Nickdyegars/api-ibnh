// src/modules/ecd/ecd.schemas.ts
import { z } from 'zod';

// Helper para converter "sim"/"nao" do formulário para boolean
const simNaoToBool = z.enum(['sim', 'nao']).transform((val) => val === 'sim').or(z.boolean());

export const registerEcdSchema = z.object({
  token: z.string().uuid("Token de inscrição inválido."),
  
  // Dados Pessoais
  fullName: z.string().min(3, "Nome completo é obrigatório"),
  nickname: z.string().optional().nullable(),
  phone: z.string().min(10, "Telefone inválido"),
  gender: z.enum(['M', 'F']),
  age: z.union([z.number(), z.string().transform(Number)]),
  address: z.string().min(5, "Endereço é obrigatório"),
  
  // Família
  isMarried: simNaoToBool,
  spouseName: z.string().optional().nullable(),
  relativeGoing: simNaoToBool,
  relativeDegree: z.string().optional().nullable(),
  
  // Saúde
  hasIllness: simNaoToBool,
  illnessDesc: z.string().optional().nullable(),
  takesMedication: simNaoToBool,
  medicationDesc: z.string().optional().nullable(),
  dietaryRestriction: simNaoToBool,
  dietaryDesc: z.string().optional().nullable(),
  shirtSize: z.string().optional().nullable(),
  
  // Emergência
  emergencyContact: z.string().min(3, "Contato de emergência obrigatório"),
  emergencyPhone: z.string().min(10, "Telefone de emergência inválido"),
  
  // Igreja
  isFirstTime: simNaoToBool,
  inCell: simNaoToBool,
  cellLeaderName: z.string().optional().nullable(),
  invitedBy: z.string().optional().nullable(),
});

// Tipagem gerada automaticamente pelo Zod para o TypeScript
export type RegisterEcdType = z.infer<typeof registerEcdSchema>;