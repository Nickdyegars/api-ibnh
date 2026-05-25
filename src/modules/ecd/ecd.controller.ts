// src/modules/ecd/ecd.controller.ts
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema } from './ecd.schemas.js';

const ecdService = new EcdService();

export class EcdController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parts = request.parts();
      let bodyData: any = {};
      let files: any = {};

      // 👇 LISTA VIP DE ARQUIVOS PERMITIDOS (Filtro de Segurança) 👇
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];

      for await (const part of parts) {
        if (part.type === 'file') {

          // Trava de Segurança 1: Extensão/Formato do Arquivo
          if (!allowedMimeTypes.includes(part.mimetype)) {
            return reply.status(400).send({
              success: false,
              message: `Formato de arquivo não permitido: ${part.filename}. Envie apenas JPG, PNG ou PDF.`
            });
          }

          const buffer = await part.toBuffer();

          // Trava de Segurança 2: Arquivo vazio
          if (buffer.length > 0) {
            files[part.fieldname] = {
              filename: part.filename,
              buffer: buffer,
              mimetype: part.mimetype
            };
          }
        } else {
          bodyData[part.fieldname] = part.value;
        }
      }

      // Validação do Zod
      const data = registerEcdSchema.parse(bodyData);

      // Envia os dados limpos e seguros para o Service
      const registration = await ecdService.createRegistration(data, files);

      return reply.status(201).send({
        success: true,
        message: "Inscrição realizada com sucesso!",
        registrationId: registration.id
      });

    } catch (error: unknown) {
      // Erro de Validação do Zod
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: "Dados inválidos no formulário",
          errors: error.format()
        });
      }

      // Erros customizados do nosso serviço
      if (error instanceof Error) {
        if (error.message === "TOKEN_NOT_FOUND") {
          return reply.status(404).send({ success: false, message: "Link de inscrição inválido ou não encontrado." });
        }
        if (error.message === "TOKEN_ALREADY_USED") {
          return reply.status(400).send({ success: false, message: "Este link já foi utilizado para uma inscrição." });
        }
      }

      console.error("🔥 Erro interno no ECD:", error);
      return reply.status(500).send({ success: false, message: "Erro interno no servidor." });
    }
  }

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
      const { name, yellowSlots, greenSlots } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });

      const newLeader = await ecdService.createLeaderWithTokens(name, Number(yellowSlots), Number(greenSlots));
      return reply.status(201).send(newLeader);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao gerar fichas' });
    }
  }

  async validateToken(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
    try {
      const { token } = request.params;
      const data = await ecdService.validateToken(token);
      return reply.send(data);
    } catch (error: any) {
      if (error.message === "TOKEN_NOT_FOUND") {
        return reply.status(404).send({ success: false, message: "Link inválido ou não encontrado." });
      }
      if (error.message === "TOKEN_ALREADY_USED") {
        return reply.status(400).send({ success: false, message: "Este link já foi utilizado." });
      }
      return reply.status(500).send({ success: false, message: "Erro ao validar o link." });
    }
  }

  async updatePayment(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Fazemos o cast (as) aqui dentro para o TypeScript não brigar na rota
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      const updatedRegistration = await ecdService.updatePaymentStatus(id, status);
      return reply.send({ success: true, payment_status: updatedRegistration.payment_status });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao atualizar status de pagamento' });
    }
  }

  async updateLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Afirmamos os tipos internamente
      const { id } = request.params as { id: string };
      const { name, yellowSlots, greenSlots } = request.body as any; // 'any' resolve o erro do body

      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });

      const updatedLeader = await ecdService.updateLeader(id, name, Number(yellowSlots), Number(greenSlots));
      return reply.send(updatedLeader);

    } catch (error: any) {
      console.error(error);
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar líder' });
    }
  }

  async deleteLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      await ecdService.deleteLeader(id);
      return reply.send({ success: true, message: 'Líder excluído com sucesso' });

    } catch (error: any) {
      console.error(error);

      if (error.code === 'P2003') {
        return reply.status(400).send({ error: 'Não é possível excluir um líder que já possui fichas de membros cadastradas.' });
      }

      return reply.status(500).send({ error: 'Erro interno ao excluir líder' });
    }
  }

  async deleteRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      await ecdService.deleteRegistration(id);

      return reply.send({ success: true, message: 'Ficha excluída e link devolvido ao líder!' });
    } catch (error: any) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao excluir a ficha.' });
    }
  }
}