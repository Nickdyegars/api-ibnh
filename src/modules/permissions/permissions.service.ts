// src/modules/permissions/permissions.service.ts
import { prisma } from '../../shared/database/prisma.js';

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin_geral: [
    'dashboard', 'membros', 'escalas', 'ministerios', 'congregacoes',
    'site', 'usuarios', 'auditoria', 'financeiro', 'empreendedores',
    'ecd', 'galeria', 'repertorio', 'ferramentas', 'configuracoes'
  ],
  admin_congregacao: [
    'dashboard', 'membros', 'escalas', 'ministerios', 'usuarios', 'ferramentas'
  ],
  lider_ministerio: [
    'dashboard', 'membros', 'escalas', 'ministerios', 'ferramentas'
  ],
  voluntario: [
    'escalas', 'ferramentas'
  ]
};

export class PermissionsService {
  async getRolePermissions(): Promise<Record<string, string[]>> {
    try {
      const records: any[] = await prisma.$queryRawUnsafe(`
        SELECT role_permissions FROM app.system_permissions WHERE id = 'default' LIMIT 1
      `);

      if (records && records.length > 0 && records[0].role_permissions) {
        const perms = records[0].role_permissions;
        // Garante que admin_geral sempre tem configuracoes
        if (perms.admin_geral && !perms.admin_geral.includes('configuracoes')) {
          perms.admin_geral.push('configuracoes');
        }
        return perms;
      }

      // Se não existir, insere e retorna os padrões
      await prisma.$executeRawUnsafe(
        `INSERT INTO app.system_permissions (id, role_permissions, updated_at)
         VALUES ('default', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET role_permissions = $1::jsonb, updated_at = NOW()`,
        JSON.stringify(DEFAULT_ROLE_PERMISSIONS)
      );

      return DEFAULT_ROLE_PERMISSIONS;
    } catch (error) {
      console.error('Erro ao buscar role_permissions do banco:', error);
      return DEFAULT_ROLE_PERMISSIONS;
    }
  }

  async updateRolePermissions(newPermissions: Record<string, string[]>): Promise<Record<string, string[]>> {
    // Validação de segurança: admin_geral nunca perde configuracoes ou usuarios
    const safePermissions = {
      ...newPermissions,
      admin_geral: Array.from(new Set([
        ...(newPermissions.admin_geral || []),
        'configuracoes',
        'usuarios'
      ]))
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO app.system_permissions (id, role_permissions, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET role_permissions = $1::jsonb, updated_at = NOW()`,
      JSON.stringify(safePermissions)
    );

    return safePermissions;
  }

  async updateUserCustomPermissions(userId: string, customPermissions: string[]) {
    // Remove duplicados e strings vazias
    const cleanList = Array.from(new Set((customPermissions || []).filter(Boolean)));

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { custom_permissions: cleanList },
      include: {
        profile: true,
        congregation: { select: { id: true, name: true, is_main: true } }
      }
    });

    let roleName = 'voluntario';
    if (updatedUser.user_level === 0) roleName = 'admin_geral';
    else if (updatedUser.user_level === 1) roleName = 'admin_congregacao';
    else if (updatedUser.user_level === 2) roleName = 'lider_ministerio';

    return {
      id: updatedUser.id,
      name: updatedUser.profile?.full_name || updatedUser.email.split('@')[0],
      email: updatedUser.email,
      level: updatedUser.user_level,
      user_level: updatedUser.user_level,
      role: roleName,
      ministry: updatedUser.ministry_access,
      congregation_id: updatedUser.congregation_id,
      congregation: updatedUser.congregation,
      custom_permissions: updatedUser.custom_permissions || []
    };
  }

  async getUserCustomPermissions(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true
      }
    });

    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    return {
      userId: user.id,
      name: user.profile?.full_name || user.email,
      email: user.email,
      level: user.user_level,
      user_level: user.user_level,
      custom_permissions: user.custom_permissions || []
    };
  }
}
