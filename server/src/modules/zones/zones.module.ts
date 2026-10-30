import { Module } from "@nestjs/common";
import { ZonesController } from "./zones.controller";
import { ZonesService } from "./zones.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
