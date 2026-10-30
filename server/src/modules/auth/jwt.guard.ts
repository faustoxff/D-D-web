import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { userId: string }>();
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();

    const token = auth.slice(7);
    const user = await this.auth.verify(token);
    if (!user) throw new UnauthorizedException();

    req.userId = user.id;
    return true;
  }
}
