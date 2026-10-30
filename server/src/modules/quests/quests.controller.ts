import { Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtGuard } from "../auth/jwt.guard";
import { CharactersService } from "../characters/characters.service";
import { QuestsService } from "./quests.service";

@Controller("quests")
@UseGuards(JwtGuard)
export class QuestsController {
  constructor(
    private readonly quests: QuestsService,
    private readonly characters: CharactersService,
  ) {}

  @Get("daily")
  async getDaily(@Req() req: Request & { userId: string }) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new NotFoundException("No character found");
    return this.quests.getOrCreateDailyQuest(char.id);
  }

  @Post(":id/claim")
  async claim(
    @Req() req: Request & { userId: string },
    @Param("id") questId: string,
  ) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new NotFoundException("No character found");
    return this.quests.claimQuest(char.id, questId);
  }
}
