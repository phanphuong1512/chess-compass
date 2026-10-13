import test from 'node:test';
import assert from 'node:assert/strict';
import { RepertoireDAG, STARTING_FEN, fenToNodeId, normalizeFen } from '../dag';
import {
  calculateRetrievability,
  calculateInterval,
  createCard,
  scheduleReview,
  predictIntervals,
} from '../../fsrs/scheduler';

test('Transposition DAG converges different move orders to the same node', () => {
  const dag = new RepertoireDAG();
  const repId = 'test-rep';

  // Order 1: 1.d4 Nf6 2.c4
  const m1 = dag.addMove(STARTING_FEN, 'd4', repId);
  const m2 = dag.addMove(m1.node.fen, 'Nf6', repId);
  const m3 = dag.addMove(m2.node.fen, 'c4', repId);

  // Order 2: 1.c4 Nf6 2.d4 (transposes to exact same position)
  const m4 = dag.addMove(STARTING_FEN, 'c4', repId);
  const m5 = dag.addMove(m4.node.fen, 'Nf6', repId);
  const m6 = dag.addMove(m5.node.fen, 'd4', repId);

  // Both sequences must end at the exact same node ID
  assert.equal(m3.node.id, m6.node.id);
  assert.equal(m6.isTransposition, true);

  // Both nodes share the same normalized FEN
  assert.equal(normalizeFen(m3.node.fen), normalizeFen(m6.node.fen));

  // The node should have multiple incoming edges
  const incomingEdges = dag.getEdgesTo(m3.node.id);
  assert.equal(incomingEdges.length, 2);
});

test('Transposition DAG normalizes FEN by stripping half-move and full-move clocks', () => {
  const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const fen2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 5 12';
  assert.equal(normalizeFen(fen1), normalizeFen(fen2));
});

test('FSRS-6 correctly scales intervals across Again, Hard, Good, and Easy ratings', () => {
  const card = createCard('test-node');

  const revAgain = scheduleReview(card, 1);
  const revHard = scheduleReview(card, 2);
  const revGood = scheduleReview(card, 3);
  const revEasy = scheduleReview(card, 4);

  // Again should keep interval at 0 and move to learning
  assert.equal(revAgain.card.scheduledDays, 0);
  assert.equal(revAgain.card.state, 'learning');

  // Hard <= Good < Easy intervals
  assert.ok(revHard.card.scheduledDays <= revGood.card.scheduledDays);
  assert.ok(revGood.card.scheduledDays < revEasy.card.scheduledDays);

  // Stability increases with rating
  assert.ok(revAgain.card.stability < revHard.card.stability);
  assert.ok(revHard.card.stability < revGood.card.stability);
  assert.ok(revGood.card.stability < revEasy.card.stability);
});

test('FSRS-6 calculates retrievability with power-law forgetting curve', () => {
  const stability = 10;
  
  // Day 0: 100% retrievability
  assert.equal(calculateRetrievability(0, stability), 1);

  // Day 10 (t = S): (1 + 0.2346 * 1)^(-2.0) ≈ 0.656
  const r10 = calculateRetrievability(10, stability);
  assert.ok(r10 > 0.60);
  assert.ok(r10 < 0.70);

  // Day 30: retrievability drops significantly
  const r30 = calculateRetrievability(30, stability);
  assert.ok(r30 < r10);
  assert.ok(r30 > 0);
});

test('FSRS-6 predicts increasing intervals for higher ratings', () => {
  const card = createCard('test-node');
  const intervals = predictIntervals(card);

  assert.equal(intervals[1], 0);
  assert.ok(intervals[2] > 0);
  assert.ok(intervals[3] >= intervals[2]);
  assert.ok(intervals[4] > intervals[3]);
});
