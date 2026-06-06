import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema, editionEcdSchema } from './ecd.schemas.js';

const ecdService = new EcdService();

export class EcdController {

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parts = request.parts();
      let bodyData: any = {};
      let files: any = {};
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];

      for await (const part of parts) {
        if (part.type === 'file') {
          if (!allowedMimeTypes.includes(part.mimetype)) {
            return reply.status(400).send({ success: false, message: `Formato de arquivo não permitido: ${part.filename}. Envie apenas JPG, PNG ou PDF.` });
          }
          const buffer = await part.toBuffer();
          if (buffer.length > 0) files[part.fieldname] = { filename: part.filename, buffer, mimetype: part.mimetype };
        } else {
          bodyData[part.fieldname] = part.value;
        }
      }

      const data = registerEcdSchema.parse(bodyData);
      const registration = await ecdService.createRegistration(data, files);
      return reply.status(201).send({ success: true, message: "Inscrição realizada com sucesso!", registrationId: registration.id });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
      if (error instanceof Error) {
        if (error.message === "TOKEN_NOT_FOUND") return reply.status(404).send({ success: false, message: "Link inválido." });
        if (error.message === "TOKEN_ALREADY_USED") return reply.status(400).send({ success: false, message: "Este link já foi utilizado." });
      }
      return reply.status(500).send({ success: false, message: "Erro interno no servidor." });
    }
  }

  async getLeaders(request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send(await ecdService.getLeaders());
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar líderes' });
    }
  }

  async getRegistrations(request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send(await ecdService.getRegistrations());
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar inscritos' });
    }
  }

  async createLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, yellowSlots, greenSlots } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });
      return reply.status(201).send(await ecdService.createLeaderWithTokens(name, Number(yellowSlots), Number(greenSlots)));
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao gerar fichas' });
    }
  }

  async validateToken(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
    try {
      return reply.send(await ecdService.validateToken(request.params.token));
    } catch (error: any) {
      if (error.message === "TOKEN_NOT_FOUND") return reply.status(404).send({ success: false, message: "Link inválido." });
      if (error.message === "TOKEN_ALREADY_USED") return reply.status(400).send({ success: false, message: "Este link já foi utilizado." });
      return reply.status(500).send({ success: false, message: "Erro ao validar o link." });
    }
  }

  async updatePayment(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };
      const updated = await ecdService.updatePaymentStatus(id, status);
      return reply.send({ success: true, payment_status: updated.payment_status });
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao atualizar pagamento' });
    }
  }

  async updateLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { name, yellowSlots, greenSlots } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });
      return reply.send(await ecdService.updateLeader(id, name, Number(yellowSlots), Number(greenSlots)));
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar líder' });
    }
  }

  async deleteLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      await ecdService.deleteLeader((request.params as any).id);
      return reply.send({ success: true, message: 'Líder excluído com sucesso' });
    } catch (error: any) {
      if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem fichas atreladas a este líder.' });
      return reply.status(500).send({ error: 'Erro interno ao excluir líder' });
    }
  }

  async deleteRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      await ecdService.deleteRegistration((request.params as any).id);
      return reply.send({ success: true, message: 'Ficha excluída!' });
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao excluir a ficha.' });
    }
  }

  async completeRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { edition_id } = request.body as { edition_id: string };
      if (!edition_id) return reply.status(400).send({ error: 'O ID da edição é obrigatório.' });
      return reply.send({ success: true, registration: await ecdService.markAsCompleted(id, edition_id) });
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao mover ficha para o histórico.' });
    }
  }

  // ================= EDIÇÕES ================= //
  async getEditions(request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send(await ecdService.getEditions());
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar edições' });
    }
  }

  async createEdition(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = editionEcdSchema.parse(request.body);
      return reply.status(201).send(await ecdService.createEdition(data));
    } catch (error: any) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: "Dados inválidos", details: error.format() });
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma edição com este nome.' });
      return reply.status(500).send({ error: 'Erro ao criar edição' });
    }
  }

  async updateEdition(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const data = editionEcdSchema.parse(request.body);
      return reply.send(await ecdService.updateEdition(id, data));
    } catch (error: any) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: "Dados inválidos", details: error.format() });
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma edição com este nome.' });
      return reply.status(500).send({ error: 'Erro ao atualizar edição' });
    }
  }

  async deleteEdition(request: FastifyRequest, reply: FastifyReply) {
    try {
      await ecdService.deleteEdition((request.params as any).id);
      return reply.send({ success: true });
    } catch (error: any) {
      if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem fichas de histórico atreladas a esta edição.' });
      return reply.status(500).send({ error: 'Erro ao excluir edição.' });
    }
  }
}