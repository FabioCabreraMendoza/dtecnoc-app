import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken } from "@/lib/auth";

// Rate limiting por cuenta: el login no tenía NINGUNA protección contra
// fuerza bruta (sin límite de intentos, sin delay, sin captcha). Se bloquea
// la cuenta por un rato tras varios intentos fallidos seguidos.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (admin.locked_until && admin.locked_until > new Date()) {
      const minutesLeft = Math.ceil(
        (admin.locked_until.getTime() - Date.now()) / 60_000
      );
      return NextResponse.json(
        {
          error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        },
        { status: 429 }
      );
    }

    const valid = await comparePassword(password, admin.password);
    if (!valid) {
      const attempts = admin.failed_login_attempts + 1;
      const lockingNow = attempts >= MAX_ATTEMPTS;
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failed_login_attempts: lockingNow ? 0 : attempts,
          locked_until: lockingNow
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : null,
        },
      });
      return NextResponse.json(
        {
          error: lockingNow
            ? `Demasiados intentos fallidos. Intenta de nuevo en ${LOCKOUT_MINUTES} minuto(s).`
            : "Credenciales inválidas",
        },
        { status: lockingNow ? 429 : 401 }
      );
    }

    // Login correcto: limpia cualquier racha de intentos fallidos previa.
    if (admin.failed_login_attempts > 0 || admin.locked_until) {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { failed_login_attempts: 0, locked_until: null },
      });
    }

    const token = signToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: "ADMIN",
    });

    // El token viaja solo en la cookie httpOnly de abajo, no en el body —
    // el front ya no lo guarda en localStorage, así que no hace falta
    // devolverlo aquí también.
    const response = NextResponse.json({
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });

    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
