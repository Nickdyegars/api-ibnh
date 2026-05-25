// src/modules/landing-config/landing-config.service.ts
import { prisma } from '../../shared/database/prisma.js';
import { UpdateLandingConfigType } from './landing-config.schemas.js';

export class LandingConfigService {

    async getConfig() {
        let config = await prisma.landingPageConfig.findFirst();

        if (!config) {
            config = await prisma.landingPageConfig.create({
                data: {
                    show_business_form: true,
                    business_form_url: "",
                    // 👇 Valores padrão na criação
                    show_whatsapp: true,
                    whatsapp_number: "5573999999999" // Área local de Itamaraju como fallback
                }
            });
        }

        return config;
    }

    async updateConfig(data: UpdateLandingConfigType) {
        const config = await this.getConfig();
        const dataToUpdate: any = {};

        if (data.show_business_form !== undefined) {
            dataToUpdate.show_business_form = data.show_business_form;
        }

        if (data.business_form_url !== undefined) {
            dataToUpdate.business_form_url = data.business_form_url === "" ? null : data.business_form_url;
        }

        // 👇 ADICIONADO: Atualização do Toggle do WhatsApp 👇
        if (data.show_whatsapp !== undefined) {
            dataToUpdate.show_whatsapp = data.show_whatsapp;
        }

        // 👇 ADICIONADO: Atualização do Número do WhatsApp 👇
        if (data.whatsapp_number !== undefined) {
            dataToUpdate.whatsapp_number = data.whatsapp_number === "" ? null : data.whatsapp_number;
        }

        return await prisma.landingPageConfig.update({
            where: { id: config.id },
            data: dataToUpdate 
        });
    }
}