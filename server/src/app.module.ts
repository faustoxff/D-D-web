import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CharactersModule } from "./modules/characters/characters.module";
import { ZonesModule } from "./modules/zones/zones.module";
import { QuestsModule } from "./modules/quests/quests.module";
import { EconomyModule } from "./modules/economy/economy.module";
import { EncountersModule } from "./modules/encounters/encounters.module";
import { DmModule } from "./modules/dm/dm.module";
import { SkillsModule } from "./modules/skills/skills.module";

@Module({
  imports: [
    DbModule,
    AuthModule,
    CharactersModule,
    ZonesModule,
    QuestsModule,
    EconomyModule,
    EncountersModule,
    DmModule,
    SkillsModule,
  ],
})
export class AppModule {}
