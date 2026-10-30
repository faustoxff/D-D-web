import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Verifies the JWTs issued by Neon Managed Better Auth (EdDSA, 15 min) against the
 * public JWKS endpoint. Used by both the REST guard and the Colyseus room.
 */
@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private issuer = "";

  private init() {
    if (this.jwks) return;
    const base = process.env["NEON_AUTH_BASE_URL"];
    if (!base) throw new Error("NEON_AUTH_BASE_URL is not set (server/.env)");
    this.jwks = createRemoteJWKSet(new URL(`${base.replace(/\/$/, "")}/.well-known/jwks.json`));
    this.issuer = new URL(base).origin;
  }

  async verify(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    try {
      this.init();
      const { payload } = await jwtVerify(token, this.jwks!, { issuer: this.issuer });
      if (typeof payload.sub !== "string") return null;
      if (payload["banned"] === true) return null;
      const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
      return email ? { id: payload.sub, email } : { id: payload.sub };
    } catch {
      return null;
    }
  }
}
