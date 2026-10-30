import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import type { CombatEvent } from "@dnd/shared";

export interface NarrateParams {
  combatLog: CombatEvent[];
  zoneName: string;
  characterName: string;
  characterRace: string;
  characterClass: string;
  enemyName: string;
  outcome: "won" | "lost" | "fled";
}

@Injectable()
export class DmService {
  private anthropic: Anthropic | null = null;

  private getClient(): Anthropic | null {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    if (!this.anthropic) this.anthropic = new Anthropic({ apiKey: key });
    return this.anthropic;
  }

  async narrateCombat(params: NarrateParams): Promise<string> {
    const client = this.getClient();
    if (!client) return this.fallbackNarrative(params);
    const {
      combatLog,
      zoneName,
      characterName,
      characterRace,
      characterClass,
      enemyName,
      outcome,
    } = params;

    const outcomeText =
      outcome === "won"
        ? "El jugador ganó el combate"
        : outcome === "lost"
          ? "El jugador fue derrotado"
          : "El jugador huyó";

    const eventsText =
      combatLog.length === 0
        ? "(sin eventos de combate)"
        : combatLog
            .map((e) => {
              const actorLabel = e.actor === "player" ? characterName : enemyName;
              const hitStatus = e.hit ? "IMPACTA" : "FALLA";
              const dmgText =
                e.damage !== null ? ` causando ${e.damage} de daño` : "";
              return `Ronda ${e.round} — ${actorLabel} ataca: d20(${e.roll})+${e.modifier}=${e.total} ${hitStatus}${dmgText}`;
            })
            .join("\n");

    const userContent = `Zona: ${zoneName}
Personaje: ${characterName} (${characterRace} ${characterClass})
Enemigo: ${enemyName}
Resultado: ${outcomeText}

Secuencia de combate:
${eventsText}

Narra este combate en español (máximo 120 palabras).`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `Eres un narrador de D&D (Dungeon Master). Tu único trabajo es narrar lo que los datos estructurados de combate describen.
REGLAS ESTRICTAS:
- NUNCA inventes números de daño, valores de HP, resultados de dados ni desenlaces.
- Usa ÚNICAMENTE los números y resultados dados en el log de combate.
- Escribe narrativa vívida y atmosférica en español.
- Mantén la narración bajo 120 palabras.
- Respeta exactamente la secuencia de eventos provista.`,
      messages: [{ role: "user", content: userContent }],
    });

    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  }

  private fallbackNarrative(params: NarrateParams): string {
    const { characterName, enemyName, outcome } = params;
    if (outcome === "won")
      return `${characterName} derrota al ${enemyName} con un golpe certero. El enemigo cae al suelo entre las sombras de la taberna.`;
    if (outcome === "lost")
      return `El ${enemyName} resulta demasiado poderoso. ${characterName} cae derrotado, pero despierta magullado junto a la puerta de la taberna.`;
    return `${characterName} aprovecha un momento de distracción del ${enemyName} y escapa hacia la oscuridad del callejón.`;
  }
}
