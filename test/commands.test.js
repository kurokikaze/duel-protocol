import { test } from 'node:test';
import assert from 'node:assert/strict';
import convertClientCommands, { convertServerCommand } from '../dist/commands.js';
import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import Zone from 'moonlands/dist/esm/classes/Zone.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import {
  ACTION_EFFECT, EFFECT_TYPE_CARD_MOVED_BETWEEN_ZONES,
  ZONE_TYPE_HAND, ZONE_TYPE_IN_PLAY,
  ACTION_POWER, ACTION_RESOLVE_PROMPT, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_DECK,
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

test('converts and validates Barak Prophecy replies all the way into engine resolution', () => {
  const barak = new CardInGame(byName('Barak'), 1).addEnergy(10);
  const deck = ['Arbolit', 'Thermal Blast', 'Diobor', 'Fire Ball', 'Magma Hyren'].map(name => new CardInGame(byName(name), 1));
  const game = new State({ zones: [
    new Zone('Magi', ZONE_TYPE_ACTIVE_MAGI, 1).add([barak]),
    new Zone('Deck', ZONE_TYPE_DECK, 1).add(deck),
  ], step: 1, activePlayer: 1 });
  game.setPlayers(1, 2);
  game.update({ type: ACTION_POWER, source: barak, power: barak.card.data.powers[0], player: 1 });
  const cards = deck.slice(0, 4).map(card => card.id).reverse();
  const command = { type: ACTION_RESOLVE_PROMPT, cards, generatedBy: barak.id, player: 1 };
  assert.equal(convertClientCommands({ ...command, cards: [cards[0], cards[0], cards[2], cards[3]] }, game), null);
  assert.equal(convertClientCommands({ ...command, cards: ['not-in-prompt', ...cards.slice(1)] }, game), null);
  assert.equal(convertClientCommands({ ...command, cards: cards.slice(1) }, game), null);
  const converted = convertClientCommands(command, game);
  assert.ok(converted);
  game.update(converted);
  assert.equal(game.state.prompt, false);
  assert.deepEqual(game.getSpellMetadata(barak.id).rearrangedCards, cards);
  assert.deepEqual(game.getZone(ZONE_TYPE_DECK, 1).cards.map(card => card.id), [...cards, deck[4].id]);
});
