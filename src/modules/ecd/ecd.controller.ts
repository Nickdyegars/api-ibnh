import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema, editionEcdSchema } from './ecd.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

const ecdService = new EcdService();

export class EcdController {

  // Rota Pública: Inscrição de Encontrista
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
      // 👇 ESSA É A LINHA MÁGICA QUE VAI DEDURAR O ERRO 👇
      console.error("🚨 ERRO FATAL NO CADASTRO:", error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, message: "Dados inválidos", errors: error.format() });
      }
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
      const requester = request.user as any;
      const { name, yellowSlots, greenSlots } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });

      const result = await ecdService.createLeader(name, Number(yellowSlots), Number(greenSlots)) as any;

      // 📝 LOG: Geração de líder e seus links de inscrição
      AuditService.log(requester.sub, 'CREATE', 'ECD_LEADER', result?.id, { name, yellowSlots, greenSlots });

      return reply.status(201).send(result);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao gerar fichas' });
    }
  }

  // Rota Pública
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
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };
      const updated = await ecdService.updatePaymentStatus(id, status);

      // 📝 LOG: Atualização financeira do encontrista
      AuditService.log(requester.sub, 'UPDATE_PAYMENT', 'ECD_REGISTRATION', id, { status });

      return reply.send({ success: true, payment_status: updated.payment_status });
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao atualizar pagamento' });
    }
  }

  async updateLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const { name, yellowSlots, greenSlots } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Nome do líder é obrigatório' });

      const updated = await ecdService.updateLeader(id, name, Number(yellowSlots), Number(greenSlots));

      // 📝 LOG: Alteração nos dados ou cotas de vagas do líder
      AuditService.log(requester.sub, 'UPDATE', 'ECD_LEADER', id, { name, yellowSlots, greenSlots });

      return reply.send(updated);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar líder' });
    }
  }

  async deleteLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await ecdService.deleteLeader(id);

      // 📝 LOG: Remoção de líder do ECD
      AuditService.log(requester.sub, 'DELETE', 'ECD_LEADER', id);

      return reply.send({ success: true, message: 'Líder excluído com sucesso' });
    } catch (error: any) {
      if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem fichas atreladas a este líder.' });
      return reply.status(500).send({ error: 'Erro interno ao excluir líder' });
    }
  }

  async deleteRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await ecdService.deleteRegistration(id);

      // 📝 LOG: Exclusão permanente da ficha de inscrição
      AuditService.log(requester.sub, 'DELETE', 'ECD_REGISTRATION', id);

      return reply.send({ success: true, message: 'Ficha excluída!' });
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao excluir a ficha.' });
    }
  }

  async completeRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const { edition_id } = request.body as { edition_id: string };
      if (!edition_id) return reply.status(400).send({ error: 'O ID da edição é obrigatório.' });

      const result = await ecdService.markAsCompleted(id, edition_id);

      // 📝 LOG: Encontrista movido para o histórico da edição concluída
      AuditService.log(requester.sub, 'COMPLETE_REGISTRATION', 'ECD_REGISTRATION', id, { edition_id });

      return reply.send({ success: true, registration: result });
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
      const requester = request.user as any;
      const data = editionEcdSchema.parse(request.body);
      const result = await ecdService.createEdition(data) as any;

      // 📝 LOG: Criação de uma nova edição geral do evento
      AuditService.log(requester.sub, 'CREATE', 'ECD_EDITION', result?.id, data);

      return reply.status(201).send(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: "Dados inválidos", details: error.format() });
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma edição com este nome.' });
      return reply.status(500).send({ error: 'Erro ao criar edição' });
    }
  }

  async updateEdition(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const data = editionEcdSchema.parse(request.body);
      const result = await ecdService.updateEdition(id, data);

      // 📝 LOG: Alteração dos metadados de uma edição ativa/passada
      AuditService.log(requester.sub, 'UPDATE', 'ECD_EDITION', id, data);

      return reply.send(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: "Dados inválidos", details: error.format() });
      if (error.code === 'P2002') return reply.status(400).send({ error: 'Já existe uma edição com este nome.' });
      return reply.status(500).send({ error: 'Erro ao atualizar edição' });
    }
  }

  async deleteEdition(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      await ecdService.deleteEdition(id);

      // 📝 LOG: Deleção de edição do banco
      AuditService.log(requester.sub, 'DELETE', 'ECD_EDITION', id);

      return reply.send({ success: true });
    } catch (error: any) {
      if (error.code === 'P2003') return reply.status(400).send({ error: 'Existem fichas de histórico atreladas a esta edição.' });
      return reply.status(500).send({ error: 'Erro ao excluir edição.' });
    }
  }

  async approveRegistration(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Pega o ID da rota e os dados do body enviados pelo modal
      const { id } = request.params as { id: string };
      const { leader_id, ficha_type } = request.body as { leader_id: string, ficha_type: 'AMARELA' | 'VERDE' };

      if (!leader_id || !ficha_type) {
        return reply.status(400).send({ error: 'Líder e tipo de ficha são obrigatórios.' });
      }

      // Repassa a responsabilidade para o Service
      const updated = await ecdService.approveRegistration(id, leader_id, ficha_type);

      return reply.send({ success: true, registration: updated });
    } catch (error: any) {
      console.error("Erro na aprovação:", error);
      return reply.status(400).send({ error: error.message || 'Erro ao aprovar ficha' });
    }
  }

  async uploadReceiptAdmin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };

      // 👇 Lê se é o comprovante final da URL
      const { type } = request.query as { type?: string };
      const isFinal = type === 'final';

      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });

      const fileObj = {
        filename: data.filename,
        buffer: await data.toBuffer(),
        mimetype: data.mimetype
      };

      // 👇 Passa a informação pro Service
      const result = await ecdService.uploadReceiptAdmin(id, fileObj, isFinal);

      AuditService.log(requester.sub, 'UPLOAD_RECEIPT', 'ECD_REGISTRATION', id);

      return reply.send({ success: true, receipt_photo_url: result.url });
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao salvar comprovante' });
    }
  }


  async transferRegistrationLeader(request: FastifyRequest, reply: FastifyReply) {
    try {
      const requester = request.user as any;
      const { id } = request.params as { id: string };
      const { new_leader_id } = request.body as { new_leader_id: string };

      if (!new_leader_id) {
        return reply.status(400).send({ error: 'O ID do novo líder é obrigatório.' });
      }

      const updated = await ecdService.transferRegistrationLeader(id, new_leader_id);

      // 📝 LOG: Auditoria rastreando o remanejamento da ficha entre líderes
      AuditService.log(requester.sub, 'TRANSFER_LEADER', 'ECD_REGISTRATION', id, { new_leader_id });

      return reply.send({ success: true, registration: updated });
    } catch (error: any) {
      console.error("Erro na transferência de líder:", error);
      return reply.status(400).send({ error: error.message || 'Erro ao transferir titularidade da ficha.' });
    }
  }

  async generateEditionReport(request: any, reply: any) {
    const { id } = request.params;

    try {
      const result = await ecdService.generateEditionReportPdf(id);

      if (!result) {
        return reply.status(404).send({ error: "Edição não encontrada." });
      }

      const { doc, editionName } = result;

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="Relatorio-${editionName.replace(/\s+/g, '-')}.pdf"`);

      return reply.send(doc);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      if (!reply.sent) {
        return reply.status(500).send({ error: "Erro interno ao gerar o relatório." });
      }
    }
  }

  async finalizeEdition(request: any, reply: any) {
    const { id } = request.params;

    try {
      const summary = await ecdService.finishAndArchiveEdition(id);

      return reply.send({
        success: true,
        message: "Edição finalizada com sucesso! Dados migrados, registros limpos e mídias descartadas.",
        summary
      });
    } catch (error: any) {
      console.error("Erro crítico ao finalizar edição:", error);
      if (error.message === "Edição não encontrada.") {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Erro interno ao processar encerramento da edição." });
    }
  }

  async getEditionHistory(request: any, reply: any) {
    try {
      const history = await ecdService.getEditionHistory();
      return reply.send(history);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      return reply.status(500).send({ error: "Erro interno ao buscar o histórico." });
    }
  }
  async generateBatchPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { amountYellow = 0, amountGreen = 0, editionId } = request.body as any;

      if (!editionId) {
        return reply.status(400).send({ error: "É necessário informar o ID da edição atual." });
      }

      if (amountYellow === 0 && amountGreen === 0) {
        return reply.status(400).send({ error: "Informe a quantidade de fichas." });
      }

      // Chama o serviço que cria no banco e desenha o PDF
      const pdfDocument = await ecdService.generateTokensAndPdf(amountYellow, amountGreen, editionId);

      // Configura os cabeçalhos para forçar o download no navegador
      reply.type('application/pdf');
      reply.header('Content-Disposition', `attachment; filename=fichas-ecd-${Date.now()}.pdf`);

      return reply.send(pdfDocument);
    } catch (error) {
      console.error("Erro ao gerar PDF de lotes:", error);
      return reply.status(500).send({ error: "Erro interno ao processar a geração de fichas." });
    }
  }

  async exportLeadersPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { editionId } = request.query as { editionId: string };
      if (!editionId) return reply.status(400).send({ error: "ID da edição é obrigatório." });

      const pdfDocument = await ecdService.generateLeadersCodesPdf(editionId);

      reply.type('application/pdf');
      reply.header('Content-Disposition', `attachment; filename=codigos-lideres-${Date.now()}.pdf`);
      return reply.send(pdfDocument);
    } catch (error) {
      return reply.status(500).send({ error: "Erro ao gerar PDF de códigos." });
    }
  }

  async validatePinPublic(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { pin, token } = request.body as { pin: string, token: string };
      if (!pin || !token) return reply.status(400).send({ error: "PIN e Token são obrigatórios." });

      const result = await ecdService.validatePin(pin, token);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async reprintBatchPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { editionId } = request.query as { editionId: string };
      if (!editionId) return reply.status(400).send({ error: "O ID da edição é obrigatório." });

      const pdfDocument = await ecdService.reprintTokensPdf(editionId);

      reply.type('application/pdf');
      reply.header('Content-Disposition', `attachment; filename=fichas-reimpressas-${Date.now()}.pdf`);
      return reply.send(pdfDocument);
    } catch (error: any) {
      console.error("Erro na reimpressão:", error);
      return reply.status(400).send({ error: error.message || "Erro ao reimprimir fichas." });
    }
  }

  async exportHistoryPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { editionId } = request.query as { editionId: string };
      if (!editionId) return reply.status(400).send({ error: "O ID da edição é obrigatório." });

      const pdfDocument = await ecdService.generateHistoryPdf(editionId);

      reply.type('application/pdf');
      reply.header('Content-Disposition', `attachment; filename=historico-ecd-${editionId}.pdf`);
      return reply.send(pdfDocument);
    } catch (error: any) {
      console.error("Erro ao exportar histórico:", error);
      return reply.status(400).send({ error: error.message || "Erro ao gerar PDF do histórico." });
    }
  }

  async exportEncontristasPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Chama o serviço, que agora descobre a edição atual sozinho!
      const doc = await ecdService.generateEncontristasPdf();

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="encontristas_edicao.pdf"`);

      return reply.send(doc);

    } catch (error: any) {
      console.error('[Export Encontristas PDF Error]', error);
      return reply.status(400).send({ success: false, message: error.message });
    }
  }

  // ==========================================
  // BUSCA DE FICHA PELO NÚMERO IMPRESSO
  // ==========================================
  async searchRegistrationByShortCode(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { shortCode } = request.query as { shortCode: string };

      if (!shortCode) {
        return reply.status(400).send({ error: "O ID da ficha é obrigatório." });
      }

      const result = await ecdService.findRegistrationByShortCode(shortCode);
      return reply.send(result);
    } catch (error: any) {
      console.error('[Search Ficha Error]', error);
      return reply.status(400).send({ error: error.message });
    }
  }
  async searchRegistrationByTokenNumber(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { editionId, tokenType, tokenNumber } = request.query as any;
      if (!editionId || !tokenType || !tokenNumber) return reply.status(400).send({ error: "Faltam parâmetros." });

      const result = await ecdService.findRegistrationByTokenNumber(editionId, tokenType, parseInt(tokenNumber, 10));
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async exportPendentesPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { editionId } = request.query as any;
      const pdfDoc = await ecdService.generatePendentesPdf(editionId);

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', 'attachment; filename="fila-de-espera.pdf"');

      return reply.send(pdfDoc);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  async exportEncontristasListagemPdf(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pdfDoc = await ecdService.generateEncontristasListagemPdf();
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', 'attachment; filename="lista-chamada-encontristas.pdf"');
      return reply.send(pdfDoc);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }
}