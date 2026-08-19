import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage, deleteImage } from '../../shared/storage/minio.js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';

function generateShortCode(length = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatEventPeriod(startDate?: Date | null, endDate?: Date | null): string {
  if (!startDate || !endDate) return "Data a definir";

  // Usamos UTC para evitar que o fuso horário atrase o dia impresso
  const s = new Date(startDate);
  const e = new Date(endDate);

  const formatDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'UTC' });
  const formatMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
  const formatYear = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: 'UTC' });

  const sDay = formatDay.format(s);
  const sMonth = formatMonth.format(s);
  const sYear = formatYear.format(s);

  const eDay = formatDay.format(e);
  const eMonth = formatMonth.format(e);
  const eYear = formatYear.format(e);

  // Se for no mesmo mês e ano (Ex: 21 a 23 de Novembro de 2026)
  if (sMonth === eMonth && sYear === eYear) {
    return `${sDay} a ${eDay} de ${sMonth} de ${sYear}`;
  }
  // Se for em meses diferentes (Ex: 31 de Outubro a 02 de Novembro de 2026)
  else if (sYear === eYear) {
    return `${sDay} de ${sMonth} a ${eDay} de ${eMonth} de ${sYear}`;
  }
  // Se cruzar o ano (Ex: 30 de Dezembro de 2026 a 01 de Janeiro de 2027)
  return `${sDay} de ${sMonth} de ${sYear} a ${eDay} de ${eMonth} de ${eYear}`;
}

export class EcdService {

  // ==========================================
  // INSCRIÇÃO E VALIDAÇÃO DE TOKENS (LINKS)
  // ==========================================

  async validateToken(tokenCode: string) {
    const tokenRecord = await prisma.ecdToken.findUnique({
      where: { id: tokenCode },
      include: { edition: true }
    });

    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    return {
      isValid: true,
      tokenType: tokenRecord.tokenType,
      paymentLink: tokenRecord.edition?.encontristaPaymentLink ?? undefined,
      priceTotal: tokenRecord.edition?.priceTotal ?? 100.00,
      priceSignal: tokenRecord.edition?.priceSignal ?? 50.00,

      // 👇 ADICIONE ESTAS DUAS LINHAS 👇
      startDate: tokenRecord.edition?.startDate ?? null,
      endDate: tokenRecord.edition?.endDate ?? null,
    };
  }
  async createRegistration(data: any, files: any) {
    // 1. Busca a Ficha e vê se é válida
    const tokenRecord = await prisma.ecdToken.findUnique({ where: { id: data.token } });
    if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
    if (tokenRecord.isUsed) throw new Error("TOKEN_ALREADY_USED");

    // 2. Busca o Líder pelo PIN que o usuário digitou
    const leader = await prisma.ecdLeader.findUnique({
      where: { inviteCode: data.inviteCode.toUpperCase() },
      include: { cell: true }
    });

    if (!leader) throw new Error("Código de líder inválido. Verifique o PIN fornecido.");
    if (leader.editionId !== tokenRecord.editionId) throw new Error("Este código de líder pertence a outra edição do evento.");

    // 3. Checa as Vagas do LÍDER (A trava de segurança que conversamos)
    // const availableSlots = tokenRecord.tokenType === 'AMARELA'
    //   ? leader.totalYellowSlots - leader.usedYellowSlots
    //   : leader.totalGreenSlots - leader.usedGreenSlots;

    // if (availableSlots <= 0) {
    //   throw new Error(`O líder/origem (${leader.inviteCode}) não possui mais vagas para fichas ${tokenRecord.tokenType}s.`);
    // }

    // 4. Salva Imagens
    let profileUrl = null, receiptUrl = null;
    if (files.profilePhoto) profileUrl = await uploadImage(files.profilePhoto.filename, files.profilePhoto.buffer, files.profilePhoto.mimetype, 'ecd/profiles');
    if (files.receiptPhoto) receiptUrl = await uploadImage(files.receiptPhoto.filename, files.receiptPhoto.buffer, files.receiptPhoto.mimetype, 'ecd/receipts');

    // 5. Salva Tudo em Cascata
    return await prisma.$transaction(async (tx) => {
      // A) Cria Inscrição
      const registration = await tx.ecdRegistration.create({
        data: {
          full_name: data.fullName,
          nickname: data.nickname ?? null,
          phone: data.phone,
          gender: data.gender,
          age: data.age,
          address: data.address,
          is_married: data.isMarried,
          spouse_name: data.spouseName ?? null,
          relative_going: data.relativeGoing,
          relative_degree: data.relativeDegree ?? null,
          has_illness: data.hasIllness,
          illness_desc: data.illnessDesc ?? null,
          takes_medication: data.takesMedication,
          medication_desc: data.medicationDesc ?? null,
          dietary_restriction: data.dietaryRestriction,
          dietary_desc: data.dietaryDesc ?? null,
          shirt_size: data.shirtSize ?? null,
          emergency_contact: data.emergencyContact,
          emergency_phone: data.emergencyPhone,
          in_cell: data.inCell,

          cell_leader_name: leader.cell?.name ?? leader.name ?? 'Origem Desconhecida',
          invited_by: data.invitedBy ?? null,
          profile_photo_url: profileUrl,
          receipt_photo_url: receiptUrl,
          spiritual_status: data.spiritualStatus ?? null,

          status: 'PENDENTE',
          ficha_type: tokenRecord.tokenType,
          leader_id: leader.id,
          token_id: tokenRecord.id,
          edition_id: leader.editionId,

          lgpd_consent: data.lgpdConsent,
          lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
          lgpd_terms_version: data.lgpdTermsVersion || '1.0',
          paymentType: data.paymentType || null,
        }
      });

      // B) Vincula a ficha ao líder e queima ela
      await tx.ecdToken.update({
        where: { id: tokenRecord.id },
        data: { isUsed: true, usedAt: new Date(), leaderId: leader.id }
      });

      // C) Desconta a Vaga do Líder (Pendente já gasta vaga)
      const field = tokenRecord.tokenType === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
      await tx.ecdLeader.update({
        where: { id: leader.id },
        data: { [field]: { increment: 1 } }
      });

      return registration;
    });
  }

  // ==========================================
  // LÍDERES E COTAS
  // ==========================================

