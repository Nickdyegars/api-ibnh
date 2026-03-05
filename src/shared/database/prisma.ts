import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['query', 'error'], // Isso vai te ajudar a ver o SQL gerado no terminal
});