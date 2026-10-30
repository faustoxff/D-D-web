import { Global, Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtGuard } from "./jwt.guard";

@Global()
@Module({
  providers: [AuthService, JwtGuard],
  exports: [AuthService, JwtGuard],
})
export class AuthModule {}
