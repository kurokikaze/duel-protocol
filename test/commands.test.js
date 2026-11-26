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
  ACTION_PLAY,
} from 'moonlands/dist/esm/const.js';

for (const effectType of ['effects/add_energy_to_magi', 'effects/remove_energy_from_magi']) {
  for (const mode of ['single', 'direct', 'metadata']) {
    test(`${effectType} preserves all ${mode} targets`, () => {
      const targets = [new CardInGame(byName('Whall'), 1).addEnergy(7), new CardInGame(byName('Motash'), 2).addEnergy(5)];
      const source = new CardInGame(byName('Paralit'), 1);
      const game = new State({ zones: [] });
      game.setSpellMetadata({ targets }, 'group');
      const input = mode === 'single' ? targets[0] : mode === 'direct' ? targets : '$targets';
      const result = convertServerCommand({ type: ACTION_EFFECT, effectType, target: input, source, amount: 2, generatedBy: 'group' }, game, 1);
      const converted = Array.isArray(result.target) ? result.target : [result.target];
      assert.deepEqual(converted.map(card => card.id), (mode === 'single' ? targets.slice(0, 1) : targets).map(card => card.id));
      assert.equal(result.amount, 2);
      if (effectType === 'effects/add_energy_to_magi') assert.deepEqual(result.source, { id: source.id });
      assert.equal(convertServerCommand({ type: ACTION_EFFECT, effectType, target: [], amount: 2 }, game, 1), null);
    });
  }
}

for (const owner of [1, 2]) {
  test(`Baloo Root Nourish respects Colossus Energy Stasis with source owner ${owner}`, () => {
    const root = new CardInGame(byName('Baloo Root'), owner);
    const colossus = new CardInGame(byName('Colossus'), 2).addEnergy(1);
    const other = new CardInGame(byName('Greater Vaal'), 2).addEnergy(5);
    const spell = new CardInGame(byName('Flame Control'), 2);
    const game = new State({ activePlayer: owner, controllingPlayer: owner, step: 1, zones: [
      new Zone('In play', ZONE_TYPE_IN_PLAY, null).add([root, colossus, other]),
      ...[1, 2].flatMap(player => [
        new Zone('Magi', ZONE_TYPE_ACTIVE_MAGI, player).add([new CardInGame(byName('Grega'), player).addEnergy(10)]),
        new Zone('Discard', ZONE_TYPE_DISCARD, player), new Zone('Hand', ZONE_TYPE_HAND, player).add(player === 2 ? [spell] : []),
      ]),
    ] });
    game.setPlayers(1, 2);
    const energy = [new Map([[colossus.id, 1], [other.id, 5]]), new Map([[colossus.id, 1], [other.id, 5]])];
    game.setOnAction(action => {
      for (const viewer of [1, 2]) {
        const command = convertServerCommand(action, game, viewer);
        if (command?.effectType === 'effects/add_energy_to_creature') {
          for (const target of Array.isArray(command.target) ? command.target : [command.target]) {
            energy[viewer - 1].set(target.id, energy[viewer - 1].get(target.id) + command.amount);
          }
        }
      }
    });
    game.update({ type: ACTION_POWER, source: root, power: root.card.data.powers[0], player: owner });
    game.update({ type: ACTION_RESOLVE_PROMPT, target: colossus, player: owner });
    assert.equal(colossus.data.energy, owner === 2 ? 1 : 2);
    for (const view of energy) assert.equal(view.get(colossus.id), colossus.data.energy);
    game.setActivePlayer(2);
    game.update({ type: ACTION_PLAY, player: 2, payload: { card: spell, player: 2 } });
    assert.equal(game.state.promptType, 'prompt/rearrange_energy_on_creatures');
    game.update({ type: ACTION_RESOLVE_PROMPT, energyOnCreatures: Object.fromEntries(energy[1]), player: 2 });
    assert.equal(game.state.prompt, false, 'A map built from client energies must be accepted by the engine');
  });
}

