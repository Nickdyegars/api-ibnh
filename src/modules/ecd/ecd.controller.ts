import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EcdService } from './ecd.service.js';
import { registerEcdSchema, editionEcdSchema } from './ecd.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { prisma } from '../../shared/database/prisma.js';
import { deleteImage } from '../../shared/storage/minio.js'; // Ajuste o caminho das pastas se necessário

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

      // 1. Busca Trabalhadores
      const workers = await prisma.ecdWorkerRegistration.findMany({
        where: { edition_id: id, status: 'APROVADO' },
        select: {
          full_name: true,
          gender: true,
          age: true,
          phone: true,
          area: { select: { name: true } },
          leader: { select: { name: true } }
        },
        orderBy: { area: { name: 'asc' } }
      });

      // 2. Busca Encontristas ativos
      const attendees = await prisma.ecdRegistration.findMany({
        where: { edition_id: id, status: 'ATIVO' },
        select: {
          full_name: true,
          gender: true,
          age: true,
          phone: true,
          in_cell: true,
          cell_leader_name: true,
          invited_by: true,
          leader: { select: { name: true } }
        },
        orderBy: { full_name: 'asc' }
      });

      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: 40, left: 40, right: 40, bottom: 10 }
      });

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="Relatorio-${edition.name.replace(/\s+/g, '-')}.pdf"`);

      reply.send(doc);

      // HELPER DE TABELA
      const drawTableRow = (c1: string, c2: string, c3: string, c4: string, isHeader = false) => {
        if (doc.y > 750) {
          doc.addPage();
          doc.y = 40;
        }

        const y = doc.y;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 10 : 9);
        doc.fillColor(isHeader ? '#1e3a8a' : '#334155');

        doc.text(c1, 40, y, { width: 175, height: 15, lineBreak: false, ellipsis: true });
        doc.text(c2, 220, y, { width: 75, height: 15, lineBreak: false, ellipsis: true });
        doc.text(c3, 300, y, { width: 85, height: 15, lineBreak: false, ellipsis: true });
        doc.text(c4, 390, y, { width: 165, height: 15, lineBreak: false, ellipsis: true });

        doc.moveTo(40, y + 14).lineTo(555, y + 14).strokeColor(isHeader ? '#cbd5e1' : '#f1f5f9').lineWidth(1).stroke();
        doc.y = y + 20;
      };

      // LAYOUT CABEÇALHO
      doc.rect(0, 0, doc.page.width, 15).fill('#1e3a8a');
      doc.moveDown(1.5);

      doc.fillColor('#1e293b').fontSize(22).font('Helvetica-Bold')
        .text('RELATÓRIO DE ENCERRAMENTO', { align: 'center', characterSpacing: 1 });

      doc.fontSize(14).font('Helvetica').fillColor('#475569')
        .text(edition.name.toUpperCase(), { align: 'center' });

      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.moveDown(1.5);

      // CARD RESUMO
      const startY = doc.y;
      doc.rect(40, startY, doc.page.width - 80, 55).fill('#f8fafc');
      doc.rect(40, startY, doc.page.width - 80, 55).strokeColor('#cbd5e1').stroke();

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('RESUMO DO EVENTO', 55, startY + 10);
      doc.font('Helvetica').fontSize(10).fillColor('#475569');
      doc.text(`Total de Voluntários / Equipe: `, 55, startY + 28);
      doc.font('Helvetica-Bold').text(`${workers.length}`, 210, startY + 28);

      doc.font('Helvetica').text(`Total de Encontristas: `, 300, startY + 28);
      doc.font('Helvetica-Bold').text(`${attendees.length}`, 410, startY + 28);

      doc.x = 40;
      doc.y = startY + 75;

      // SEÇÃO TRABALHADORES
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('EQUIPE E TRABALHADORES ALOCADOS');
      doc.moveDown(0.8);

      if (workers.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum trabalhador aprovado nesta edição.');
        doc.moveDown(2);
      } else {
        let currentArea = '';
        workers.forEach((worker) => {
          const areaName = worker.area?.name || 'Sem Área';
          if (areaName !== currentArea) {
            doc.moveDown(0.5);
            doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(11).text(`■ ÁREA: ${areaName.toUpperCase()}`);
            doc.moveDown(0.3);
            drawTableRow('Nome do Voluntário', 'Perfil', 'Contato', 'Líder Direto', true);
            currentArea = areaName;
          }
          const leaderName = worker.leader?.name || '-';
          const phone = worker.phone || '-';
          const profile = `${worker.age} anos | ${worker.gender === 'M' ? 'Masc' : 'Fem'}`;
          drawTableRow(`• ${worker.full_name}`, profile, phone, leaderName);
        });
      }

      doc.moveDown(2);

      // 👇 RESET DO CURSOR PARA EVITAR O TITULO QUEBRADO NA DIREITA 👇
      doc.x = 40;
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(14).text('LISTA FINAL DE ENCONTRISTAS', { width: 515 });
      doc.moveDown(0.8);

      if (attendees.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('Nenhum encontrista encontrado ou ativo nesta edição.');
      } else {
        drawTableRow('Nome do Encontrista', 'Perfil', 'Contato', 'Origem (Célula / Convite)', true);

        attendees.forEach((attendee, index) => {
          const phone = attendee.phone || '-';
          const profile = `${attendee.age} anos | ${attendee.gender === 'M' ? 'Masc' : 'Fem'}`;

          let origin = '-';
          if (attendee.cell_leader_name && attendee.cell_leader_name !== 'Origem Desconhecida') {
            origin = `Célula: ${attendee.cell_leader_name}`;
          } else if (attendee.leader?.name) {
            origin = `Líder: ${attendee.leader.name}`;
          } else if (attendee.invited_by) {
            origin = `Convite: ${attendee.invited_by}`;
          }

          drawTableRow(`${index + 1}. ${attendee.full_name}`, profile, phone, origin);
        });
      }

      // RODAPÉ
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#94a3b8').text(
          `Gerado em ${new Date().toLocaleDateString('pt-BR')} | IBNH Painel - Página ${i + 1} de ${totalPages}`,
          40,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      doc.flushPages();
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
    const { id } = request.params;

    try {
      const edition = await prisma.ecdEdition.findUnique({
        where: { id }
      });

      if (!edition) return reply.status(404).send({ error: "Edição não encontrada." });

      // 1. Busca os Trabalhadores (Agora incluindo as fotos)
      const workers = await prisma.ecdWorkerRegistration.findMany({
        where: { edition_id: id },
        select: {
          full_name: true,
          phone: true,
          area: { select: { name: true } },
          leader: { select: { name: true } },
          profile_photo_url: true,
          status: true
        }
      });

      // 2. Busca os Encontristas (Agora incluindo as fotos)
      const attendees = await prisma.ecdRegistration.findMany({
        where: { edition_id: id },
        select: {
          full_name: true,
          gender: true,
          age: true,
          phone: true,
          in_cell: true,
          cell_leader_name: true,
          invited_by: true,
          leader: { select: { name: true } },
          profile_photo_url: true,
          receipt_photo_url: true,
          status: true
        }
      });

      const areaLeaders = await prisma.ecdWorkerLeader.findMany({
        where: { edition_id: id },
        select: {
          name: true,
          area: { select: { name: true } }
        }
      });

      const cellLeaders = await prisma.ecdLeader.findMany({
        where: { editionId: id },
        include: { cell: true } // Isso traz os dados da célula amarrada!
      });

      // Filtra apenas os "ATIVOS" / "APROVADOS" para salvar no JSON Histórico
      const approvedWorkers = workers.filter(w => w.status === 'APROVADO');
      const activeAttendees = attendees.filter(a => a.status === 'ATIVO');

      const workersSnapshot = approvedWorkers.map(w => ({
        full_name: w.full_name,
        phone: w.phone || 'Sem número',
        area_name: w.area?.name || 'Sem Área',
        leader_name: w.leader?.name || 'N/A'
      }));

      const attendeesSnapshot = activeAttendees.map(a => {
        let origin = 'Não informado';

        // Lógica robusta em cascata
        if (a.cell_leader_name && a.cell_leader_name !== 'Origem Desconhecida') {
          origin = `Célula: ${a.cell_leader_name}`;
        } else if (a.leader?.name) {
          origin = `Líder: ${a.leader.name}`;
        } else if (a.invited_by) {
          origin = `Convite: ${a.invited_by}`;
        }

        return {
          full_name: a.full_name,
          gender: a.gender,
          age: a.age,
          phone: a.phone || 'Sem número',
          origin: origin
        };
      });

      const areaLeadersSnapshot = areaLeaders.map(al => {
        // Conta quantos voluntários aprovados têm este líder como líder direto
        const countLiderados = approvedWorkers.filter(w => w.leader?.name === al.name).length;

        return {
          name: al.name,
          area_name: al.area?.name || 'Sem Área',
          workers_count: countLiderados
        };
      });

      const leadersSlotsSnapshot = cellLeaders.map(l => {
        // Lógica para descobrir o nome real do líder
        let leaderName = l.name;
        if (l.cell) {
          leaderName = `${l.cell.leader} (${l.cell.name})`;
        }

        return {
          name: leaderName || 'Líder Não Identificado',
          total_yellow: l.totalYellowSlots || 0,
          used_yellow: l.usedYellowSlots || 0,
          total_green: l.totalGreenSlots || 0,
          used_green: l.usedGreenSlots || 0
        };
      });

      // 3. SEPARA TODAS AS URLs DE FOTOS PARA DELEÇÃO
      const filesToDelete: string[] = [];

      workers.forEach(w => {
        if (w.profile_photo_url) filesToDelete.push(w.profile_photo_url);
      });

      attendees.forEach(a => {
        if (a.profile_photo_url) filesToDelete.push(a.profile_photo_url);
        if (a.receipt_photo_url) filesToDelete.push(a.receipt_photo_url);
      });

      // 4. Executa a Transação no Banco de Dados
      await prisma.$transaction(async (tx) => {

        // A) Salva tudo no Histórico
        await tx.ecdEditionHistory.upsert({
          where: { edition_id: id },
          create: {
            edition_id: id,
            edition_name: edition.name,
            total_workers: workersSnapshot.length,
            total_attendees: attendeesSnapshot.length,
            workers_data: workersSnapshot,
            attendees_data: attendeesSnapshot,
            area_leaders_data: areaLeadersSnapshot,
            leaders_slots_data: leadersSlotsSnapshot
          },
          update: {
            edition_name: edition.name,
            total_workers: workersSnapshot.length,
            total_attendees: attendeesSnapshot.length,
            workers_data: workersSnapshot,
            attendees_data: attendeesSnapshot,
            area_leaders_data: areaLeadersSnapshot,
            leaders_slots_data: leadersSlotsSnapshot
          }
        });

        // B) Limpeza dos Links (Tokens)
        const editionLeaders = await tx.ecdLeader.findMany({
          where: { editionId: id },
          select: { id: true }
        });
        const leaderIds = editionLeaders.map(l => l.id);

        if (leaderIds.length > 0) {
          await tx.ecdToken.deleteMany({
            where: { leaderId: { in: leaderIds } }
          });
        }

        // C) Limpeza das Fichas e Registros
        await tx.ecdRegistration.deleteMany({ where: { edition_id: id } });
        await tx.ecdWorkerRegistration.deleteMany({ where: { edition_id: id } });

        // D) Limpeza das Cotas dos Líderes
        await tx.ecdLeader.deleteMany({ where: { editionId: id } });
        await tx.ecdWorkerLeader.deleteMany({ where: { edition_id: id } });

        // E) Desativa a Edição
        await tx.ecdEdition.update({ where: { id }, data: { is_active: false } });

        // 👇 AQUI ESTÁ A CORREÇÃO DE TEMPO MÁXIMO 👇
      }, {
        maxWait: 10000, // 10 segundos de espera máxima para iniciar
        timeout: 30000  // 30 segundos de limite para executar tudo
      });

      // 5. TRITURAÇÃO FÍSICA DOS ARQUIVOS NO MINIO (Assíncrono)
      if (filesToDelete.length > 0) {
        Promise.allSettled(filesToDelete.map(url => deleteImage(url)))
          .then(() => console.log(`[STORAGE] Limpeza concluída: ${filesToDelete.length} imagens enfileiradas para exclusão no MinIO.`))
          .catch(err => console.error("[STORAGE] Erro na fila de limpeza do MinIO:", err));
      }

      return reply.send({
        success: true,
        message: "Edição finalizada com sucesso! Dados migrados, registros limpos e mídias descartadas.",
        summary: { workers_saved: workersSnapshot.length, attendees_saved: attendeesSnapshot.length }
      });

    } catch (error) {
      console.error("Erro crítico ao finalizar edição:", error);
      return reply.status(500).send({ error: "Erro interno ao processar encerramento da edição." });
    }
  }
  
  async getEditionHistory(request: any, reply: any) {
    try {
      const history = await prisma.ecdEditionHistory.findMany({
        orderBy: { created_at: 'desc' }
      });

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
}