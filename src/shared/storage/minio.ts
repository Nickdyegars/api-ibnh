// src/shared/storage/minio.ts
import * as Minio from 'minio';
import dotenv from 'dotenv';
import path from 'path';

// Carrega as variáveis (ajuste o path se a sua estrutura de pastas for diferente)
dotenv.config(); 

export const BUCKET_NAME = process.env.MINIO_BUCKET || 'ibnh-uploads';
export const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || '';

// Cliente ÚNICO para Upload (Usa IP Interno do VPS)
export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

// Garante que o Bucket existe e tem permissão de leitura pública
export async function setupMinioBucket() {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
            
            const policy = {
                Version: '2012-10-17',
                Statement: [{
                    Action: ['s3:GetObject'],
                    Effect: 'Allow',
                    Principal: '*',
                    Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
                }]
            };
            await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
            console.log(`✅ Bucket '${BUCKET_NAME}' criado e configurado como público.`);
        } else {
            console.log(`✅ Conectado ao bucket MinIO: '${BUCKET_NAME}'`);
        }
    } catch (error) {
        console.error("❌ Erro ao configurar MinIO:", error);
    }
}

// Faz o upload e devolve o link usando a MINIO_PUBLIC_URL
// minio.ts
export async function uploadImage(fileName: string, fileBuffer: Buffer, mimeType: string, folder: string = 'geral') {
    const safeFileName = `${Date.now()}-${fileName.replace(/\s+/g, '-')}`;
    
    // O Segredo: Adicionamos o nome da pasta antes do ficheiro!
    const objectPath = `${folder}/${safeFileName}`;
    
    await minioClient.putObject(BUCKET_NAME, objectPath, fileBuffer, undefined, {
        'Content-Type': mimeType
    });

    return `${PUBLIC_URL}/${BUCKET_NAME}/${objectPath}`;
}

export async function deleteImage(imageUrl: string) {
    if (!imageUrl) return;

    try {
        // Ex: https://files.ibnh.com.br/ibnh-uploads/pastores/123-foto.jpg
        const bucketUrl = `${PUBLIC_URL}/${BUCKET_NAME}/`;
        
        // Verifica se a imagem pertence mesmo ao nosso MinIO
        if (imageUrl.startsWith(bucketUrl)) {
            // Remove a parte inicial e fica apenas com "pastores/123-foto.jpg"
            const objectPath = imageUrl.replace(bucketUrl, ''); 
            await minioClient.removeObject(BUCKET_NAME, objectPath);
            console.log(`🗑️ Imagem apagada do MinIO: ${objectPath}`);
        }
    } catch (error) {
        console.error(`❌ Erro ao apagar imagem do MinIO (${imageUrl}):`, error);
    }
}