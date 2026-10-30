import { Module } from "@nestjs/common";
import { QuestsController } from "./quests.controller";
import { QuestsService } from "./quests.service";
import { AuthModule } from "../auth/auth.module";
import { CharactersModule } from "../characters/characters.module";

@Module({
  imports: [AuthModule, CharactersModule],
  controllers: [QuestsController],
  providers: [QuestsService],
  exports: [QuestsService],
})
export class QuestsModule {}
