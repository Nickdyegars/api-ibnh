import { prisma } from '../../database/prisma.js';

export class AuditService {
    static async log(userId: string, action: string, resource: string, resourceId?: string, details?: any) {
        try {
            await prisma.auditLog.create({
                data: {
                    user_id: userId,
                    action,
                    resource,
                    // 👇 Transformamos o undefined do TypeScript no null do banco de dados 👇
                    resource_id: resourceId ?? null, 
                    details: details ?? null
                }
            });
        } catch (error) {
            console.error("Falha ao gravar Log de Auditoria:", error);
        }
    }
}