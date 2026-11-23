import { EXPIRATION_NEVER, EXPIRATION_ANY_TURNS, EXPIRATION_OPPONENT_TURNS } from 'moonlands/dist/esm/const.js';

export const tickDownContinuousEffects = <T extends { player?: number; expiration: { type: string; turns?: number; active?: boolean; turnPlayer?: number } }>(
  effects: T[], opponent: boolean, activePlayer?: number,
): T[] => {
  let resultingEffects: T[] = [];
  for (const effect of effects) {
    switch (effect.expiration.type) {
      case 'expirations/during_player_turns':
      case 'expirations/during_opponent_turns': {
        const turns = effect.expiration.turns! - (effect.expiration.active ? 1 : 0);
        const active = effect.expiration.type === 'expirations/during_player_turns'
          ? activePlayer !== undefined && activePlayer === (effect.expiration.turnPlayer ?? effect.player)
          : activePlayer === undefined || effect.player === undefined ? opponent : activePlayer !== effect.player;
        if (turns > 0) resultingEffects.push({ ...effect, expiration: { ...effect.expiration, turns, active } });
        break;
      }
      case EXPIRATION_NEVER: {
        resultingEffects.push(effect);
        break;
      }
      case EXPIRATION_ANY_TURNS: {
        const turns = effect.expiration.turns! - 1;
        if (turns > 0) {
          resultingEffects.push({
            ...effect,
            expiration: {
              ...effect.expiration,
              turns,
            }
          });
        }
        break;
      }
      case EXPIRATION_OPPONENT_TURNS: {
        if (opponent) {
          const turns = effect.expiration.turns! - 1;
          if (turns >= 0) {
            resultingEffects.push({
              ...effect,
              expiration: {
                ...effect.expiration,
                turns,
              }
            });
          }
        } else {
          resultingEffects.push(effect);
        }
        break;
      }
    }
  }

  return resultingEffects;
}

