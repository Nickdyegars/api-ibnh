import { prisma } from '../../shared/database/prisma.js';
import { WorkerAreaType, WorkerLeaderType, RegisterWorkerType } from './ecd-workers.schemas.js';
import { deleteImage } from '../../shared/storage/minio.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export class EcdWorkersService {

    // --- ÁREAS ---
    async getAreas() {
        return await prisma.ecdWorkerArea.findMany({ orderBy: { name: 'asc' } });
    }

    async createArea(data: WorkerAreaType) {
        return await prisma.ecdWorkerArea.create({ data: { name: data.name } });
    }

    async deleteArea(id: string) {
        // Verifica se existem líderes vinculados
        const leadersCount = await prisma.ecdWorkerLeader.count({ where: { area_id: id } });
        if (leadersCount > 0) throw new Error("Não é possível excluir esta área pois existem líderes vinculados a ela.");

        return await prisma.ecdWorkerArea.delete({ where: { id } });
    }

    async updateArea(id: string, name: string) {
        return await prisma.ecdWorkerArea.update({
            where: { id },
            data: { name }
        });
    }

    // --- LÍDERES E TOKENS ---
    async getLeaders(editionId?: string) {
        const whereClause = editionId ? { edition_id: editionId } : {};

        return await prisma.ecdWorkerLeader.findMany({
            where: whereClause,
            include: {
                area: true,
                registrations: { select: { id: true } } // Puxa só os IDs para não pesar
            },
            orderBy: { name: 'asc' }
        });
    }

    async createLeader(name: string, areaId: string, editionId: string, slots: number) {
        return await prisma.ecdWorkerLeader.create({
            data: {
                name,
                area_id: areaId,
                edition_id: editionId,
                slots: slots // Salva a capacidade máxima
            }
        });
    }

    async deleteLeader(id: string) {
        // Verifica se existem fichas vinculadas
        const registrationsCount = await prisma.ecdWorkerRegistration.count({ where: { leader_id: id } });
        if (registrationsCount > 0) throw new Error("Não é possível excluir este líder pois existem voluntários aprovados vinculados a ele.");

        return await prisma.ecdWorkerLeader.delete({ where: { id } });
    }

    async updateLeader(id: string, name: string, areaId: string, slots: number) {
        return await prisma.ecdWorkerLeader.update({
            where: { id },
            data: { name, area_id: areaId, slots }
        });
    }

    async validateToken(tokenCode: string) {
        // 1. NOVO FLUXO: Verifica se o token é o ID de um Líder (Link da Área)
        const leader = await prisma.ecdWorkerLeader.findUnique({
            where: { id: tokenCode },
            include: { area: true, edition: true }
        });

        if (leader) {
            // 👇 NOVA TRAVA FRONTAL AQUI 👇
            if (leader.slots && leader.slots > 0) {
                const registrationsCount = await prisma.ecdWorkerRegistration.count({
                    where: {
                        leader_id: leader.id,
                        status: { not: 'RECUSADO' } // Conta quem está pendente ou aprovado
                    }
                });

                if (registrationsCount >= leader.slots) {
                    throw new Error("SLOTS_FULL");
                }
            }
            // 👆 FIM DA TRAVA FRONTAL 👆

            return {
                isValid: true,
                leaderName: leader.name,
                areaName: leader.area.name,
                workerPrice: leader.edition?.workerPrice || 50.00,
                workerPixKey: leader.edition?.workerPaymentLink || 'Chave não cadastrada'
            };
        }

        // 2. FLUXO ANTIGO: Verifica se é um token descartável de uso único
        const token = await prisma.ecdWorkerToken.findUnique({
            where: { token_code: tokenCode },
            include: { leader: { include: { area: true } } }
        });

        if (!token) throw new Error("TOKEN_NOT_FOUND");
        if (token.is_used) throw new Error("TOKEN_ALREADY_USED");

        return { isValid: true, leaderName: token.leader.name, areaName: token.leader.area.name };
    }

    // --- FICHAS DE INSCRIÇÃO ---
    async createRegistration(data: RegisterWorkerType) {
        // 1. TENTA ACHAR O LÍDER (Link da Área Multi-uso)
        const leader = await prisma.ecdWorkerLeader.findUnique({
            where: { id: data.token }
        });

        if (leader) {
            // TRAVA DE VAGAS NA INSCRIÇÃO: Verifica se a área já encheu
            if (leader.slots && leader.slots > 0) {
                const registrationsCount = await prisma.ecdWorkerRegistration.count({
                    where: {
                        leader_id: leader.id,
                        status: { not: 'RECUSADO' } // Conta todo mundo que está pendente ou aprovado
                    }
                });

                if (registrationsCount >= leader.slots) {
                    throw new Error(`As inscrições para a área de ${leader.name} já estão esgotadas.`);
                }
            }

            return await prisma.$transaction(async (tx) => {
                // Gera o token descartável interno para satisfazer a regra do banco
                const internalToken = await tx.ecdWorkerToken.create({
                    data: { leader_id: leader.id, is_used: true }
                });

                return await tx.ecdWorkerRegistration.create({
                    data: { // 👇 A propriedade 'data' obrigatória do Prisma
                        full_name: data.fullName,
                        gender: data.gender,
                        phone: data.phone,
                        age: data.age,
                        marital_status: data.maritalStatus,
                        has_served_before: data.hasServedBefore,
                        bringing_target: data.bringingTarget,
                        relative_participating: data.relativeParticipating,
                        previous_team: data.previousTeam ?? null,
                        target_name: data.targetName ?? null,
                        cell_leader: data.cellLeader ?? null,
                        relative_kinship: data.relativeKinship ?? null,
                        emergency_contact: data.emergencyContact ?? null,
                        emergency_phone: data.emergencyPhone ?? null,
                        health_issues: data.healthIssues ?? null,
                        dietary_restrictions: data.dietaryRestrictions ?? null,
                        observations: data.observations ?? null,
                        profile_photo_url: data.profilePhotoUrl ?? null,
                        receipt_photo_url: data.receiptPhotoUrl ?? null,
                        audio_record_url: data.audioRecordUrl ?? null,

                        lgpd_consent: data.lgpdConsent,
                        lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
                        lgpd_terms_version: data.lgpdTermsVersion || '1.0',

                        status: 'PENDENTE',
                        payment_status: 'PENDENTE',

                        // Vínculos automáticos da Área!
                        edition_id: leader.edition_id,
                        area_id: leader.area_id,
                        leader_id: leader.id,
                        token_id: internalToken.id
                    }
                });
            });
        }

        // 2. SE NÃO ACHOU O LÍDER, VERIFICA SE É O TOKEN DESCARTÁVEL (Fluxo Antigo)
        const tokenRecord = await prisma.ecdWorkerToken.findFirst({
            where: { token_code: data.token },
            include: { leader: true }
        });

        if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
        if (tokenRecord.is_used) throw new Error("TOKEN_ALREADY_USED");

        return await prisma.$transaction(async (tx) => {
            const registration = await tx.ecdWorkerRegistration.create({
                data: { // 👇 A propriedade 'data' obrigatória também precisa estar aqui
                    full_name: data.fullName,
                    gender: data.gender,
                    phone: data.phone,
                    age: data.age,
                    marital_status: data.maritalStatus,
                    has_served_before: data.hasServedBefore,
                    bringing_target: data.bringingTarget,
                    relative_participating: data.relativeParticipating,
                    previous_team: data.previousTeam ?? null,
                    target_name: data.targetName ?? null,
                    cell_leader: data.cellLeader ?? null,
                    relative_kinship: data.relativeKinship ?? null,
                    emergency_contact: data.emergencyContact ?? null,
                    emergency_phone: data.emergencyPhone ?? null,
                    health_issues: data.healthIssues ?? null,
                    dietary_restrictions: data.dietaryRestrictions ?? null,
                    observations: data.observations ?? null,
                    profile_photo_url: data.profilePhotoUrl ?? null,
                    receipt_photo_url: data.receiptPhotoUrl ?? null,
                    audio_record_url: data.audioRecordUrl ?? null,

                    lgpd_consent: data.lgpdConsent,
                    lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
                    lgpd_terms_version: data.lgpdTermsVersion || '1.0',

                    status: 'PENDENTE',
                    payment_status: 'PENDENTE',

                    // Vínculos de quem gerou o token original
                    area_id: tokenRecord.leader.area_id,
                    leader_id: tokenRecord.leader_id,
                    token_id: tokenRecord.id
                }
            });

            await tx.ecdWorkerToken.update({
                where: { id: tokenRecord.id },
                data: { is_used: true, usedAt: new Date() }
            });

            return registration;
        });
    }

    async getRegistrations() {
        return await prisma.ecdWorkerRegistration.findMany({
            include: {
                area: { select: { name: true } },
                leader: { select: { name: true } },
                edition: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async updateStatus(id: string, status: string, editionId: string | null) {
        return await prisma.ecdWorkerRegistration.update({
            where: { id },
            data: { status, edition_id: editionId }
        });
    }

    async updatePaymentStatus(id: string, status: string, receiptUrl?: string) {
        const dataToUpdate: any = { payment_status: status };

        if (receiptUrl) {
            dataToUpdate.receipt_photo_url = receiptUrl;
        }

        return await prisma.ecdWorkerRegistration.update({
            where: { id },
            data: dataToUpdate
        });
    }

    async deleteRegistration(id: string) {
        // 1. Busca a ficha no banco de dados para pegar as URLs das fotos
        const reg = await prisma.ecdWorkerRegistration.findUnique({ where: { id } });
        if (!reg) throw new Error("Ficha não encontrada.");

        // 2. DELETA AS IMAGENS DO MINIO (Se existirem)
        // Como a sua função deleteImage já trata os erros internamente, 
        // podemos simplesmente usar o await direto.
        if (reg.profile_photo_url) {
            await deleteImage(reg.profile_photo_url);
        }

        if (reg.receipt_photo_url) {
            await deleteImage(reg.receipt_photo_url);
        }

        if (reg.audio_record_url) {
            await deleteImage(reg.audio_record_url);
        }

        // 3. DELETA DO BANCO E LIBERA O TOKEN
        return await prisma.$transaction(async (tx) => {
            await tx.ecdWorkerRegistration.delete({ where: { id } });

            // Devolve o token para a "piscina" de vagas disponíveis
            if (reg.token_id) {
                await tx.ecdWorkerToken.update({
                    where: { id: reg.token_id },
                    data: { is_used: false }
                });
            }

            return { success: true };
        });
    }

    async createRegistrationGeneric(data: any) {
        // 1. Descobre qual é a Edição através do Token do link
        const edition = await prisma.ecdEdition.findFirst({
            where: { public_token: data.token }
        });

        if (!edition) throw new Error("Link da edição expirado ou inválido.");

        // 2. AUTO-REPARO: Garante que a área "Geral" existe no banco
        let generalArea = await prisma.ecdWorkerArea.findFirst({
            where: { name: 'Geral' }
        });

        if (!generalArea) {
            generalArea = await prisma.ecdWorkerArea.create({
                data: { name: 'Geral' }
            });
        }

        // 3. AUTO-REPARO: Garante que o líder "Administração Geral" existe PARA ESTA EDIÇÃO
        let adminLeader = await prisma.ecdWorkerLeader.findFirst({
            where: {
                name: 'Administração Geral',
                edition_id: edition.id // Procura especificamente na edição atual
            }
        });

        if (!adminLeader) {
            adminLeader = await prisma.ecdWorkerLeader.create({
                data: {
                    name: 'Administração Geral',
                    area_id: generalArea.id,
                    edition_id: edition.id
                }
            });
        }

        // Usamos Transaction para garantir que se a ficha falhar, o token não fica sobrando
        return await prisma.$transaction(async (tx) => {

            // 4. GERA UM TOKEN DESCARTÁVEL: Satisfaz a regra 1 para 1 do banco
            const internalToken = await tx.ecdWorkerToken.create({
                data: {
                    leader_id: adminLeader.id,
                    is_used: true // Já nasce usado, pois pertence a esta ficha
                }
            });

            // 5. CRIA A FICHA (Já vinculada à Edição certa!)
            return await tx.ecdWorkerRegistration.create({
                data: {
                    full_name: data.fullName,
                    gender: data.gender,
                    phone: data.phone,
                    age: data.age,
                    marital_status: data.maritalStatus,
                    has_served_before: data.hasServedBefore,
                    bringing_target: data.bringingTarget,
                    relative_participating: data.relativeParticipating,

                    previous_team: data.previousTeam ?? null,
                    target_name: data.targetName ?? null,
                    cell_leader: data.cellLeader ?? null,
                    emergency_contact: data.emergencyContact ?? null,
                    emergency_phone: data.emergencyPhone ?? null,
                    health_issues: data.healthIssues ?? null,
                    dietary_restrictions: data.dietaryRestrictions ?? null,
                    observations: data.observations ?? null,
                    profile_photo_url: data.profilePhotoUrl ?? null,
                    receipt_photo_url: data.receiptPhotoUrl ?? null,
                    audio_record_url: data.audioRecordUrl ?? null,

                    status: 'PENDENTE',
                    payment_status: 'PENDENTE',

                    // VÍNCULOS DE ARQUITETURA
                    edition_id: edition.id,
                    token_id: internalToken.id,
                    leader_id: adminLeader.id,
                    area_id: adminLeader.area_id
                }
            });
        });
    }

    async approveRegistration(id: string, editionId: string, areaId: string, leaderId: string, paymentStatus: string, receiptUrl?: string) {

        // 1. VALIDAÇÃO DO LIMITE DE TRABALHADORES DA EDIÇÃO
        const edition = await prisma.ecdEdition.findUnique({
            where: { id: editionId }
        });

        if (!edition) throw new Error("Edição não encontrada.");

        // Verifica se a edição possui um limite cadastrado (maior que zero)
        if (edition.worker_slots && edition.worker_slots > 0) {

            // Conta quantos voluntários JÁ ESTÃO APROVADOS nesta edição
            const approvedCount = await prisma.ecdWorkerRegistration.count({
                where: {
                    edition_id: editionId,
                    status: 'APROVADO'
                }
            });

            // Bloqueia a aprovação se o limite já foi atingido
            if (approvedCount >= edition.worker_slots) {
                throw new Error(`Aprovação bloqueada! O limite de ${edition.worker_slots} trabalhadores para esta edição já foi atingido.`);
            }
        }

        // 1.5. VALIDAÇÃO DO LIMITE DE VAGAS DO LÍDER (A TRAVA NOVA!)
        const leader = await prisma.ecdWorkerLeader.findUnique({
            where: { id: leaderId }
        });

        if (!leader) throw new Error("Líder não encontrado.");

        // Verifica se o líder possui um limite definido
        if (leader.slots && leader.slots > 0) {

            // Conta quantos voluntários JÁ ESTÃO APROVADOS para este líder
            const approvedLeaderCount = await prisma.ecdWorkerRegistration.count({
                where: {
                    leader_id: leaderId,
                    status: 'APROVADO' // Conta apenas quem realmente está dentro da equipe
                }
            });

            // Bloqueia a aprovação se a cota deste líder já foi atingida
            if (approvedLeaderCount >= leader.slots) {
                throw new Error(`Aprovação bloqueada! O líder ${leader.name} já preencheu todas as ${leader.slots} vagas.`);
            }
        }

        // 2. SE PASSOU DA VALIDAÇÃO, CONTINUA O FLUXO NORMAL
        const dataToUpdate: any = {
            status: 'APROVADO',
            edition_id: editionId,
            area_id: areaId,
            leader_id: leaderId,
            payment_status: paymentStatus
        };

        if (receiptUrl) {
            dataToUpdate.receipt_photo_url = receiptUrl;
        }

        return await prisma.ecdWorkerRegistration.update({
            where: { id },
            data: dataToUpdate
        });
    }
    // Atualiza os dados de texto da ficha (Usado para corrigir dados do Áudio)
    async updateRegistrationData(id: string, data: any) {
        return await prisma.ecdWorkerRegistration.update({
            where: { id },
            data: {
                full_name: data.full_name,
                gender: data.gender,
                age: Number(data.age),
                phone: data.phone,
                marital_status: data.marital_status,
                emergency_contact: data.emergency_contact,
                emergency_phone: data.emergency_phone,
                health_issues: data.health_issues,
                observations: data.observations
            }
        });
    }

    async generateWorkerLeaderPdf(leaderId: string) {
        const leader = await prisma.ecdWorkerLeader.findUnique({
            where: { id: leaderId },
            include: { area: true, edition: true }
        });

        if (!leader) throw new Error("Líder não encontrado.");

        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        const rowHeight = 230;
        const startY = 40;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

        const publicUrl = `${baseUrl}/ecd/cadastro-trabalhador?token=${leader.id}`;
        const publicQrBuffer = await QRCode.toBuffer(publicUrl, { margin: 1, width: 110 });

        const getAreaColor = (areaName: string) => {
            const name = areaName.toUpperCase().trim();
            const colors: Record<string, string> = {
                'INTERCESSÃO': '#dc2626',
                'COZINHA': '#2563eb',
                'LOUVOR': '#854d0e',
                'CANTINA': '#eab308',
                'ORNAMENTAÇÃO': '#0ea5e9',
                'MULTIMÍDIA': '#991b1b',
                'CORREIOS': '#1e293b',
                'APOIO': '#9333ea',
            };
            return colors[name] || '#4f46e5';
        };

        const areaColor = getAreaColor(leader.area?.name || 'Geral');

        // 👇 Loop fixo: Sempre desenha 3 fichas para preencher exatamente 1 folha A4
        for (let index = 0; index < 3; index++) {
            const currentY = startY + (index * rowHeight);

            doc.rect(30, currentY, 535, 210).strokeColor('#cbd5e1').lineWidth(1).stroke();

            // Título sem numeração sequencial
            doc.rect(30, currentY, 535, 35).fill(areaColor);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
                .text(`FICHA DE INSCRIÇÃO - EQUIPE DE TRABALHO`, 45, currentY + 12);

            doc.moveTo(380, currentY + 35).lineTo(380, currentY + 240).strokeColor('#e2e8f0').lineWidth(1).dash(5, { space: 5 }).stroke();
            doc.undash();

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('DADOS DA LIDERANÇA', 45, currentY + 50);

            doc.fillColor('#475569').font('Helvetica').fontSize(10);
            doc.text(`Área: `, 45, currentY + 68, { continued: true }).font('Helvetica-Bold').text((leader.area?.name || 'Geral').toUpperCase());
            doc.font('Helvetica').text(`Líder Responsável: `, 45, currentY + 83, { continued: true }).font('Helvetica-Bold').text(leader.name);

            doc.moveTo(45, currentY + 105).lineTo(360, currentY + 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('COMO GARANTIR SUA VAGA NA EQUIPE:', 45, currentY + 115);
            doc.fillColor('#475569').font('Helvetica').fontSize(9)
                .text('1. Escaneie o QR Code ao lado com a câmera do seu celular.', 45, currentY + 130)
                .text('2. Preencha seus dados de saúde, logística e anexe sua foto de perfil.', 45, currentY + 145)
                .text('3. Após o envio, você entrará na fila de aprovação da sua liderança.', 45, currentY + 160);

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('ENTREGUE PARA (NOME):', 395, currentY + 45);
            doc.moveTo(395, currentY + 65).lineTo(545, currentY + 65).strokeColor('#cbd5e1').lineWidth(1).stroke();

            doc.image(publicQrBuffer, 415, currentY + 80, { width: 110 });
            doc.link(415, currentY + 80, 110, 110, publicUrl);

            doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
                .text(`Token: ${leader.id.substring(0, 8).toUpperCase()}`, 395, currentY + 200, { align: 'center', width: 150 });
        }

        doc.end();
        return doc;
    }
}