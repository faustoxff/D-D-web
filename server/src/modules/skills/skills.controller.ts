import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { CharactersService } from "../characters/characters.service";
import { SkillsService } from "./skills.service";
import { NotFoundException } from "@nestjs/common";

@Controller("skills")
@UseGuards(JwtGuard)
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly characters: CharactersService,
  ) {}

  @Get("me")
  async mine(@Req() req: { userId: string }) {
    const character = await this.characters.findByUserId(req.userId);
    if (!character) throw new NotFoundException("Character not found");
    return this.skills.getAll(character.id);
  }
}
