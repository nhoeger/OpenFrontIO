import { PlayerBuildableUnitType } from "@openfront/engine-api/game/GameTypes";
import { BulkMode } from "./BulkMode";

export interface UIState {
  attackRatio: number;
  ghostStructure: PlayerBuildableUnitType | null;
  rocketDirectionUp: boolean;
  bulkMode: BulkMode;
}
