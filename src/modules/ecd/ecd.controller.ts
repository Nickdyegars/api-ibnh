import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema, editionEcdSchema } from './ecd.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { prisma } from '../../shared/database/prisma.js';

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

      const result = await ecdService.createLeaderWithTokens(name, Number(yellowSlots), Number(greenSlots)) as any;

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

      // Recebe o arquivo do painel
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
      }

      // Prepara o objeto igual ao que o seu Service já espera
      const fileObj = {
        filename: data.filename,
        buffer: await data.toBuffer(),
        mimetype: data.mimetype
      };

      // Chama a regra de negócio no Service
      const result = await ecdService.uploadReceiptAdmin(id, fileObj);

      // 📝 LOG: Admin anexou um comprovante
      AuditService.log(requester.sub, 'UPLOAD_RECEIPT', 'ECD_REGISTRATION', id);

      return reply.send({ success: true, receipt_photo_url: result.receipt_photo_url });
    } catch (error: any) {
      console.error("Erro no upload de comprovante pelo admin:", error);
      return reply.status(500).send({ error: error.message || 'Erro interno ao salvar comprovante' });
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
      const edition = await prisma.ecdEdition.findUnique({
        where: { id }
      });

      if (!edition) {
        return reply.status(404).send({ error: "Edição não encontrada." });
      }

      // Busca Trabalhadores Aprovados
      const workers = await prisma.ecdWorkerRegistration.findMany({
        where: {
          edition_id: id,
          status: 'APROVADO'
        },
        select: {
          full_name: true,
          gender: true,
          age: true,
          area: { select: { name: true } },
          leader: { select: { name: true } }
        },
        orderBy: { area: { name: 'asc' } }
      });

      // 🔍 CORREÇÃO AQUI: Mudamos de 'APROVADO' para 'ATIVO' (conforme o padrão do seu model)
      const attendees = await prisma.ecdRegistration.findMany({
        where: {
          edition_id: id,
          status: 'ATIVO' // 👈 Bate com o @default("ATIVO") do seu schema
        },
        select: {
          full_name: true,
          gender: true,
          age: true
        },
        orderBy: { full_name: 'asc' }
      });

      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="Relatorio-${edition.name.replace(/\s+/g, '-')}.pdf"`);

      reply.send(doc);

      // ==========================================
      // DESIGN & LAYOUT PROFISSIONAL
      // ==========================================

      // Barra Decorativa Superior (Tom Azul Igreja / Corporativo)
      doc.rect(0, 0, doc.page.width, 15).fill('#1e3a8a');
      doc.moveDown(1.5);

      // Cabeçalho Principal
      doc.fillColor('#1e293b')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('RELATÓRIO DE ENCERRAMENTO', { align: 'center', characterSpacing: 1 });

      doc.fontSize(14)
        .font('Helvetica')
        .fillColor('#475569')
        .text(edition.name.toUpperCase(), { align: 'center' });

      // Linha divisória fina
      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.moveDown(1.5);

      // Card de Resumo Geral
      const startY = doc.y;
      doc.rect(40, startY, doc.page.width - 80, 55).fill('#f8fafc');
      doc.rect(40, startY, doc.page.width - 80, 55).strokeColor('#cbd5e1').stroke();

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('RESUMO DO EVENTO', 55, startY + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#475569');
      doc.text(`Total de Voluntários / Equipe: `, 55, startY + 28);
      doc.font('Helvetica-Bold').text(`${workers.length}`, 210, startY + 28);

      doc.font('Helvetica').text(`Total de Encontristas: `, 300, startY + 28);
      doc.font('Helvetica-Bold').text(`${attendees.length}`, 410, startY + 28);

      // Restaura posicionamento abaixo do card
      doc.x = 40;
      doc.y = startY + 75;

      // ==========================================
      // SEÇÃO: TRABALHADORES
      // ==========================================
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('EQUIPE E TRABALHADORES ALOCADOS');
      doc.moveDown(0.5);

      if (workers.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum trabalhador aprovado nesta edição.');
        doc.moveDown(1);
      } else {
        let currentArea = '';
        workers.forEach((worker) => {
          const areaName = worker.area?.name || 'Sem Área';

          if (areaName !== currentArea) {
            doc.moveDown(0.8);
            doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(11).text(`■ ÁREA: ${areaName.toUpperCase()}`);
            doc.fillColor('#334155').font('Helvetica').fontSize(10);
            currentArea = areaName;
          }

          const leaderText = worker.leader?.name ? ` | Líder: ${worker.leader.name}` : '';
          doc.text(`   • ${worker.full_name} (${worker.age} anos) | Sexo: ${worker.gender}${leaderText}`);
        });
      }

      doc.moveDown(2.5);

      // ==========================================
      // SEÇÃO: ENCONTRISTAS
      // ==========================================
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('LISTA FINAL DE ENCONTRISTAS');
      doc.moveDown(0.5);

      if (attendees.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum encontrista encontrado ou ativo nesta edição.');
      } else {
        doc.fillColor('#334155').font('Helvetica').fontSize(10);
        attendees.forEach((attendee, index) => {
          doc.text(`   ${index + 1}. ${attendee.full_name} (${attendee.age} anos) | Sexo: ${attendee.gender}`);
        });
      }

      // Rodapé Simples
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#94a3b8').text(
          `Gerado em ${new Date().toLocaleDateString('pt-BR')} | IBNH Painel`,
          40,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      doc.end();
      return reply;

    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      if (!reply.sent) {
        return reply.status(500).send({ error: "Erro interno ao gerar o relatório." });
      }
    }
  }

  async finalizeEdition(request: any, reply: any) {
        const { id } = request.params; // ID da edição que será finalizada

        try {
            // Verifica se a edição existe
            const edition = await prisma.ecdEdition.findUnique({
                where: { id }
            });

            if (!edition) {
                return reply.status(404).send({ error: "Edição não encontrada." });
            }

            // 1. DELETA TODOS OS ENCONTRISTAS DA EDIÇÃO
            const deletedAttendees = await prisma.ecdRegistration.deleteMany({
                where: { edition_id: id }
            });

            // 2. DELETA TODOS OS TRABALHADORES DA EDIÇÃO
            const deletedWorkers = await prisma.ecdWorkerRegistration.deleteMany({
                where: { edition_id: id }
            });

            // ⚠️ Futuramente: Aqui entrará a lógica de apagar as fotos do MinIO
            // e salvar os números no Histórico Consolidado.

            return reply.send({ 
                message: "Edição finalizada e limpa com sucesso.",
                details: {
                    encontristasRemovidos: deletedAttendees.count,
                    trabalhadoresRemovidos: deletedWorkers.count
                }
            });

        } catch (error) {
            console.error("Erro ao finalizar edição:", error);
            return reply.status(500).send({ error: "Erro interno ao limpar os dados da edição." });
        }
    }
}