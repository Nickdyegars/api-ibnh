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
        return await prisma.ecdWorkerArea.delete({ where: { id } });
    }

    // --- LÍDERES E TOKENS ---
    async getLeaders() {
        return await prisma.ecdWorkerLeader.findMany({
            include: { area: true, tokens: true },
            orderBy: { name: 'asc' }
        });
    }

    async createLeader(data: WorkerLeaderType) {
        return await prisma.$transaction(async (tx) => {
            const leader = await tx.ecdWorkerLeader.create({
                data: { name: data.name, area_id: data.areaId }
            });

            const tokens = Array.from({ length: data.slots }).map(() => ({
                leader_id: leader.id
            }));

            await tx.ecdWorkerToken.createMany({ data: tokens });
            return leader;
        });
    }

    async deleteLeader(id: string) {
        return await prisma.ecdWorkerLeader.delete({ where: { id } });
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
        const tokenRecord = await prisma.ecdWorkerToken.findUnique({
            where: { token_code: data.token },
            include: { leader: true }
        });

        if (!tokenRecord) throw new Error("TOKEN_NOT_FOUND");
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

                    // 👇 A conversão de undefined para null acontece aqui 👇
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

    async createRegistrationGeneric(data: Omit<RegisterWorkerType, 'token'>) {
        return await prisma.$transaction(async (tx) => {
            // 1. Procura se existe uma "Área Geral". Se não existir, cria na hora.
            let areaGeral = await tx.ecdWorkerArea.findFirst({ where: { name: 'Geral' } });
            if (!areaGeral) {
                areaGeral = await tx.ecdWorkerArea.create({ data: { name: 'Geral' } });
            }

            // 2. Procura se existe o líder "Administração Geral". Se não existir, cria na hora.
            let liderGeral = await tx.ecdWorkerLeader.findFirst({ where: { name: 'Administração Geral' } });
            if (!liderGeral) {
                liderGeral = await tx.ecdWorkerLeader.create({
                    data: { name: 'Administração Geral', area_id: areaGeral.id }
                });
            }

            // 3. O PULO DO GATO: Cria um token EXCLUSIVO para essa pessoa instantaneamente
            const novoToken = await tx.ecdWorkerToken.create({
                data: {
                    leader_id: liderGeral.id,
                    is_used: true, // Já nasce como usado
                    usedAt: new Date()
                }
            });

            // 4. Salva a ficha vinculando ao token único recém-criado
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
                    relative_kinship: data.relativeKinship ?? null,
                    emergency_contact: data.emergencyContact ?? null,
                    emergency_phone: data.emergencyPhone ?? null,
                    health_issues: data.healthIssues ?? null,
                    observations: data.observations ?? null,

                    profile_photo_url: data.profilePhotoUrl ?? null,
                    receipt_photo_url: data.receiptPhotoUrl ?? null,

                    status: 'PENDENTE',
                    payment_status: 'PENDENTE',
                    token_id: novoToken.id, // O Prisma não vai reclamar, pois é um token 100% novo!
                    leader_id: liderGeral.id,
                    area_id: areaGeral.id
                }
            });
        });
    }

    async approveRegistration(id: string, editionId: string, areaId: string, leaderId: string, paymentStatus: string, receiptUrl?: string) {
        const dataToUpdate: any = {
            status: 'APROVADO',
            edition_id: editionId,
            area_id: areaId,
            leader_id: leaderId,
            payment_status: paymentStatus // Atualiza o status financeiro junto!
        };

        if (receiptUrl) {
            dataToUpdate.receipt_photo_url = receiptUrl;
        }

        return await prisma.ecdWorkerRegistration.update({
            where: { id },
            data: dataToUpdate
        });
    }
}