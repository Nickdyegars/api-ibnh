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

    await prisma.$executeRawUnsafe(
      `UPDATE auth.users 
       SET custom_permissions = $1::text[] 
       WHERE id = $2::uuid`,
      cleanList,
      userId
    );

    const updatedUserRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT u.id, u.email, u.user_level, u.ministry_access, u.congregation_id, u.custom_permissions,
              p.full_name as name
       FROM auth.users u
       LEFT JOIN app.user_profiles p ON p.user_id = u.id
       WHERE u.id = $1::uuid`,
      userId
    );

    if (!updatedUserRows || updatedUserRows.length === 0) {
      throw new Error('Usuário não encontrado.');
    }

    const u = updatedUserRows[0];
    let roleName = 'voluntario';
    if (u.user_level === 0) roleName = 'admin_geral';
    else if (u.user_level === 1) roleName = 'admin_congregacao';
    else if (u.user_level === 2) roleName = 'lider_ministerio';

    return {
      id: u.id,
      name: u.name || u.email.split('@')[0],
      email: u.email,
      level: u.user_level,
      role: roleName,
      ministry: u.ministry_access,
      congregation_id: u.congregation_id,
      custom_permissions: u.custom_permissions || []
    };
  }

  async getUserCustomPermissions(userId: string) {
    const userRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT u.id, u.email, u.user_level, u.custom_permissions, p.full_name as name
       FROM auth.users u
       LEFT JOIN app.user_profiles p ON p.user_id = u.id
       WHERE u.id = $1::uuid`,
      userId
    );

    if (!userRows || userRows.length === 0) {
      throw new Error('Usuário não encontrado.');
    }

    const u = userRows[0];
    return {
      userId: u.id,
      name: u.name || u.email,
      email: u.email,
      level: u.user_level,
      custom_permissions: u.custom_permissions || []
    };
  }
}