test('energy addition converts only affected targets, including mixed and empty lists', () => {
  const source = new CardInGame(byName('Baloo Root'), 1);
  const blocked = new CardInGame(byName('Colossus'), 1).addEnergy(1);
  const allowed = new CardInGame(byName('Weebo'), 1).addEnergy(2);
  const absent = new CardInGame(byName('Weebo'), 1).addEnergy(3);
  const game = new State({ zones: [new Zone('In play', ZONE_TYPE_IN_PLAY, null).add([source, blocked, allowed])] });
  game.setPlayers(1, 2);
  const action = { type: ACTION_EFFECT, effectType: 'effects/add_energy_to_creature', source, power: true, amount: 1, generatedBy: source.id };
  assert.equal(convertServerCommand({ ...action, target: blocked }, game, 1), null);
  assert.equal(convertServerCommand({ ...action, target: absent }, game, 1), null);
  assert.equal(convertServerCommand({ ...action, target: [] }, game, 1), null);
  const converted = convertServerCommand({ ...action, target: [blocked, allowed, absent] }, game, 1);
  assert.deepEqual(converted.target, [{ id: allowed.id }]);
  assert.equal(converted.amount, 1);
  game.setSpellMetadata({ targets: [blocked, allowed] }, source.id);
  assert.deepEqual(convertServerCommand({ ...action, target: '$targets' }, game, 2).target, [{ id: allowed.id }]);
});

for (const victims of [0, 1, 2]) {
  test(`Ormagon Devastate converts safely with ${victims} non-Underneath creatures`, () => {
    const source = new CardInGame(byName('Ormagon'), 1).addEnergy(11);
    const protectedCreature = new CardInGame(byName('Parmalag'), 1).addEnergy(4);
    const targets = ['Weebo', 'Arbolit'].slice(0, victims).map(name =>
      new CardInGame(byName(name), 2).addEnergy(3));
    const game = new State({ activePlayer: 1, step: 1, zones: [
      new Zone('In play', ZONE_TYPE_IN_PLAY, null).add([source, protectedCreature, ...targets]),
      ...[1, 2].flatMap(player => [
        new Zone('Magi', ZONE_TYPE_ACTIVE_MAGI, player).add([new CardInGame(byName('Grega'), player).addEnergy(10)]),
        new Zone('Discard', ZONE_TYPE_DISCARD, player),
      ]),
    ] });
    game.setPlayers(1, 2);
    const discardCommands = [];
    game.setOnAction(action => {
      for (const player of [1, 2]) {
        const command = convertServerCommand(action, game, player);
        if (action.effectType === 'effects/discard_creature_from_play') discardCommands.push(command);
      }
    });
    game.update({ type: ACTION_POWER, source, power: source.card.data.powers[0], player: 1 });
    assert.equal(source.data.energy, 1);
    assert.ok(source.data.actionsUsed.includes('Devastate'));
    assert.deepEqual(game.getZone(ZONE_TYPE_IN_PLAY).cards.map(card => card.id).sort(), [source.id, protectedCreature.id].sort());
    assert.equal(game.getZone(ZONE_TYPE_DISCARD, 2).cards.length, victims);
    if (victims === 0) {
      // New engines suppress empty discard attempts before broadcasting them.
      // Older supported versions still emit an attempt, converted to null per viewer.
      assert.ok(discardCommands.length === 0 || discardCommands.length === 2);
      assert.ok(discardCommands.every(command => command === null));
    } else {
      assert.equal(discardCommands.length, 2);
      for (const command of discardCommands) {
        assert.equal(command.target.id, targets[0].id);
        assert.equal(command.source.id, source.id);
      }
    }
  });
}

