import { prisma } from '../../shared/database/prisma.js';
import { WorkerAreaType, WorkerLeaderType, RegisterWorkerType } from './ecd-workers.schemas.js';
import { deleteImage } from '../../shared/storage/minio.js';

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
        // 1. Tenta encontrar o token na tabela de líderes (Link do Líder)
        const tokenRecord = await prisma.ecdWorkerToken.findFirst({
            where: { token_code: data.token },
            include: { leader: true }
        });

        // 2. A MÁGICA DA UNIFICAÇÃO
        if (!tokenRecord) {
            const isEditionToken = await prisma.ecdEdition.findFirst({
                where: { public_token: data.token }
            });

            if (isEditionToken) {
                // Bingo! É o link geral. Encaminha os dados para o método genérico e finaliza
                // Os dados da LGPD já estão dentro de 'data', então o método genérico também vai recebê-los
                return await this.createRegistrationGeneric(data);
            }

            // Se não achar em nenhuma das duas tabelas, aí sim dispara o erro para o Front-end
            throw new Error("TOKEN_NOT_FOUND");
        }

        // 3. Se achou o token de líder, segue o fluxo normal de links individuais...
        if (tokenRecord.is_used) throw new Error("TOKEN_ALREADY_USED");

        return await prisma.$transaction(async (tx) => {
            const registration = await tx.ecdWorkerRegistration.create({
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
                    relative_kinship: data.relativeKinship ?? null,
                    emergency_contact: data.emergencyContact ?? null,
                    emergency_phone: data.emergencyPhone ?? null,
                    health_issues: data.healthIssues ?? null,
                    dietary_restrictions: data.dietaryRestrictions ?? null,
                    observations: data.observations ?? null,

                    profile_photo_url: data.profilePhotoUrl ?? null,
                    receipt_photo_url: data.receiptPhotoUrl ?? null,
                    audio_record_url: data.audioRecordUrl ?? null,

                    // 👇 SALVANDO A AUDITORIA LGPD AQUI 👇
                    lgpd_consent: data.lgpdConsent,
                    lgpd_consent_date: data.lgpdConsentDate ? new Date(data.lgpdConsentDate) : new Date(),
                    lgpd_terms_version: data.lgpdTermsVersion || '1.0',

                    status: 'PENDENTE',
                    payment_status: 'PENDENTE',
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
}