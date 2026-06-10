// src/modules/landing-config/landing-config.controller.ts
import { LandingConfigService } from './landing-config.service.js';
import { updateLandingConfigSchema } from './landing-config.schemas.js';
// 👇 Importando o nosso serviço de Auditoria
import { AuditService } from '../../shared/services/audit/audit.service.js';

export class LandingConfigController {
    private landingConfigService = new LandingConfigService();

    // Rota Pública
    async getPublicConfig(request: any, reply: any) {
        try {
            const config = await this.landingConfigService.getConfig();
            return reply.status(200).send(config);
        } catch (error) {
            console.error("Erro ao buscar Landing Page Config:", error);
            return reply.status(500).send({ error: "Erro interno ao carregar configurações." });
        }
    }

    async updateConfig(request: any, reply: any) {
        try {
            const requester = request.user as any;
            
            // Validação do Zod
            const data = updateLandingConfigSchema.parse(request.body);
            
            const updatedConfig = await this.landingConfigService.updateConfig(data) as any;
            
            // 📝 LOG: Alteração nas configurações globais da Landing Page
            AuditService.log(requester.sub, 'UPDATE', 'LANDING_CONFIG', updatedConfig?.id, data);

            return reply.status(200).send(updatedConfig);
        } catch (error: any) {
            console.error("Erro ao atualizar Landing Page Config:", error);
            
            return reply.status(400).send({ 
                error: "Dados inválidos.", 
                details: error.errors 
            });
        }
    }
}