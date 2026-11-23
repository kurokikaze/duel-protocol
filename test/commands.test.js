import { test } from 'node:test';
import assert from 'node:assert/strict';
import convertClientCommands, { convertServerCommand } from '../dist/commands.js';
import { tickDownContinuousEffects } from '../dist/effects.js';
import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import Zone from 'moonlands/dist/esm/classes/Zone.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import {
  ACTION_EFFECT, EFFECT_TYPE_CARD_MOVED_BETWEEN_ZONES,
  ZONE_TYPE_HAND, ZONE_TYPE_IN_PLAY, ZONE_TYPE_DISCARD,
  ACTION_POWER, ACTION_RESOLVE_PROMPT, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_DECK,
} from 'moonlands/dist/esm/const.js';

test('Fog Bank transports its attachment ID and expires after two turns opposing its caster', () => {
  const source = { id: 'fog-in-play' };
  const target = { id: 'protected-creature' };
  const command = convertServerCommand({
    type: ACTION_EFFECT,
    effectType: 'effects/create_continuous_effect',
    player: 1,
    source: '$new_card',
    discardSourceOnExpiration: true,
    expiration: { type: 'expirations/during_opponent_turns', turns: 2 },
    staticAbilities: [{ selector: 'selectors/id', selectorParameter: '$target' }],
  }, {
    getMetaValue: value => value === '$new_card' ? source : value === '$target' ? target : value,
  }, 2);
  assert.equal(command.discardSourceId, source.id);
  assert.equal(command.staticAbilities[0].selectorParameter, target.id);
  let effects = [command];
  for (const [player, turns, active] of [[2, 2, true], [1, 1, false], [2, 1, true]]) {
    effects = tickDownContinuousEffects(effects, player !== 2, player);
    assert.deepEqual(effects[0].expiration, { type: 'expirations/during_opponent_turns', turns, active });
  }
  assert.deepEqual(tickDownContinuousEffects(effects, true, 1), []);
});

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

function mindwindsGame() {
  const source = new CardInGame(byName('Cloud Sceptre'), 1);
  const hand = new CardInGame(byName('Xyx Minor'), 1);
  const game = new State({ zones: [
    new Zone('Magi', ZONE_TYPE_ACTIVE_MAGI, 1).add([new CardInGame(byName('Lasada'), 1).addEnergy(10)]),
    new Zone('In play', ZONE_TYPE_IN_PLAY, null).add([source]),
    new Zone('Hand', ZONE_TYPE_HAND, 1).add([hand]),
    new Zone('Deck', ZONE_TYPE_DECK, 1).add([new CardInGame(byName('Fire Ball'), 1)]),
    new Zone('Discard', ZONE_TYPE_DISCARD, 1),
  ], step: 1, activePlayer: 1 });
  game.setPlayers(1, 2);
  game.update({ type: ACTION_POWER, source, power: source.card.data.powers[0], player: 1 });
  return { game, hand };
}

test('Mindwinds accepts an empty optional selection without echoed zone fields (run 0018)', () => {
  const { game, hand } = mindwindsGame();
  const converted = convertClientCommands({ type: ACTION_RESOLVE_PROMPT, cards: [], player: 1 }, game);
  assert.ok(converted);
  game.update(converted);
  assert.equal(game.state.prompt, false);
  assert.deepEqual(game.getZone(ZONE_TYPE_HAND, 1).cards.map(card => card.id), [hand.id]);
});

test('Mindwinds uses the prompt zone and rejects unknown, duplicate or excessive choices', () => {
  const { game, hand } = mindwindsGame();
  const reply = { type: ACTION_RESOLVE_PROMPT, cards: [hand.id], player: 1 };
  assert.equal(convertClientCommands({ ...reply, cards: ['missing'] }, game), null);
  assert.equal(convertClientCommands({ ...reply, cards: [hand.id, hand.id] }, game), null);
  const converted = convertClientCommands({ ...reply, zone: ZONE_TYPE_DISCARD, zoneOwner: 2 }, game);
  assert.ok(converted);
  game.update(converted);
  assert.equal(game.state.prompt, false);
  assert.equal(game.getZone(ZONE_TYPE_HAND, 1).card.card.name, 'Fire Ball');
});
