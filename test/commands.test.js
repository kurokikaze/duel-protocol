import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertServerCommand } from '../dist/commands.js';
import {
  ACTION_EFFECT, EFFECT_TYPE_CARD_MOVED_BETWEEN_ZONES,
  ZONE_TYPE_HAND, ZONE_TYPE_IN_PLAY,
} from 'moonlands/dist/esm/const.js';

// Represents an engine card whose constructor comes from another module copy.
class ForeignCard {
  id = 'card-1';
  owner = 1;
  data = { energy: 4 };
  serialize(hidden = false) {
    return { id: this.id, owner: this.owner, card: hidden ? null : 'Weebo', data: hidden ? {} : this.data };
  }
}

test('converts foreign engine instances, hides opponent hands, and snapshots card data', () => {
  const card = new ForeignCard();
  const action = {
    type: ACTION_EFFECT,
    effectType: EFFECT_TYPE_CARD_MOVED_BETWEEN_ZONES,
    sourceCard: card,
    destinationCard: card,
    sourceZone: ZONE_TYPE_HAND,
    destinationZone: ZONE_TYPE_IN_PLAY,
    player: 1,
  };
  const own = convertServerCommand(action, {}, 1);
  const opponent = convertServerCommand(action, {}, 2);
  assert.equal(own.sourceCard.card, 'Weebo');
  assert.equal(opponent.sourceCard.card, null);
  assert.deepEqual(opponent.sourceCard.data, {});
  assert.equal(opponent.destinationCard.card, 'Weebo');
  card.data.energy = 99;
  assert.equal(own.sourceCard.data.energy, 4);
  assert.equal(opponent.destinationCard.data.energy, 4);
  assert.equal(typeof card.serialize, 'function');
});
