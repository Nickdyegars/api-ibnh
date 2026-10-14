import { prisma } from '../../shared/database/prisma.js';
import { RegisterEcdType, EditionEcdType } from './ecd.schemas.js';
import { uploadImage, deleteImage } from '../../shared/storage/minio.js';
import crypto from 'crypto';
import { EcdPdfService } from './ecd-pdf.service.js';

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
  private pdfService = new EcdPdfService();

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
        // Tira de um líder caso já esteja vinculado
        if (reg.leader_id) {
          await tx.ecdLeader.update({
            where: { id: reg.leader_id },
            data: { [field]: { decrement: 1 } }
          });
        }

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

    return await this.pdfService.generateTokensPdf(tokensToCreate, edition, false);
  }

  // ==========================================
  // RELATÓRIO DE CÓDIGOS DE CONVITE (PIN)
  // ==========================================
  async generateLeadersCodesPdf(editionId: string) {
    return this.pdfService.generateLeadersCodesPdf(editionId);
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

    return await this.pdfService.generateTokensPdf(tokensToPrint, edition, true);
  }

  // ==========================================
  // GERAÇÃO DE PDF COMPLETO (HISTÓRICO)
  // ==========================================
  async generateHistoryPdf(editionId: string) {
    return this.pdfService.generateHistoryPdf(editionId);
  }

  // ==========================================
  // RELATÓRIO DE ENCONTRISTAS (LISTA COM FOTOS)
  // ==========================================
  async generateEncontristasPdf() {
    return this.pdfService.generateEncontristasPdf();
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
    return this.pdfService.generatePendentesPdf(editionId);
  }

  // ==========================================
  // RELATÓRIO DE ENCONTRISTAS (APENAS NOMES, SEPARADO POR SEXO)
  // ==========================================
  async generateEncontristasListagemPdf() {
    return this.pdfService.generateEncontristasListagemPdf();
  }

  async generateEditionReportPdf(editionId: string) {
    return this.pdfService.generateEditionReportPdf(editionId);
  }

  async getEditionReportData(editionId: string) {
    const edition = await prisma.ecdEdition.findUnique({
      where: { id: editionId }
    });

    if (!edition) return null;

    const workers = await prisma.ecdWorkerRegistration.findMany({
      where: { edition_id: editionId, status: 'APROVADO' },
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

    const attendees = await prisma.ecdRegistration.findMany({
      where: { edition_id: editionId, status: 'ATIVO' },
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

    return { edition, workers, attendees };
  }

  async finishAndArchiveEdition(editionId: string) {
    const edition = await prisma.ecdEdition.findUnique({
      where: { id: editionId }
    });

    if (!edition) {
      throw new Error("Edição não encontrada.");
    }

    const workers = await prisma.ecdWorkerRegistration.findMany({
      where: { edition_id: editionId },
      select: {
        full_name: true,
        phone: true,
        area: { select: { name: true } },
        leader: { select: { name: true } },
        profile_photo_url: true,
        status: true
      }
    });

    const attendees = await prisma.ecdRegistration.findMany({
      where: { edition_id: editionId },
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
      where: { edition_id: editionId },
      select: {
        name: true,
        area: { select: { name: true } }
      }
    });

    const cellLeaders = await prisma.ecdLeader.findMany({
      where: { editionId: editionId },
      include: { cell: true }
    });

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
        origin
      };
    });

    const areaLeadersSnapshot = areaLeaders.map(al => {
      const countLiderados = approvedWorkers.filter(w => w.leader?.name === al.name).length;
      return {
        name: al.name,
        area_name: al.area?.name || 'Sem Área',
        workers_count: countLiderados
      };
    });

    const leadersSlotsSnapshot = cellLeaders.map(l => {
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

    const filesToDelete: string[] = [];
    workers.forEach(w => {
      if (w.profile_photo_url) filesToDelete.push(w.profile_photo_url);
    });
    attendees.forEach(a => {
      if (a.profile_photo_url) filesToDelete.push(a.profile_photo_url);
      if (a.receipt_photo_url) filesToDelete.push(a.receipt_photo_url);
    });

    await prisma.$transaction(async (tx) => {
      await tx.ecdEditionHistory.upsert({
        where: { edition_id: editionId },
        create: {
          edition_id: editionId,
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

      await tx.ecdToken.deleteMany({
        where: { editionId: editionId }
      });

      await tx.ecdRegistration.deleteMany({ where: { edition_id: editionId } });
      await tx.ecdWorkerRegistration.deleteMany({ where: { edition_id: editionId } });
      await tx.ecdLeader.deleteMany({ where: { editionId: editionId } });
      await tx.ecdWorkerLeader.deleteMany({ where: { edition_id: editionId } });
      await tx.ecdEdition.update({ where: { id: editionId }, data: { is_active: false } });
    }, {
      maxWait: 10000,
      timeout: 30000
    });

    if (filesToDelete.length > 0) {
      Promise.allSettled(filesToDelete.map(url => deleteImage(url)))
        .then(() => console.log(`[STORAGE] Limpeza concluída: ${filesToDelete.length} imagens enfileiradas para exclusão no MinIO.`))
        .catch(err => console.error("[STORAGE] Erro na fila de limpeza do MinIO:", err));
    }

    return {
      workers_saved: workersSnapshot.length,
      attendees_saved: attendeesSnapshot.length
    };
  }

  async getEditionHistory() {
    return await prisma.ecdEditionHistory.findMany({
      orderBy: { created_at: 'desc' }
    });
  }
}