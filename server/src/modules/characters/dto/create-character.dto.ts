import { IsIn, IsString, Length } from "class-validator";
import { CLASS_IDS, RACE_IDS, type CharacterClass, type Race } from "@dnd/shared";

export class CreateCharacterDto {
  @IsString()
  @Length(2, 32)
  name!: string;

  @IsIn([...RACE_IDS])
  race!: Race;

  @IsIn([...CLASS_IDS])
  class!: CharacterClass;
}
