import { Module } from "@nestjs/common";
import { EconomyController } from "./economy.controller";
import { EconomyService } from "./economy.service";
import { CharactersModule } from "../characters/characters.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, CharactersModule],
  controllers: [EconomyController],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
