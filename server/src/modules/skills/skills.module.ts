import { Global, Module } from "@nestjs/common";
import { CharactersModule } from "../characters/characters.module";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";

@Global()
@Module({
  imports: [CharactersModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
