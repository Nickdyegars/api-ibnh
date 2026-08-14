import { prisma } from '../../shared/database/prisma.js';
import { WorkerAreaType, WorkerLeaderType, RegisterWorkerType } from './ecd-workers.schemas.js';
import { deleteImage } from '../../shared/storage/minio.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';

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

    // ==========================================
    // RELATÓRIO DE TRABALHADORES (COM GRÁFICO E LISTA DINÂMICA)
    // ==========================================
    async generateTrabalhadoresPdf() {
        // 1. Busca a edição atual
        const currentEdition = await prisma.ecdEdition.findFirst({
            orderBy: { created_at: 'desc' }
        });

        if (!currentEdition) {
            throw new Error("Nenhuma edição ativa encontrada.");
        }

        // 2. Busca APENAS os trabalhadores APROVADOS nesta edição
        let trabalhadores = await prisma.ecdWorkerRegistration.findMany({
            where: {
                edition_id: currentEdition.id,
                status: 'APROVADO'
            },
            include: {
                area: true,
                leader: true
            }
        });

        if (trabalhadores.length === 0) {
            throw new Error("Nenhum voluntário aprovado encontrado para esta edição.");
        }

        // 3. ORDENAÇÃO ALFABÉTICA ABSOLUTA
        trabalhadores.sort((a, b) => {
            const nomeA = a.full_name || '';
            const nomeB = b.full_name || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        // ==========================================
        // CÁLCULO DE DEMOGRAFIA PARA O GRÁFICO
        // ==========================================
        let totalHomens = 0;
        let totalMulheres = 0;
        trabalhadores.forEach(w => {
            if (w.gender === 'M') totalHomens++;
            else totalMulheres++; // Assume 'F' para o restante
        });
        const total = trabalhadores.length;
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
                .text('Proporção de Gênero na Equipe:', startX, currentY);

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
                .text(`RELAÇÃO DE TRABALHADORES APROVADOS - ${currentEdition.name.toUpperCase()}`, 40, 40, { align: 'center', width: 515 });
            doc.fontSize(10).font('Helvetica').fillColor('#64748b')
                .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Equipe Total: ${total}`, 40, 60, { align: 'center', width: 515 });

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
                .text('FOTO', 45, top + 6, { width: 55, align: 'center' })
                .text('DADOS PESSOAIS', 110, top + 6, { width: 140 })
                .text('ÁREA / LÍDER', 260, top + 6, { width: 110 })
                .text('CONTATO', 380, top + 6, { width: 75 })
                .text('ALVO(S)', 465, top + 6, { width: 90 });
            doc.y = top + 24;
        };

        // Desenha a primeira página com o gráfico
        drawPageTitle(true);
        drawTableHeader();

        for (const worker of trabalhadores) {
            // ==========================================
            // CÁLCULO DE ALTURA DINÂMICA DA LINHA
            // ==========================================
            // Define a fonte que será usada no texto de alvos para medir com precisão
            doc.font('Helvetica').fontSize(7);

            let rowHeight = 70; // Altura mínima padrão para caber a foto

            // Se houverem muitos nomes, o PDFKit calcula a altura que o bloco de texto precisará
            if (worker.bringing_target && worker.target_name) {
                const textHeight = doc.heightOfString(worker.target_name, { width: 90 });
                // 28 (posição Y inicial do texto) + altura do texto + 10 (margem de segurança)
                const neededHeight = 28 + textHeight + 10;
                if (neededHeight > rowHeight) {
                    rowHeight = neededHeight;
                }
            }

            // Quebra de página se não houver espaço para a altura da linha atual
            if (doc.y + rowHeight > 780) {
                doc.addPage();
                drawPageTitle(false); // Falso para não repetir o gráfico
                drawTableHeader();
            }

            const rowY = doc.y;

            // ==========================================
            // TRATAMENTO DA IMAGEM COM SHARP
            // ==========================================
            let imgBuffer: Buffer | null = null;
            if (worker.profile_photo_url) {
                try {
                    const response = await fetch(worker.profile_photo_url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        imgBuffer = await sharp(Buffer.from(arrayBuffer))
                            .resize(100, 100, { fit: 'cover' })
                            .jpeg({ quality: 100 })
                            .toBuffer();
                    }
                } catch (err) {
                    console.warn(`[PDF] Erro ao carregar foto de ${worker.full_name}:`, err);
                }
            }

            // ==========================================
            // DESENHO DA LINHA
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

            // 2. Coluna: DADOS PESSOAIS
            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9)
                .text(worker.full_name || '-', 110, rowY + 15, { width: 140, ellipsis: true });
            doc.fillColor('#64748b').font('Helvetica').fontSize(8)
                .text(`${worker.age || '-'} anos  |  Sexo: ${worker.gender === 'M' ? 'Masc' : 'Fem'}`, 110, rowY + 28, { width: 140 });

            // 3. Coluna: ÁREA / LÍDER
            const areaName = worker.area?.name || 'GERAL';
            const leaderName = worker.leader?.name || 'Líder Não Informado';

            doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(8)
                .text(areaName.toUpperCase(), 260, rowY + 15, { width: 110, ellipsis: true });
            doc.fillColor('#334155').font('Helvetica').fontSize(8)
                .text(leaderName, 260, rowY + 28, { width: 110, ellipsis: true });

            // 4. Coluna: CONTATO
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8)
                .text(worker.phone || '-', 380, rowY + 20, { width: 75 });

            // 5. Coluna: ALVO(S) (Sem limite de altura e sem reticências)
            if (worker.bringing_target && worker.target_name) {
                doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(8)
                    .text('Sim', 465, rowY + 15, { width: 90 });
                doc.fillColor('#475569').font('Helvetica').fontSize(7)
                    .text(worker.target_name, 465, rowY + 28, { width: 90 }); // A string inteira será impressa e quebrará linhas
            } else {
                doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(8)
                    .text('Nenhum', 465, rowY + 20, { width: 90 });
            }

            // Linha divisória inferior adaptada para abraçar todo o texto
            doc.moveTo(40, rowY + rowHeight).lineTo(555, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();

            // Avança o Y pela altura dinâmica recalculada
            doc.y = rowY + rowHeight;
        }

        doc.end();
        return doc;
    }
}