import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { ZonesService } from "./zones.service";

@Controller("zones")
@UseGuards(JwtGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get(":id")
  getZone(@Param("id") id: string) {
    return this.zones.findById(id);
  }

  @Get(":id/events")
  getEvents(@Param("id") id: string) {
    return this.zones.getRecentEvents(id);
  }
}
