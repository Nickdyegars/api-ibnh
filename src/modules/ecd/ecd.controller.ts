// src/modules/ecd/ecd.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema } from './ecd.schemas.js';

const ecdService = new EcdService();

export class EcdController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = registerEcdSchema.parse(request.body);
      
      const registration = await ecdService.createRegistration(data);

      return reply.status(201).send({
        success: true,
        message: "Inscrição realizada com sucesso!",
        registrationId: registration.id
      });

    } catch (error: unknown) { // 👈 Mude para unknown para ser mais seguro
      
      // Erro de Validação do Zod
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ 
          success: false, 
          message: "Dados inválidos no formulário", 
          // error.format() é a forma oficial e mais limpa do Zod de retornar os erros
          errors: error.format() 
        });
      }

      // Verificamos se o erro é uma instância padrão do JS e validamos a mensagem
      if (error instanceof Error) {
        if (error.message === "TOKEN_NOT_FOUND") {
          return reply.status(404).send({ success: false, message: "Link de inscrição inválido ou não encontrado." });
        }
        if (error.message === "TOKEN_ALREADY_USED") {
          return reply.status(400).send({ success: false, message: "Este link já foi utilizado para uma inscrição." });
        }
      }

      // Outros Erros
      console.error("🔥 Erro interno no ECD:", error);
      return reply.status(500).send({ success: false, message: "Erro interno no servidor." });
    }
  }

  // ... (abaixo do register)

  async getLeaders(request: FastifyRequest, reply: FastifyReply) {
    try {
      const leaders = await ecdService.getLeaders();
      return reply.send(leaders);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar líderes' });
    }
  }

  async getRegistrations(request: FastifyRequest, reply: FastifyReply) {
    try {
      const registrations = await ecdService.getRegistrations();
      return reply.send(registrations);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar inscritos' });
    }
  }

  async createLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Como é uma rota de painel, podemos pegar os dados diretos (ou criar um schema Zod depois)
      const { name, yellowSlots, greenSlots } = request.body as any;
      
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });

      const newLeader = await ecdService.createLeaderWithTokens(name, Number(yellowSlots), Number(greenSlots));
      return reply.status(201).send(newLeader);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao gerar fichas' });
    }
  }
}