  async getLeaders() {
    const latestEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' } // Certifique-se de usar o camelCase aqui também, se aplicável
    });

    if (!latestEdition) return [];

    // 1. Busca os líderes
    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId: latestEdition.id },
      include: {
        cell: { select: { leader: true } }
      }
    });

    // 2. Busca TODAS as inscrições reais desta edição
    const registrations = await prisma.ecdRegistration.findMany({
      where: { edition_id: latestEdition.id },
      select: { leader_id: true, status: true, ficha_type: true }
    });

    // 3. Monta o pacote de dados com a contagem exata
    return leaders.map(l => {
      // Filtra as inscrições que pertencem a este líder
      const lRegs = registrations.filter(r => r.leader_id === l.id);

      return {
        id: l.id,
        name: l.cell?.leader || l.name || 'Líder Não Identificado',
        isExternal: !l.cell,
        inviteCode: l.inviteCode,

        // Contagem Amarela
        yellow_pending: lRegs.filter(r => r.ficha_type === 'AMARELA' && r.status === 'PENDENTE').length,
        yellow_approved: lRegs.filter(r => r.ficha_type === 'AMARELA' && r.status === 'ATIVO').length,

        // Contagem Verde
        green_pending: lRegs.filter(r => r.ficha_type === 'VERDE' && r.status === 'PENDENTE').length,
        green_approved: lRegs.filter(r => r.ficha_type === 'VERDE' && r.status === 'ATIVO').length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateLeader(id: string, name: string, yellowSlots: number, greenSlots: number) {
    const leader = await prisma.ecdLeader.findUnique({ where: { id } });
    if (!leader) throw new Error("Líder não encontrado.");

    if (yellowSlots < leader.usedYellowSlots || greenSlots < leader.usedGreenSlots) {
      throw new Error("Não é possível reduzir a cota abaixo do que já foi utilizado.");
    }

    await this._checkQuotaAvailability(leader.editionId, id, yellowSlots, greenSlots);

    // 👇 Simples e direto: Apenas atualiza a cota. Não gera mais links automáticos!
    return await prisma.ecdLeader.update({
      where: { id },
      data: { totalYellowSlots: yellowSlots, totalGreenSlots: greenSlots }
    });
  }

  // ==========================================
  // FICHAS / REGISTROS
  // ==========================================

  async getRegistrations() {
    return await prisma.ecdRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: {
          include: { cell: true } // Inclui a célula para pegar o nome
        },
        edition: { select: { name: true } },
        token: true
      }
    });
  }

  async updatePaymentStatus(id: string, status: string) {
    return await prisma.ecdRegistration.update({ where: { id }, data: { payment_status: status } });
  }

  async markAsCompleted(id: string, editionId: string) {
    return await prisma.ecdRegistration.update({ where: { id }, data: { status: 'CONCLUIDO', edition_id: editionId } });
  }

  async deleteRegistration(id: string) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    // 👇 1. APAGA AS IMAGENS DO MINIO PRIMEIRO 👇
    try {
      if (reg.profile_photo_url) {
        await deleteImage(reg.profile_photo_url);
      }
      if (reg.receipt_photo_url) {
        await deleteImage(reg.receipt_photo_url);
      }
    } catch (err) {
      // Usamos um try-catch aqui para que, se a imagem já não existir no MinIO 
      // por algum motivo, o sistema não trave e continue a apagar do banco.
      console.warn(`[MinIO] Aviso ao deletar imagens da ficha ${id}:`, err);
    }

    // 2. TRANSAÇÃO: APAGA DO BANCO E DEVOLVE AS COTAS/TOKENS
    return await prisma.$transaction(async (tx) => {
      await tx.ecdRegistration.delete({ where: { id } });

      // Devolve a cota pro líder se a ficha já estava ativa
      if (reg.status === 'ATIVO' && reg.leader_id && reg.ficha_type) {
        const field = reg.ficha_type === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';
        await tx.ecdLeader.update({
          where: { id: reg.leader_id },
          data: { [field]: { decrement: 1 } }
        });
      }

      // Libera o token para ser usado de novo, caso o administrador tenha apagado a ficha de propósito
      if (reg.token_id) {
        await tx.ecdToken.update({
          where: { id: reg.token_id },
          data: { isUsed: false, usedAt: null } // Volta o token para o estado virgem
        });
      }

      return { success: true };
    });
  }

  async approveRegistration(registrationId: string, leaderId: string, fichaType: 'AMARELA' | 'VERDE') {
    const registration = await prisma.ecdRegistration.findUnique({
      where: { id: registrationId }
    });

    if (!registration) throw new Error("Ficha não encontrada.");

    // Como a vaga já foi devidamente descontada e o líder já foi atrelado 
    // no momento do cadastro (createRegistration), a aprovação agora apenas 
    // altera o status da ficha de 'PENDENTE' para 'ATIVO', sem dupla contagem!
    return await prisma.ecdRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'ATIVO'
      }
    });
  }

  async uploadReceiptAdmin(id: string, file: any, isFinal: boolean = false) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id } });
    if (!reg) throw new Error("Ficha não encontrada.");

    // Faz o upload pro MinIO
    const receiptUrl = await uploadImage(file.filename, file.buffer, file.mimetype, 'ecd/receipts');

    // 👇 Salva na coluna correta
    const dataUpdate = isFinal
      ? { receipt_final_photo_url: receiptUrl }
      : { receipt_photo_url: receiptUrl };

    const updatedReg = await prisma.ecdRegistration.update({
      where: { id },
      data: dataUpdate
    });

    return { url: receiptUrl };
  }

  async transferRegistrationLeader(registrationId: string, newLeaderId: string) {
    const reg = await prisma.ecdRegistration.findUnique({ where: { id: registrationId } });
    if (!reg) throw new Error("Ficha não encontrada.");

    if (!reg.leader_id || !reg.ficha_type) {
      return await prisma.ecdRegistration.update({
        where: { id: registrationId },
        data: { leader_id: newLeaderId }
      });
    }

    if (reg.leader_id === newLeaderId) return reg;

    const newLeader = await prisma.ecdLeader.findUnique({
      where: { id: newLeaderId },
      include: { cell: true }
    });
    if (!newLeader) throw new Error("Líder de destino não encontrado.");

    const field = reg.ficha_type === 'AMARELA' ? 'usedYellowSlots' : 'usedGreenSlots';

    // 👇 REMOVIDA A VERIFICAÇÃO DE COTA INDIVIDUAL AQUI TAMBÉM 👇

    return await prisma.$transaction(async (tx) => {
      if (reg.status === 'ATIVO') {
        // Tira de um líder
        await tx.ecdLeader.update({
          where: { id: reg.leader_id },
          data: { [field]: { decrement: 1 } }
        });

        // Coloca no outro
        await tx.ecdLeader.update({
          where: { id: newLeaderId },
          data: { [field]: { increment: 1 } }
        });
      }

      if (reg.token_id) {
        await tx.ecdToken.update({
          where: { id: reg.token_id },
          data: { leaderId: newLeaderId }
        });
      }

      return await tx.ecdRegistration.update({
        where: { id: registrationId },
        data: { leader_id: newLeaderId }
      });
    });
  }

  // ==========================================
  // EDIÇÕES (GERAÇÃO AUTOMÁTICA)
  // ==========================================

  async getEditions() {
    const editions = await prisma.ecdEdition.findMany({ orderBy: { created_at: 'desc' } });

    // 👇 NOVO: Conta quantas fichas físicas já foram geradas (impressas) para cada edição
    const editionsWithCounts = await Promise.all(editions.map(async (ed) => {
      const printedYellow = await prisma.ecdToken.count({ where: { editionId: ed.id, tokenType: 'AMARELA' } });
      const printedGreen = await prisma.ecdToken.count({ where: { editionId: ed.id, tokenType: 'VERDE' } });

      return {
        ...ed,
        printedYellow,
        printedGreen
      };
    }));

    return editionsWithCounts;
  }

  async createEdition(data: EditionEcdType) {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.ecdEdition.create({
        data: {
          name: data.name,
          yellow_slots: data.yellowSlots,
          green_slots: data.greenSlots,
          worker_slots: data.workerSlots,
          encontristaPaymentLink: data.encontristaPaymentLink ?? null,
          workerPaymentLink: data.workerPaymentLink ?? null,
          is_active: true,
          priceTotal: data.priceTotal || 100.00,  // 👈 Salva o valor total
          priceSignal: data.priceSignal || 50.00, // 👈 Salva o valor do sinal
          workerPrice: data.workerPrice || 50.00,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
        }
      });

      // 👇 1. Agora buscamos o ID e o NOME DO LÍDER da célula
      const activeCells = await tx.siteCell.findMany({
        // where: { is_active: true },
        select: { id: true, leader: true }
      });

      if (activeCells.length > 0) {
        const leadersToInsert = activeCells.map(cell => ({
          editionId: edition.id,
          cellId: cell.id,
          name: cell.leader, // 👈 2. Salva APENAS o nome do líder diretamente no banco!
          totalYellowSlots: 0,
          usedYellowSlots: 0,
          totalGreenSlots: 0,
          usedGreenSlots: 0,
          inviteCode: generateShortCode(5).toUpperCase()
        }));

        await tx.ecdLeader.createMany({ data: leadersToInsert });
      }

      return edition;
    });
  }

  async updateEdition(id: string, data: EditionEcdType) {
    return await prisma.ecdEdition.update({
      where: { id },
      data: {
        name: data.name,
        yellow_slots: data.yellowSlots,
        green_slots: data.greenSlots,
        worker_slots: data.workerSlots,
        encontristaPaymentLink: data.encontristaPaymentLink ?? null,
        workerPaymentLink: data.workerPaymentLink ?? null,
        priceTotal: data.priceTotal ?? null,
        priceSignal: data.priceSignal ?? null,
        workerPrice: data.workerPrice ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      }
    });
  }

  async deleteEdition(id: string) {
    return await prisma.$transaction(async (tx) => {

      // 1. Busca todos os líderes atrelados a esta edição
      const leaders = await tx.ecdLeader.findMany({
        where: { editionId: id },
        select: { id: true }
      });
      const leaderIds = leaders.map(l => l.id);

      if (leaderIds.length > 0) {

        // 2. Busca todas as inscrições PENDENTES destes líderes
        const pendingRegistrations = await tx.ecdRegistration.findMany({
          where: {
            leader_id: { in: leaderIds },
            status: 'PENDENTE'
          }
        });

        // 3. Apaga as fotos e comprovantes do MinIO (Limpeza de lixo)
        for (const reg of pendingRegistrations) {
          try {
            if (reg.profile_photo_url) await deleteImage(reg.profile_photo_url);
            if (reg.receipt_photo_url) await deleteImage(reg.receipt_photo_url);
          } catch (err) {
            console.warn(`[MinIO] Erro ao deletar mídia da ficha pendente ${reg.id}`, err);
          }
        }

        // 4. Apaga as inscrições PENDENTES do banco de dados
        if (pendingRegistrations.length > 0) {
          await tx.ecdRegistration.deleteMany({
            where: { id: { in: pendingRegistrations.map(r => r.id) } }
          });
        }

        // 5. Apaga os links (tokens) gerados para estes líderes
        await tx.ecdToken.deleteMany({
          where: { leaderId: { in: leaderIds } }
        });

        // 6. Apaga os Líderes desta edição
        // NOTA: Se houver alguma ficha ATIVA ou CONCLUÍDA atrelada a este líder, 
        // o Prisma vai disparar o erro P2003 aqui, abortando a exclusão e protegendo o histórico!
        await tx.ecdLeader.deleteMany({
          where: { editionId: id }
        });
      }

      // 7. Por fim, apaga a Edição
      return await tx.ecdEdition.delete({ where: { id } });
    });
  }

  async createLeader(name: string, yellowSlots: number, greenSlots: number) {
    const latestEdition = await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });
    if (!latestEdition) throw new Error("Nenhuma edição ativa encontrada.");

    await this._checkQuotaAvailability(latestEdition.id, null, yellowSlots, greenSlots);

    return await prisma.ecdLeader.create({
      data: {
        name,
        editionId: latestEdition.id,
        totalYellowSlots: yellowSlots,
        totalGreenSlots: greenSlots,
        inviteCode: generateShortCode(5).toUpperCase() // 👇 ADICIONADO AQUI
      }
    });
  }

  async deleteLeader(id: string) {
    return await prisma.ecdLeader.delete({ where: { id } });
  }

  private async _checkQuotaAvailability(editionId: string, leaderIdToIgnore: string | null, reqYellow: number, reqGreen: number) {
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    // Busca todos os líderes desta edição (ignorando o líder atual se for uma atualização)
    const otherLeaders = await prisma.ecdLeader.findMany({
      where: {
        editionId: editionId,
        ...(leaderIdToIgnore ? { id: { not: leaderIdToIgnore } } : {})
      }
    });

    const yellowAllocated = otherLeaders.reduce((sum, l) => sum + (l.totalYellowSlots || 0), 0);
    const greenAllocated = otherLeaders.reduce((sum, l) => sum + (l.totalGreenSlots || 0), 0);

    const availableYellow = edition.yellow_slots - yellowAllocated;
    const availableGreen = edition.green_slots - greenAllocated;

    if (reqYellow > availableYellow) {
      throw new Error(`Cota Amarela indisponível! O evento possui apenas ${availableYellow} vagas amarelas livres para distribuição.`);
    }

    if (reqGreen > availableGreen) {
      throw new Error(`Cota Verde indisponível! O evento possui apenas ${availableGreen} vagas verdes livres para distribuição.`);
    }
  }

  // ==========================================
  // GERAÇÃO DE LOTE E PDF COM TRAVA DE EDIÇÃO
  // ==========================================
  async generateTokensAndPdf(amountYellow: number, amountGreen: number, editionId: string) {

    // 1. TRAVA DE SEGURANÇA E LIMITES
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    // Conta o total apenas para checar o limite de vagas disponíveis
    const alreadyYellowCount = await prisma.ecdToken.count({ where: { editionId, tokenType: 'AMARELA' } });
    const alreadyGreenCount = await prisma.ecdToken.count({ where: { editionId, tokenType: 'VERDE' } });

    if (alreadyYellowCount + amountYellow > edition.yellow_slots) {
      throw new Error(`Limite excedido! A edição permite ${edition.yellow_slots} amarelas. Já imprimimos ${alreadyYellowCount}. Você só pode gerar mais ${edition.yellow_slots - alreadyYellowCount}.`);
    }

    if (alreadyGreenCount + amountGreen > edition.green_slots) {
      throw new Error(`Limite excedido! A edição permite ${edition.green_slots} verdes. Já imprimimos ${alreadyGreenCount}. Você só pode gerar mais ${edition.green_slots - alreadyGreenCount}.`);
    }

    // 👇 CORREÇÃO AQUI: Busca o MAIOR número já registrado para continuar a sequência corretamente,
    // garantindo que não existam números duplicados mesmo se fichas antigas forem deletadas.
    const maxYellowToken = await prisma.ecdToken.aggregate({
      _max: { tokenNumber: true },
      where: { editionId, tokenType: 'AMARELA' }
    });

    const maxGreenToken = await prisma.ecdToken.aggregate({
      _max: { tokenNumber: true },
      where: { editionId, tokenType: 'VERDE' }
    });

    // 2. GERAÇÃO DOS TOKENS COM O NÚMERO SALVO NO BANCO
    const tokensToCreate: any[] = [];

    let yellowCounter = maxYellowToken._max.tokenNumber || 0;
    for (let i = 0; i < amountYellow; i++) {
      yellowCounter++;
      tokensToCreate.push({
        id: crypto.randomUUID(),
        shortCode: generateShortCode(5),
        tokenType: 'AMARELA',
        isUsed: false,
        editionId: editionId,
        tokenNumber: yellowCounter // 👈 Salva o número correto no banco
      });
    }

    let greenCounter = maxGreenToken._max.tokenNumber || 0;
    for (let i = 0; i < amountGreen; i++) {
      greenCounter++;
      tokensToCreate.push({
        id: crypto.randomUUID(),
        shortCode: generateShortCode(5),
        tokenType: 'VERDE',
        isUsed: false,
        editionId: editionId,
        tokenNumber: greenCounter // 👈 Salva o número correto no banco
      });
    }

    await prisma.ecdToken.createMany({ data: tokensToCreate, skipDuplicates: true });

    // 3. PREPARAÇÃO DOS DADOS FORMATADOS
    const eventDate = formatEventPeriod(edition.startDate, edition.endDate);
    const totalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceTotal || 100);
    const signalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceSignal || 50);

    // 4. DESENHO DO NOVO PDF (DESIGN INGRESSO)
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

    for (let index = 0; index < tokensToCreate.length; index++) {
      const token = tokensToCreate[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // O PDF pega o número diretamente do objeto que acabou de ser gerado e será salvo no banco
      const seqNumber = token.tokenNumber;

      // Borda Externa do Ingresso
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // Faixa Superior Colorida com o NÚMERO SEQUENCIAL
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType} Nº ${seqNumber}`, 45, currentY + 12);

      // DIVISÓRIA VERTICAL DO TICKET (Estilo Canhoto)
      doc.moveTo(380, currentY + 35).lineTo(380, currentY + 240).strokeColor('#e2e8f0').lineWidth(1).dash(5, { space: 5 }).stroke();
      doc.undash();

      // ==========================================
      // LADO ESQUERDO: INFORMAÇÕES E INSTRUÇÕES
      // ==========================================
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('INFORMAÇÕES DO EVENTO', 45, currentY + 50);

      doc.fillColor('#475569').font('Helvetica').fontSize(10);
      doc.text(`Data: `, 45, currentY + 68, { continued: true }).font('Helvetica-Bold').text(eventDate);
      doc.font('Helvetica').text(`Valor: `, 45, currentY + 83, { continued: true }).font('Helvetica-Bold').text(`${totalStr} (Sinal mínimo para reserva: ${signalStr})`);

      // Linha divisória fina
      doc.moveTo(45, currentY + 105).lineTo(360, currentY + 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('COMO GARANTIR SUA VAGA:', 45, currentY + 115);
      doc.fillColor('#475569').font('Helvetica').fontSize(9)
        .text('1. Escaneie o QR Code ao lado com a câmera do celular.', 45, currentY + 130)
        .text('2. Preencha o formulário e anexe o comprovante do pagamento PIX.', 45, currentY + 145)
        .text('3. Digite o código do seu líder (PIN) na primeira etapa da tela.', 45, currentY + 160);

      // ==========================================
      // LADO DIREITO: QR CODE E PIN
      // ==========================================
      // Caixa para o Líder escrever o PIN a caneta
      doc.rect(395, currentY + 45, 150, 35).fillAndStroke('#f8fafc', '#94a3b8');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('CÓDIGO DO LÍDER (PIN):', 400, currentY + 52, { width: 140, align: 'center' });
      doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(12).text('', 400, currentY + 64, { width: 140, align: 'center' });

      // QR Code Único
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 110 });
      doc.image(publicQrBuffer, 415, currentY + 90, { width: 110 });

      doc.link(415, currentY + 90, 110, 110, publicUrl);

      // ID de Segurança
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`ID: ${token.shortCode} | Link de uso único`, 395, currentY + 210, { align: 'center', width: 150 });
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // RELATÓRIO DE CÓDIGOS DE CONVITE (PIN)
  // ==========================================
  async generateLeadersCodesPdf(editionId: string) {
    const leaders = await prisma.ecdLeader.findMany({
      where: { editionId },
      include: { cell: true },
      orderBy: { name: 'asc' } // Se o seu campo for 'name'
    });

    if (leaders.length === 0) {
      throw new Error("Nenhum líder encontrado para esta edição.");
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Cabeçalho do Relatório
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text('RELATÓRIO DE CÓDIGOS (PIN) - ECD', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
    doc.moveDown(2);

    // Linha de Cabeçalho da Tabela
    let currentY = doc.y;
    doc.rect(40, currentY, 515, 24).fill('#334155');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
      .text('LÍDER / ORIGEM', 50, currentY + 7, { width: 180 })
      .text('CÓDIGO (PIN)', 240, currentY + 7, { width: 90, align: 'center' })
      .text('FICHAS ENTREGUES', 340, currentY + 7, { width: 200, align: 'center' });

    doc.moveDown(0.8);

    // Listagem dos Líderes
    leaders.forEach((leader) => {
      // Se estourar a página, cria uma nova e redesenha o topo
      if (doc.y > 720) {
        doc.addPage();
        currentY = doc.y;
        doc.rect(40, currentY, 515, 24).fill('#334155');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
          .text('LÍDER / ORIGEM', 50, currentY + 7, { width: 180 })
          .text('CÓDIGO (PIN)', 240, currentY + 7, { width: 90, align: 'center' })
          .text('FICHAS ENTREGUES', 340, currentY + 7, { width: 200, align: 'center' });
        doc.moveDown(0.8);
      }

      const rowY = doc.y;
      const displayName = leader.cell?.leader || leader.name || 'Líder Não Identificado';

      // Nome do Líder
      doc.fillColor('#334155').font('Helvetica').fontSize(10).text(displayName, 50, rowY + 8, { width: 180 });

      // Caixa de Destaque do PIN
      doc.rect(240, rowY + 3, 90, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(11).text(leader.inviteCode || 'N/A', 240, rowY + 8, { width: 90, align: 'center' });

      // 👇 AS CAIXAS EM BRANCO PARA ANOTAÇÃO A MÃO 👇
      // Caixa Amarela
      doc.rect(345, rowY + 3, 90, 20).strokeColor('#fef08a').lineWidth(1).stroke();
      doc.fillColor('#a16207').font('Helvetica-Bold').fontSize(9).text('AM: _______', 355, rowY + 9);

      // Caixa Verde
      doc.rect(445, rowY + 3, 90, 20).strokeColor('#bbf7d0').lineWidth(1).stroke();
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9).text('VD: _______', 455, rowY + 9);

      // Linha sutil divisória de registro
      doc.moveTo(40, rowY + 28).lineTo(555, rowY + 28).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      doc.y = rowY + 32; // Avança o cursor para a próxima linha
    });

    doc.end();
    return doc;
  }

  async validatePin(inviteCode: string, tokenId: string) {
    const token = await prisma.ecdToken.findUnique({ where: { id: tokenId } });
    if (!token) throw new Error("Ficha não encontrada no sistema.");
    if (token.isUsed) throw new Error("Esta ficha já foi utilizada por outra pessoa.");

    const leader = await prisma.ecdLeader.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { cell: true }
    });

    if (!leader) throw new Error("Código (PIN) inválido. Verifique se digitou corretamente.");
    if (leader.editionId !== token.editionId) throw new Error("Este PIN pertence a outra edição do evento.");

    // 👇 REMOVEMOS A CHECAGEM DE COTA AQUI 👇

    return {
      isValid: true,
      leaderName: leader.cell?.leader ?? leader.name
    };
  }

  // ==========================================
  // REIMPRESSÃO DE FICHAS NÃO UTILIZADAS
  // ==========================================
  async reprintTokensPdf(editionId: string) {
    // 1. Busca os dados da EDIÇÃO primeiro (Para a Data e Valores)
    const edition = await prisma.ecdEdition.findUnique({ where: { id: editionId } });
    if (!edition) throw new Error("Edição não encontrada.");

    // 2. Busca APENAS as fichas NÃO UTILIZADAS, ordenando por Tipo (Cor) e pelo Número salvo no banco
    const tokensToPrint = await prisma.ecdToken.findMany({
      where: {
        editionId: editionId,
        isUsed: false
      },
      orderBy: [
        { tokenType: 'asc' },   // Agrupa: AMARELA primeiro, VERDE depois
        { tokenNumber: 'asc' }  // Ordena os números: 1, 2, 3...
      ]
    });

    if (tokensToPrint.length === 0) {
      throw new Error("Todas as fichas impressas desta edição já foram utilizadas ou nenhuma ficha foi gerada!");
    }

    // 3. PREPARAÇÃO DOS DADOS FORMATADOS
    const eventDate = formatEventPeriod(edition.startDate, edition.endDate);
    const totalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceTotal || 100);
    const signalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(edition.priceSignal || 50);

    // 4. DESENHO DO PDF
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const rowHeight = 230;
    const startY = 40;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

    for (let index = 0; index < tokensToPrint.length; index++) {
      const token = tokensToPrint[index];
      if (!token) continue;

      if (index > 0 && index % 3 === 0) doc.addPage();

      const currentY = startY + (index % 3) * rowHeight;
      const colorHex = token.tokenType === 'AMARELA' ? '#eab308' : '#16a34a';

      // 👇 Pega o número real que já está salvo no banco de dados 👇
      const seqNumber = token.tokenNumber;

      // Borda Externa
      doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

      // Faixa Superior Colorida (COM AVISO DE REIMPRESSÃO)
      doc.rect(30, currentY, 535, 35).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`ENCONTRO COM DEUS - FICHA ${token.tokenType} Nº ${seqNumber} (REIMPRESSÃO)`, 45, currentY + 12);

      // Divisória Tracejada
      doc.moveTo(380, currentY + 35).lineTo(380, currentY + 240).strokeColor('#e2e8f0').lineWidth(1).dash(5, { space: 5 }).stroke();
      doc.undash();

      // LADO ESQUERDO: INFORMAÇÕES E INSTRUÇÕES
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('INFORMAÇÕES DO EVENTO', 45, currentY + 50);

      doc.fillColor('#475569').font('Helvetica').fontSize(10);
      doc.text(`Data: `, 45, currentY + 68, { continued: true }).font('Helvetica-Bold').text(eventDate);
      doc.font('Helvetica').text(`Valor: `, 45, currentY + 83, { continued: true }).font('Helvetica-Bold').text(`${totalStr} (Sinal mínimo para reserva: ${signalStr})`);

      doc.moveTo(45, currentY + 105).lineTo(360, currentY + 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('COMO GARANTIR SUA VAGA:', 45, currentY + 115);
      doc.fillColor('#475569').font('Helvetica').fontSize(9)
        .text('1. Escaneie o QR Code ao lado com a câmera do celular.', 45, currentY + 130)
        .text('2. Preencha o formulário e anexe o comprovante do pagamento PIX.', 45, currentY + 145)
        .text('3. Digite o código do seu líder (PIN) na primeira etapa da tela.', 45, currentY + 160);

      // LADO DIREITO: QR CODE E PIN
      doc.rect(395, currentY + 45, 150, 35).fillAndStroke('#f8fafc', '#94a3b8');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('CÓDIGO DO LÍDER (PIN):', 400, currentY + 52, { width: 140, align: 'center' });
      doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(12).text('', 400, currentY + 64, { width: 140, align: 'center' });

      // QR Code Clicável
      const publicUrl = `${baseUrl}/ecd/cadastro?token=${token.id}`;
      const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 110 });

      doc.image(publicQrBuffer, 415, currentY + 90, { width: 110 });
      doc.link(415, currentY + 90, 110, 110, publicUrl); // Link Clicável na área do QR Code

      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`ID: ${token.shortCode} | Escaneie ou Clique`, 395, currentY + 210, { align: 'center', width: 150 });
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // GERAÇÃO DE PDF COMPLETO (HISTÓRICO)
  // ==========================================
  async generateHistoryPdf(editionId: string) {
    const historyRecord = await prisma.ecdEditionHistory.findFirst({
      where: { edition_id: editionId }
    });

    if (!historyRecord) {
      throw new Error("Nenhum registro de histórico encontrado para esta edição.");
    }

    const parseData = (data: any) => {
      if (!data) return [];
      return typeof data === 'string' ? JSON.parse(data) : data;
    };

    const encontristas: any[] = parseData(historyRecord.attendees_data);
    const areaLeaders: any[] = parseData(historyRecord.area_leaders_data);
    const workers: any[] = parseData(historyRecord.workers_data);
    const cotas: any[] = parseData(historyRecord.leaders_slots_data);

    encontristas.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    areaLeaders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    workers.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    cotas.sort((a, b) => {
      const engA = (a.used_yellow || 0) + (a.used_green || 0);
      const engB = (b.used_yellow || 0) + (b.used_green || 0);
      return engB !== engA ? engB - engA : (a.name || '').localeCompare(b.name || '');
    });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // CABEÇALHO GERAL
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text(`RELATÓRIO COMPLETO: ${historyRecord.edition_name.toUpperCase()}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Data de Arquivamento: ${new Date(historyRecord.created_at).toLocaleString('pt-BR')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.moveDown(1.5);

    const startY = doc.y;
    doc.rect(40, startY, 515, 40).fill('#f8fafc').stroke('#cbd5e1').lineWidth(0.5).stroke();
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10)
      .text(`Total de Encontristas: ${encontristas.length}`, 60, startY + 15)
      .text(`Total da Equipe: ${(areaLeaders.length + workers.length)}`, 240, startY + 15)
      .text(`Líderes Engajados: ${cotas.length}`, 410, startY + 15);

    doc.y = startY + 60;

    const checkPageBreak = (neededHeight: number = 40) => {
      if (doc.y + neededHeight > 780) {
        doc.addPage();
        return true;
      }
      return false;
    };

    // ==========================================
    // SESSÃO 1: ENCONTRISTAS
    // ==========================================
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('1. LISTA DE ENCONTRISTAS', 40, doc.y);
    doc.moveDown(0.5);

    const drawEncontristasHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('NOME COMPLETO', 45, top + 6, { width: 145 })
        .text('ORIGEM / CÉLULA', 195, top + 6, { width: 120 })
        .text('CONTATO', 320, top + 6, { width: 80 })
        .text('PERFIL', 405, top + 6, { width: 80 })
        .text('FICHA', 490, top + 6, { width: 60 });
      doc.y = top + 24;
    };

    if (encontristas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#94a3b8').text('Nenhum encontrista registrado.', 40, doc.y);
    } else {
      drawEncontristasHeader();
      encontristas.forEach((e) => {
        if (checkPageBreak(25)) drawEncontristasHeader();

        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(e.full_name || '-', 45, rowY, { width: 145, ellipsis: true })
          .text(e.origin || '-', 195, rowY, { width: 120, ellipsis: true })
          .text(e.phone || '-', 320, rowY, { width: 80 })
          .text(`${e.age || '-'}a | ${e.gender || '-'}`, 405, rowY, { width: 80 });

        const fichaType = (e.ficha_type || e.fichaType || '').toUpperCase();
        doc.fillColor(fichaType === 'AMARELA' ? '#a16207' : '#15803d').font('Helvetica-Bold')
          .text(fichaType || '-', 490, rowY, { width: 60 });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }
    doc.moveDown(1.5);

    // ==========================================
    // SESSÃO 2: EQUIPE DE TRABALHO
    // ==========================================
    checkPageBreak(100);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('2. EQUIPE DE TRABALHO', 40, doc.y);
    doc.moveDown(0.5);

    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text('COORDENADORES / LÍDERES DE ÁREA', 40, doc.y);
    doc.moveDown(0.3);
    if (areaLeaders.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#94a3b8').text('Nenhum coordenador registrado.', 40, doc.y);
    } else {
      const cTop = doc.y;
      doc.rect(40, cTop, 515, 18).fill('#e2e8f0');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
        .text('NOME DO COORDENADOR', 45, cTop + 5, { width: 200 })
        .text('ÁREA DE ATUAÇÃO', 250, cTop + 5, { width: 150 })
        .text('VOLUNTÁRIOS SOB GESTÃO', 410, cTop + 5, { width: 140 });
      doc.y = cTop + 22;

      areaLeaders.forEach((l) => {
        if (checkPageBreak(20)) { /* header */ }
        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(l.name || '-', 45, rowY, { width: 200, ellipsis: true })
          .text(l.area_name || '-', 250, rowY, { width: 150, ellipsis: true })
          .text(`${l.workers_count || 0} voluntário(s)`, 410, rowY, { width: 140 });
        doc.y = rowY + 14;
      });
    }
    doc.moveDown(1);

    checkPageBreak(60);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text('VOLUNTÁRIOS DA EQUIPE', 40, doc.y);
    doc.moveDown(0.3);

    const drawWorkersHeader = () => {
      const wTop = doc.y;
      doc.rect(40, wTop, 515, 18).fill('#f1f5f9');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
        .text('NOME DO VOLUNTÁRIO', 45, wTop + 5, { width: 160 })
        .text('LÍDER DIRETO', 210, wTop + 5, { width: 130 })
        .text('CONTATO', 350, wTop + 5, { width: 90 })
        .text('ÁREA', 445, wTop + 5, { width: 100 });
      doc.y = wTop + 22;
    };

    if (workers.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#94a3b8').text('Nenhum voluntário registrado.', 40, doc.y);
    } else {
      drawWorkersHeader();
      workers.forEach((w) => {
        if (checkPageBreak(20)) drawWorkersHeader();
        const rowY = doc.y;
        doc.fillColor('#334155').font('Helvetica').fontSize(8)
          .text(w.full_name || '-', 45, rowY, { width: 160, ellipsis: true })
          .text(w.leader_name || '-', 210, rowY, { width: 130, ellipsis: true })
          .text(w.phone || '-', 350, rowY, { width: 90 })
          .text(w.area_name || '-', 445, rowY, { width: 100, ellipsis: true });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f8fafc').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }
    doc.moveDown(1.5);

    // ==========================================
    // SESSÃO 3: DESEMPENHO DE COTAS
    // ==========================================
    checkPageBreak(100);
    // 👇 CORRIGIDO AQUI (Adicionado 40, doc.y) 👇
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text('3. DESEMPENHO E ENGAJAMENTO DE COTAS', 40, doc.y);
    doc.moveDown(0.5);

    const drawCotasHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('LÍDER / ORIGEM', 45, top + 6, { width: 175 })
        .text('FORNECIDAS', 225, top + 6, { width: 70, align: 'center' })
        .text('AMARELAS USADAS', 300, top + 6, { width: 100, align: 'center' })
        .text('VERDES USADAS', 405, top + 6, { width: 85, align: 'center' })
        .text('APROV. (%)', 495, top + 6, { width: 55, align: 'center' });
      doc.y = top + 24;
    };

    if (cotas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#94a3b8').text('Nenhum dado de cota registrado.', 40, doc.y);
    } else {
      drawCotasHeader();
      cotas.forEach((c) => {
        if (checkPageBreak(25)) drawCotasHeader();

        const rowY = doc.y;
        const totalFornecido = (c.total_yellow || 0) + (c.total_green || 0);
        const totalUsado = (c.used_yellow || 0) + (c.used_green || 0);
        const aproveitamento = totalFornecido > 0 ? Math.round((totalUsado / totalFornecido) * 100) : 0;

        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
          .text(c.name || '-', 45, rowY, { width: 175, ellipsis: true });

        doc.font('Helvetica').fillColor('#64748b')
          .text(totalFornecido.toString(), 225, rowY, { width: 70, align: 'center' });

        doc.fillColor('#a16207').text(`${c.used_yellow || 0} / ${c.total_yellow || 0}`, 300, rowY, { width: 100, align: 'center' });
        doc.fillColor('#15803d').text(`${c.used_green || 0} / ${c.total_green || 0}`, 405, rowY, { width: 85, align: 'center' });

        doc.fillColor(aproveitamento === 100 ? '#10b981' : aproveitamento > 50 ? '#3b82f6' : '#f59e0b').font('Helvetica-Bold')
          .text(`${aproveitamento}%`, 495, rowY, { width: 55, align: 'center' });

        doc.moveTo(40, rowY + 12).lineTo(555, rowY + 12).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        doc.y = rowY + 16;
      });
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // RELATÓRIO DE ENCONTRISTAS (LISTA COM FOTOS)
  // ==========================================
  async generateEncontristasPdf() {
    // 1. Busca a edição atual
    const currentEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (!currentEdition) {
      throw new Error("Nenhuma edição ativa encontrada.");
    }

    // 2. Busca APENAS os encontristas APROVADOS (Ativos ou Concluídos)
    let encontristas = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: { in: ['ATIVO', 'CONCLUIDO'] }
      },
      include: {
        leader: { include: { cell: true } }
      }
    });

    if (encontristas.length === 0) {
      throw new Error("Nenhum encontrista aprovado encontrado para esta edição.");
    }

    // 3. ORDENAÇÃO ALFABÉTICA ABSOLUTA (Ignora Maiúsculas/Minúsculas e Acentos)
    encontristas.sort((a, b) => {
      const nomeA = a.full_name || '';
      const nomeB = b.full_name || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });

    // ==========================================
    // CÁLCULO DE DEMOGRAFIA PARA O GRÁFICO
    // ==========================================
    let totalHomens = 0;
    let totalMulheres = 0;
    encontristas.forEach(e => {
      if (e.gender === 'M') totalHomens++;
      else totalMulheres++; // Assume 'F' para o restante
    });
    const total = encontristas.length;
    const pctHomens = (totalHomens / total) * 100;
    const pctMulheres = (totalMulheres / total) * 100;

    // 4. Prepara o Documento PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Gráfico de Barras Horizontal
    const drawDemographicsChart = () => {
      doc.moveDown(1);
      const startX = 40;
      let currentY = doc.y;

      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9)
        .text('Proporção de Gênero dos Encontristas:', startX, currentY);

      currentY += 15;
      const barWidth = 515;
      const barHeight = 12;
      const widthHomens = (totalHomens / total) * barWidth || 0;
      const widthMulheres = (totalMulheres / total) * barWidth || 0;

      // Barra Masculina (Azul)
      if (widthHomens > 0) doc.rect(startX, currentY, widthHomens, barHeight).fill('#3b82f6');
      // Barra Feminina (Rosa)
      if (widthMulheres > 0) doc.rect(startX + widthHomens, currentY, widthMulheres, barHeight).fill('#ec4899');

      currentY += 16;

      // Labels de Porcentagem
      doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(8)
        .text(`Masculino: ${totalHomens} (${pctHomens.toFixed(1)}%)`, startX, currentY);

      doc.fillColor('#ec4899')
        .text(`Feminino: ${totalMulheres} (${pctMulheres.toFixed(1)}%)`, startX + widthHomens - 120, currentY, { align: 'right', width: 120 });

      doc.moveDown(2);
    };

    // Cabeçalho da Página (Título)
    const drawPageTitle = (isFirstPage = false) => {
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(16)
        .text(`RELAÇÃO DE ENCONTRISTAS APROVADOS - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total: ${total}`, 40, 60, { align: 'center', width: 515 });

      if (isFirstPage) {
        drawDemographicsChart();
      } else {
        doc.moveDown(1.5);
      }
    };

    // Cabeçalho da Tabela
    const drawTableHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('FOTO', 55, top + 6, { width: 50 })
        .text('DADOS PESSOAIS', 120, top + 6, { width: 160 })
        .text('ORIGEM / LÍDER', 290, top + 6, { width: 120 })
        .text('CONTATO', 420, top + 6, { width: 80 })
        .text('FICHA', 510, top + 6, { width: 45 });
      doc.y = top + 24;
    };

    // Desenha a primeira página com o gráfico
    drawPageTitle(true);
    drawTableHeader();

    const rowHeight = 70; // Altura de cada linha para caber a foto

    for (const e of encontristas) {

      // Quebra de página se não houver espaço para a próxima linha
      if (doc.y + rowHeight > 780) {
        doc.addPage();
        drawPageTitle(false);
        drawTableHeader();
      }

      const rowY = doc.y;

      // ==========================================
      // TRATAMENTO DA IMAGEM COM SHARP (BLINDADO)
      // ==========================================
      let imgBuffer: Buffer | null = null;
      if (e.profile_photo_url) {
        try {
          const response = await fetch(e.profile_photo_url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imgBuffer = await sharp(Buffer.from(arrayBuffer))
              .resize(100, 100, { fit: 'cover' })
              .jpeg({ quality: 100 })
              .toBuffer();
          }
        } catch (err) {
          console.warn(`[PDF] Erro ao carregar/converter foto de ${e.full_name}:`, err);
        }
      }

      // ==========================================
      // DESENHO DA LINHA DA TABELA
      // ==========================================

      // 1. Coluna: FOTO
      if (imgBuffer) {
        doc.image(imgBuffer, 45, rowY + 5, { width: 55, height: 55 });
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).strokeColor('#cbd5e1').stroke();
      } else {
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
        doc.undash();
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique')
          .text('SEM FOTO', 45, rowY + 28, { align: 'center', width: 55 });
      }

      // 👇 2. Coluna: DADOS PESSOAIS (Agora com empilhamento dinâmico) 👇
      let textPosY = rowY + 8; // Subimos ligeiramente o início para caber as 3 possíveis informações

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9);

      // Limita a altura a 24px (aprox 2 linhas). Se estourar, aplica reticências automáticas
      doc.text(e.full_name || '-', 120, textPosY, { width: 160, height: 24, ellipsis: true });

      // O PDFKit guarda a posição final da linha na variável doc.y.
      // Assim, se o nome ocupou 1 linha ou 2 linhas, nós continuamos exatamente daqui!
      textPosY = doc.y + 1;

      if (e.nickname) {
        doc.fillColor('#0284c7').font('Helvetica-Oblique').fontSize(8)
          .text(`"${e.nickname}"`, 120, textPosY, { width: 160, lineBreak: false, ellipsis: true });

        textPosY = doc.y + 2;
      } else {
        textPosY += 2; // Respiro extra caso não tenha apelido
      }

      doc.fillColor('#64748b').font('Helvetica').fontSize(8)
        .text(`${e.age || '-'} anos  |  Sexo: ${e.gender || '-'}`, 120, textPosY, { width: 160 });

      // 3. Coluna: ORIGEM / LÍDER
      const leaderName = e.leader?.cell?.leader || e.leader?.name || e.cell_leader_name || 'Desconhecido';
      doc.fillColor('#334155').font('Helvetica').fontSize(8)
        .text(leaderName, 290, rowY + 20, { width: 120, ellipsis: true });

      // 4. Coluna: CONTATO
      doc.fillColor('#334155').font('Helvetica').fontSize(8)
        .text(e.phone || '-', 420, rowY + 20, { width: 80 });

      // 5. Coluna: FICHA (Cor de Fundo)
      const fichaType = (e.ficha_type || 'N/A').toUpperCase();
      const colorHex = fichaType === 'AMARELA' ? '#eab308' : '#16a34a';

      doc.rect(510, rowY + 18, 45, 14).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(fichaType, 510, rowY + 22, { align: 'center', width: 45 });

      // Linha divisória no final da row
      doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // Avança o Y para a próxima iteração com a altura fixa de 70
      doc.y = rowY + rowHeight;
    }

    doc.end();
    return doc;
  }
  // ==========================================
  // BUSCA DE FICHA PELO ID IMPRESSO NO RODAPÉ
  // ==========================================
  async findRegistrationByShortCode(shortCode: string) {
    const token = await prisma.ecdToken.findUnique({
      where: { shortCode: shortCode.toUpperCase() },
      include: {
        registration: {
          include: {
            leader: { include: { cell: true } }
          }
        }
      }
    });

    if (!token) {
      throw new Error(`Nenhuma ficha encontrada com o ID '${shortCode.toUpperCase()}'. Verifique as letras no rodapé da ficha física.`);
    }

    if (!token.isUsed || !token.registration) {
      return {
        status: 'NAO_USADA',
        message: `A ficha ${token.tokenType} (ID: ${token.shortCode}) ainda não foi preenchida ou vinculada a um encontrista.`,
      };
    }

    return {
      status: 'USADA',
      registration: token.registration,
      tokenType: token.tokenType
    };
  }

  // ==========================================
  // BUSCA EXATA PELO NÚMERO SALVO NO BANCO
  // ==========================================
  async findRegistrationByTokenNumber(editionId: string, tokenType: string, tokenNumber: number) {
    const token = await prisma.ecdToken.findFirst({
      where: {
        editionId: editionId,
        tokenType: tokenType.toUpperCase(),
        tokenNumber: tokenNumber // 👈 Busca exatamente pela coluna nova
      },
      include: {
        registration: {
          include: { leader: { include: { cell: true } } }
        }
      }
    });

    if (!token) {
      throw new Error(`A ficha ${tokenType} Nº ${tokenNumber} não existe no banco de dados. (Lembre-se: Fichas antigas só podem ser achadas pelo Código).`);
    }

    if (!token.isUsed || !token.registration) {
      return { status: 'NAO_USADA', message: `A ficha ${tokenType} Nº ${tokenNumber} ainda está em branco.` };
    }

    return { status: 'USADA', registration: token.registration, tokenType: token.tokenType };
  }

  // ==========================================
  // RELATÓRIO DE FILA DE ESPERA (PENDENTES)
  // ==========================================
  async generatePendentesPdf(editionId?: string) {
    const currentEdition = editionId
      ? await prisma.ecdEdition.findUnique({ where: { id: editionId } })
      : await prisma.ecdEdition.findFirst({ orderBy: { created_at: 'desc' } });

    if (!currentEdition) throw new Error("Nenhuma edição encontrada.");

    // Busca APENAS os PENDENTES
    let pendentes = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: 'PENDENTE'
      },
      include: { leader: { include: { cell: true } } }
    });

    if (pendentes.length === 0) {
      throw new Error("A Fila de Espera está vazia para esta edição.");
    }

    // Ordenação Alfabética
    pendentes.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR', { sensitivity: 'base' }));

    // Cálculos para o gráfico
    let totalHomens = 0;
    let totalMulheres = 0;
    pendentes.forEach(e => { if (e.gender === 'M') totalHomens++; else totalMulheres++; });
    const total = pendentes.length;
    const pctHomens = (totalHomens / total) * 100;
    const pctMulheres = (totalMulheres / total) * 100;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const drawDemographicsChart = () => {
      doc.moveDown(1);
      const startX = 40; let currentY = doc.y;
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9).text('Proporção de Gênero (Fila de Espera):', startX, currentY);
      currentY += 15;
      const barWidth = 515; const barHeight = 12;
      const widthHomens = (totalHomens / total) * barWidth || 0;
      const widthMulheres = (totalMulheres / total) * barWidth || 0;

      if (widthHomens > 0) doc.rect(startX, currentY, widthHomens, barHeight).fill('#3b82f6');
      if (widthMulheres > 0) doc.rect(startX + widthHomens, currentY, widthMulheres, barHeight).fill('#ec4899');
      currentY += 16;
      doc.fillColor('#3b82f6').font('Helvetica-Bold').fontSize(8).text(`Masculino: ${totalHomens} (${pctHomens.toFixed(1)}%)`, startX, currentY);
      doc.fillColor('#ec4899').text(`Feminino: ${totalMulheres} (${pctMulheres.toFixed(1)}%)`, startX + widthHomens - 120, currentY, { align: 'right', width: 120 });
      doc.moveDown(2);
    };

    const drawPageTitle = (isFirstPage = false) => {
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(16)
        .text(`FILA DE ESPERA (PENDENTES) - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total na fila: ${total}`, 40, 60, { align: 'center', width: 515 });

      if (isFirstPage) drawDemographicsChart(); else doc.moveDown(1.5);
    };

    const drawTableHeader = () => {
      const top = doc.y;
      doc.rect(40, top, 515, 20).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
        .text('FOTO', 55, top + 6, { width: 50 })
        .text('DADOS PESSOAIS', 120, top + 6, { width: 160 })
        .text('ORIGEM / LÍDER', 290, top + 6, { width: 120 })
        .text('CONTATO', 420, top + 6, { width: 80 })
        .text('FICHA', 510, top + 6, { width: 45 });
      doc.y = top + 24;
    };

    drawPageTitle(true);
    drawTableHeader();
    const rowHeight = 70;

    for (const e of pendentes) {
      if (doc.y + rowHeight > 780) { doc.addPage(); drawPageTitle(false); drawTableHeader(); }
      const rowY = doc.y;

      let imgBuffer: Buffer | null = null;
      if (e.profile_photo_url) {
        try {
          const response = await fetch(e.profile_photo_url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imgBuffer = await sharp(Buffer.from(arrayBuffer)).resize(100, 100, { fit: 'cover' }).jpeg({ quality: 100 }).toBuffer();
          }
        } catch (err) { }
      }

      if (imgBuffer) {
        doc.image(imgBuffer, 45, rowY + 5, { width: 55, height: 55 });
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).strokeColor('#cbd5e1').stroke();
      } else {
        doc.rect(45, rowY + 5, 55, 55).lineWidth(1).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke(); doc.undash();
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique').text('SEM FOTO', 45, rowY + 28, { align: 'center', width: 55 });
      }

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9).text(e.full_name || '-', 120, rowY + 15, { width: 160, ellipsis: true });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`${e.age || '-'} anos  |  Sexo: ${e.gender || '-'}`, 120, rowY + 28, { width: 160 });

      const leaderName = e.leader?.cell?.leader || e.leader?.name || e.cell_leader_name || 'Desconhecido';
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(leaderName, 290, rowY + 20, { width: 120, ellipsis: true });
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(e.phone || '-', 420, rowY + 20, { width: 80 });

      const fichaType = (e.ficha_type || 'N/A').toUpperCase();
      const colorHex = fichaType === 'AMARELA' ? '#eab308' : '#16a34a';

      doc.rect(510, rowY + 18, 45, 14).fill(colorHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(fichaType, 510, rowY + 22, { align: 'center', width: 45 });
      doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.y = rowY + rowHeight;
    }

    doc.end();
    return doc;
  }

  // ==========================================
  // RELATÓRIO DE ENCONTRISTAS (APENAS NOMES, SEPARADO POR SEXO)
  // ==========================================
  async generateEncontristasListagemPdf() {
    const currentEdition = await prisma.ecdEdition.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (!currentEdition) throw new Error("Nenhuma edição ativa encontrada.");

    let encontristas = await prisma.ecdRegistration.findMany({
      where: {
        edition_id: currentEdition.id,
        status: { in: ['ATIVO', 'CONCLUIDO'] }
      },
      select: {
        full_name: true,
        nickname: true,
        gender: true
      }
    });

    if (encontristas.length === 0) throw new Error("Nenhum encontrista aprovado encontrado.");

    // Separa por sexo e ordena alfabeticamente
    const homens = encontristas.filter(e => e.gender === 'M').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'));
    const mulheres = encontristas.filter(e => e.gender !== 'M').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'));

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const drawPageHeader = (title: string, color: string, totalCount: number) => {
      doc.fillColor(color).font('Helvetica-Bold').fontSize(16)
        .text(`LISTA DE CHAMADA - ${title} (${totalCount})`, 40, 40, { align: 'center', width: 515 });
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Edição: ${currentEdition.name} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 40, 60, { align: 'center', width: 515 });
      doc.moveDown(2);
    };

    const drawGroup = (groupTitle: string, groupData: any[], headerColor: string) => {
      if (groupData.length === 0) return;

      drawPageHeader(groupTitle, headerColor, groupData.length);

      let currentY = doc.y;
      const rowHeight = 26;

      let index = 1;
      for (const e of groupData) {
        if (currentY + rowHeight > 780) {
          doc.addPage();
          drawPageHeader(groupTitle, headerColor, groupData.length);
          currentY = doc.y;
        }

        // Número sequencial discreto
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
          .text(`${index++}.`, 40, currentY + 6, { width: 30, align: 'right' });

        // Posiciona no X do nome e usa 'continued: true' para empilhar o apelido perfeitamente ao lado
        doc.x = 80;
        doc.y = currentY + 6;

        if (e.nickname) {
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
            .text(`${e.full_name || '-'} `, { continued: true });

          doc.fillColor(headerColor).font('Helvetica-Oblique').fontSize(9)
            .text(`("${e.nickname}")`, { continued: false });
        } else {
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
            .text(e.full_name || '-', { continued: false });
        }

        // Linha divisória bem leve logo abaixo
        doc.moveTo(80, currentY + 21).lineTo(535, currentY + 21).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        currentY += rowHeight;
      }
    };

    // Desenha o grupo de Homens (Azul)
    drawGroup('HOMENS', homens, '#0284c7');

    // Quebra de página antes das mulheres
    if (homens.length > 0 && mulheres.length > 0) doc.addPage();

    // Desenha o grupo de Mulheres (Rosa/Magenta)
    drawGroup('MULHERES', mulheres, '#db2777');

    doc.end();
    return doc;
  }
}