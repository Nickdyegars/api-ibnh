import bcrypt from 'bcrypt';
import { prisma } from '../../shared/database/prisma.js';

export class AuthService {
  async register(data: { name: string; email: string; password: string; role: string; ministry: string }) {
    
    const userExists = await prisma.user.findUnique({ where: { email: data.email } });
    if (userExists) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    let level = 2;
    if (data.role === 'admin') level = 0;
    if (data.role === 'leader') level = 1;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        user_level: level,
        ministry_access: data.ministry,
        profile: {
          create: { full_name: data.name }
        }
      },
      include: { profile: true }
    });

    return newUser;
  }

  async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new Error('Credenciais inválidas.');

    const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isPasswordValid) throw new Error('Credenciais inválidas.');

    return user;
  }
}