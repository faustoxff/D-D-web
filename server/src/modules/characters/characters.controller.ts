import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtGuard } from "../auth/jwt.guard";
import { CharactersService } from "./characters.service";
import { CreateCharacterDto } from "./dto/create-character.dto";

@Controller("characters")
@UseGuards(JwtGuard)
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Get("me")
  async getMyCharacter(@Req() req: Request & { userId: string }) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new NotFoundException("No character found");
    return char;
  }

  @Post()
  async create(
    @Req() req: Request & { userId: string },
    @Body(new ValidationPipe()) dto: CreateCharacterDto,
  ) {
    return this.characters.create(req.userId, dto.name, dto.race, dto.class);
  }
}
