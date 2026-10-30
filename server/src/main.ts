import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ZoneRoom } from "./colyseus/rooms/ZoneRoom";
import { CharactersService } from "./modules/characters/characters.service";
import { EncountersService } from "./modules/encounters/encounters.service";
import { QuestsService } from "./modules/quests/quests.service";
import { EconomyService } from "./modules/economy/economy.service";
import { DmService } from "./modules/dm/dm.service";
import { DbService } from "./db/db.service";
import { AuthService } from "./modules/auth/auth.service";
import { SkillsService } from "./modules/skills/skills.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  });

  await app.listen(3000);
  console.log("NestJS API listening on :3000");

  // Keep the items table in sync with the shared catalog
  await app.get(EconomyService).syncCatalog();

  // Pull services from NestJS DI and inject into Colyseus rooms
  const services = {
    characters: app.get(CharactersService),
    encounters: app.get(EncountersService),
    quests: app.get(QuestsService),
    economy: app.get(EconomyService),
    dm: app.get(DmService),
    skills: app.get(SkillsService),
    db: app.get(DbService),
    auth: app.get(AuthService),
  };

  const STARTING_ZONE_ID = "a1000000-0000-0000-0000-000000000001";

  const gameServer = new Server({
    transport: new WebSocketTransport(),
  });

  gameServer.define("zone_room", ZoneRoom, {
    zoneId: STARTING_ZONE_ID,
    services,
  });

  await gameServer.listen(2567);
  console.log("Colyseus WebSocket listening on :2567");
}

bootstrap().catch(console.error);