test('Mirror Pendant transports the selected Magi from promptParams and resolves its named power', () => {
  const pendant = new CardInGame(byName('Mirror Pendant'), 1);
  const creature = new CardInGame(byName('Weebo'), 2).addEnergy(3);
  const magi = new CardInGame(byName('Grega'), 1).addEnergy(10);
  const game = new State({
    activePlayer: 1, step: 1,
    zones: [new Zone('In play', ZONE_TYPE_IN_PLAY, null).add([pendant, creature]),
      new Zone('Magi 1', ZONE_TYPE_ACTIVE_MAGI, 1).add([magi]),
      new Zone('Magi 2', ZONE_TYPE_ACTIVE_MAGI, 2).add([new CardInGame(byName('Ora'), 2).addEnergy(10)])],
  });
  game.setPlayers(1, 2);
  let entered;
  game.setOnAction(action => {
    if (action.effectType === 'effects/prompt_entered' && action.promptType === 'prompt/power_on_magi') entered = convertServerCommand(action, game, 1);
  });
  game.update({ type: ACTION_POWER, source: pendant, power: pendant.card.data.powers[0], player: 1 });
  assert.equal(game.state.promptType, 'prompt/power_on_magi');
  assert.equal(entered.magi.id, magi.id);
  assert.equal(entered.magi.card, 'Grega');
  assert.equal(convertClientCommands({ type: ACTION_RESOLVE_PROMPT, power: 'Missing power', player: 1 }, game), null);
  const power = magi.card.data.powers[0];
  const converted = convertClientCommands({ type: ACTION_RESOLVE_PROMPT, power: power.name, player: 1 }, game);
  assert.equal(converted.source, magi);
  assert.equal(converted.power, power);
  game.update(converted);
  assert.notEqual(game.state.promptType, 'prompt/power_on_magi');
  assert.equal(magi.data.energy, 10 - power.cost - 2);
});

test('Karak’s set-aside relic and its holder are public', () => {
  const source = new CardInGame(byName('Dream Balm'), 1);
  const destination = new CardInGame(byName('Dream Balm'), 1);
  destination.data.setAsideUnder = { cardId: 'karak', blockedPlayer: 1 };
  const command = convertServerCommand({
    type: ACTION_EFFECT, effectType: EFFECT_TYPE_CARD_MOVED_BETWEEN_ZONES,
    sourceCard: source, destinationCard: destination,
    sourceZone: ZONE_TYPE_IN_PLAY, destinationZone: 'zones/set_aside',
  }, {}, 2);
  assert.equal(command.destinationCard.card, 'Dream Balm');
  assert.deepEqual(command.destinationCard.data.setAsideUnder, { cardId: 'karak', blockedPlayer: 1 });
});

test('revealed card names go only to the designated viewer, even with hiding overridden', () => {
  const cards = [new CardInGame(byName('Weebo'), 1), new CardInGame(byName('Grow'), 1)];
  const action = { type: ACTION_EFFECT, effectType: 'effects/reveal_cards', viewer: '$viewer', cards: '$cards', generatedBy: 'mask' };
  const game = { getMetaValue: value => value === '$viewer' ? 2 : cards };
  assert.deepEqual(convertServerCommand(action, game, 2), {
    type: ACTION_EFFECT, effectType: 'effects/reveal_cards', cards: ['Weebo', 'Grow'],
  });
  assert.equal(convertServerCommand(action, game, 1), null);
  assert.equal(convertServerCommand(action, game, 1, true), null);
});

test('Entangle activates only on the selected player’s next turn', () => {
  const command = convertServerCommand({
    type: ACTION_EFFECT,
    effectType: 'effects/create_continuous_effect',
    player: 1,
    turnPlayer: '$selectedPlayer',
    expiration: { type: 'expirations/during_player_turns', turns: 1 },
  }, { getMetaValue: () => 1 }, 2);
  assert.equal(command.expiration.turnPlayer, 1);
  const waiting = tickDownContinuousEffects([command], false, 2);
  assert.equal(waiting[0].expiration.active, false);
  const active = tickDownContinuousEffects(waiting, true, 1);
  assert.equal(active[0].expiration.active, true);
  assert.deepEqual(tickDownContinuousEffects(active, false, 2), []);
});

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
