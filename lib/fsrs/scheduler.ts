import type { FSRSCard, FSRSRating, FSRSState, ReviewLog } from '@/types/chess';

// FSRS-6 Constants
const DECAY = -0.5; // used in interval calculation
const FACTOR = 19 / 81; // 0.2346 approx - used in retrievability


// Default parameters for FSRS-6
const PARAMS = {
  requestRetention: 0.9,
  maximumInterval: 36500, // 100 years in days
  w: [
    0.4072, 1.1829, 3.1262, 15.4722, // initial stability for each rating
    7.2102, 0.5316, 1.0651, 0.0589,  // difficulty parameters
    1.5330, 0.1418, 1.0266,          // stability increase params
    1.9395, 0.1100, 0.2969,          // recall params
    2.2272, 0.2272, 2.8755,          // more params
  ],
};

// Calculate retrievability using the power-law forgetting curve
// R(t, S) = (1 + FACTOR * (t / S))^(-1/FACTOR*DECAY)
// Simplified: R(t, S) = (1 + 0.2346 * t / S)^(-2.0) approximately
export function calculateRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY / FACTOR);
}

// Calculate the optimal interval for a target retention
// I ≈ S * ((R_target^(1/DECAY) - 1) / FACTOR)
export function calculateInterval(stability: number, requestRetention: number = PARAMS.requestRetention): number {
  const interval = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return Math.min(Math.max(Math.round(interval), 1), PARAMS.maximumInterval);
}

// Calculate initial difficulty based on rating
function initDifficulty(rating: FSRSRating): number {
  // D0 = w[4] - exp(w[5] * (rating - 1)) + 1
  return Math.max(1, Math.min(10, PARAMS.w[4] - Math.exp(PARAMS.w[5] * (rating - 1)) + 1));
}

// Calculate next difficulty based on current difficulty and rating
function nextDifficulty(currentDifficulty: number, rating: FSRSRating): number {
  // D' = w[7] * D0(3) + (1 - w[7]) * (D - w[6] * (rating - 3))
  const d0Rating3 = initDifficulty(3);
  const newD = PARAMS.w[7] * d0Rating3 + (1 - PARAMS.w[7]) * (currentDifficulty - PARAMS.w[6] * (rating - 3));
  return Math.max(1, Math.min(10, newD));
}

// Calculate initial stability based on rating
function initStability(rating: FSRSRating): number {
  return Math.max(0.1, PARAMS.w[rating - 1]);
}

// Calculate next stability after a successful recall
function nextRecallStability(
  currentStability: number,
  difficulty: number,
  retrievability: number,
  rating: FSRSRating
): number {
  const hardPenalty = rating === 2 ? PARAMS.w[15] : 1;
  const easyBonus = rating === 4 ? PARAMS.w[16] : 1;
  
  const newS = currentStability * (
    1 + Math.exp(PARAMS.w[8]) *
    (11 - difficulty) *
    Math.pow(currentStability, -PARAMS.w[9]) *
    (Math.exp((1 - retrievability) * PARAMS.w[10]) - 1) *
    hardPenalty *
    easyBonus
  );
  
  return Math.max(0.1, newS);
}

// Calculate next stability after a lapse (forgotten)
function nextForgetStability(
  currentStability: number,
  difficulty: number,
  retrievability: number
): number {
  const newS = PARAMS.w[11] *
    Math.pow(difficulty, -PARAMS.w[12]) *
    (Math.pow(currentStability + 1, PARAMS.w[13]) - 1) *
    Math.exp((1 - retrievability) * PARAMS.w[14]);
  
  return Math.max(0.1, Math.min(newS, currentStability));
}

// Create a new FSRS card
export function createCard(nodeId: string): FSRSCard {
  const now = Date.now();
  return {
    id: `card_${nodeId}_${now}`,
    nodeId,
    state: 'new',
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    dueDate: now,
  };
}

// Schedule next review based on rating
export function scheduleReview(card: FSRSCard, rating: FSRSRating): { card: FSRSCard; log: ReviewLog } {
  const now = Date.now();
  const daysSinceLastReview = card.lastReview > 0
    ? (now - card.lastReview) / (1000 * 60 * 60 * 24)
    : 0;

  let newStability: number;
  let newDifficulty: number;
  let newState: FSRSState;
  let newLapses = card.lapses;

  if (card.state === 'new') {
    // First review
    newStability = initStability(rating);
    newDifficulty = initDifficulty(rating);
    newState = rating === 1 ? 'learning' : 'review';
    if (rating === 1) newLapses += 1;
  } else {
    const retrievability = calculateRetrievability(daysSinceLastReview, card.stability);
    newDifficulty = nextDifficulty(card.difficulty, rating);

    if (rating === 1) {
      // Lapse - forgot the card
      newStability = nextForgetStability(card.stability, newDifficulty, retrievability);
      newState = 'relearning';
      newLapses += 1;
    } else {
      // Successful recall
      newStability = nextRecallStability(card.stability, newDifficulty, retrievability, rating);
      newState = 'review';
    }
  }

  const scheduledDays = rating === 1 ? 0 : calculateInterval(newStability);
  const dueDate = now + scheduledDays * 24 * 60 * 60 * 1000;

  const updatedCard: FSRSCard = {
    ...card,
    stability: newStability,
    difficulty: newDifficulty,
    state: newState,
    elapsedDays: daysSinceLastReview,
    scheduledDays,
    reps: card.reps + 1,
    lapses: newLapses,
    lastReview: now,
    dueDate,
  };

  const log: ReviewLog = {
    cardId: card.id,
    rating,
    state: card.state,
    elapsedDays: daysSinceLastReview,
    scheduledDays,
    stability: newStability,
    difficulty: newDifficulty,
    reviewedAt: now,
  };

  return { card: updatedCard, log };
}

// Get cards due for review
export function getDueCards(cards: FSRSCard[], targetRetention: number = PARAMS.requestRetention): FSRSCard[] {
  const now = Date.now();
  return cards.filter((card) => {
    if (card.state === 'new') return true;
    if (card.dueDate <= now) return true;
    
    // Also include cards where retrievability has dropped below target
    const daysSinceReview = (now - card.lastReview) / (1000 * 60 * 60 * 24);
    const retrievability = calculateRetrievability(daysSinceReview, card.stability);
    return retrievability <= targetRetention;
  });
}

// Format interval for display
export function formatInterval(days: number): string {
  if (days < 1) return 'Now';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

// Predict next intervals for all ratings
export function predictIntervals(card: FSRSCard): Record<FSRSRating, number> {
  return {
    1: 0, // Again - review immediately
    2: calculateInterval(card.state === 'new' ? initStability(2) : card.stability * 0.8),
    3: calculateInterval(card.state === 'new' ? initStability(3) : card.stability * 1.2),
    4: calculateInterval(card.state === 'new' ? initStability(4) : card.stability * 2.0),
  };
}
