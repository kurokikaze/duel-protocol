import { EXPIRATION_NEVER, EXPIRATION_ANY_TURNS, EXPIRATION_OPPONENT_TURNS } from 'moonlands/dist/esm/const.js';

export const tickDownContinuousEffects = <T extends { expiration: { type: string; turns?: number } }>(effects: T[], opponent: boolean): T[] => {
  let resultingEffects: T[] = [];
  for (const effect of effects) {
    switch (effect.expiration.type) {
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

