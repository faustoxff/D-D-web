import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtGuard } from "../auth/jwt.guard";
import { CharactersService } from "../characters/characters.service";
import { EconomyService } from "./economy.service";

@Controller("economy")
@UseGuards(JwtGuard)
export class EconomyController {
  constructor(
    private readonly economy: EconomyService,
    private readonly characters: CharactersService,
  ) {}

  @Get("inventory")
  async getInventory(@Req() req: Request & { userId: string }) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) return [];
    return this.economy.getInventory(char.id);
  }

  @Get("shop")
  getShop() {
    return this.economy.getShopItems();
  }

  @Post("buy/:itemId")
  async buy(
    @Req() req: Request & { userId: string },
    @Param("itemId") itemId: string,
  ) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new Error("No character");
    return this.economy.purchase(char.id, itemId);
  }

  @Post("sell")
  async sell(
    @Req() req: Request & { userId: string },
    @Body() body: { inventoryItemId?: string; quantity?: number },
  ) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new NotFoundException("No character");
    if (typeof body.inventoryItemId !== "string") throw new BadRequestException("inventoryItemId required");
    return this.economy.sell(char.id, body.inventoryItemId, Number(body.quantity ?? 1));
  }

  @Post("use/:inventoryItemId")
  async use(
    @Req() req: Request & { userId: string },
    @Param("inventoryItemId") inventoryItemId: string,
  ) {
    const char = await this.characters.findByUserId(req.userId);
    if (!char) throw new Error("No character");
    return this.economy.useItem(char.id, inventoryItemId);
  }
}
