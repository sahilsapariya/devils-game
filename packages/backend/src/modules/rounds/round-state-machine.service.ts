import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { OperationalState } from '@extraction/shared';

import { RoundEntity } from '../../database/entities/round.entity';

/**
 * Operational state machine for active rounds.
 *
 * State transition table (currentState → allowed next states):
 *  DORMANT     → MONITORING
 *  MONITORING  → OPERATIONAL, DORMANT
 *  OPERATIONAL → CRITICAL, EXTRACTION, RECOVERY, SILENCE
 *  CRITICAL    → OPERATIONAL, EXTRACTION, RECOVERY, SILENCE
 *  RECOVERY    → DORMANT, MONITORING
 *  EXTRACTION  → SILENCE, DORMANT
 *  SILENCE     → DORMANT
 *
 * All transitions are persisted and emit a `state.transition` event
 * (the caller — RoundsService — emits via EventsService).
 *
 * Determinism: same (currentState, trigger) always yields the same nextState.
 */

export type StateTrigger =
  | 'round.scheduled'
  | 'round.started'
  | 'round.paused'
  | 'round.resumed'
  | 'round.time_warning'
  | 'round.violations_threshold'
  | 'round.completed'
  | 'round.failed'
  | 'round.abandoned'
  | 'recovery.timeout'
  | 'recovery.manual'
  | 'extraction.complete'
  | 'silence.timeout'
  | 'admin.force';

interface TransitionRule {
  from: OperationalState;
  trigger: StateTrigger;
  to: OperationalState;
}

const TRANSITIONS: ReadonlyArray<TransitionRule> = [
  { from: 'DORMANT', trigger: 'round.scheduled', to: 'MONITORING' },

  { from: 'MONITORING', trigger: 'round.started', to: 'OPERATIONAL' },
  { from: 'MONITORING', trigger: 'round.abandoned', to: 'DORMANT' },

  { from: 'OPERATIONAL', trigger: 'round.time_warning', to: 'CRITICAL' },
  { from: 'OPERATIONAL', trigger: 'round.violations_threshold', to: 'CRITICAL' },
  { from: 'OPERATIONAL', trigger: 'round.completed', to: 'EXTRACTION' },
  { from: 'OPERATIONAL', trigger: 'round.failed', to: 'RECOVERY' },
  { from: 'OPERATIONAL', trigger: 'round.abandoned', to: 'SILENCE' },

  { from: 'CRITICAL', trigger: 'round.resumed', to: 'OPERATIONAL' },
  { from: 'CRITICAL', trigger: 'round.completed', to: 'EXTRACTION' },
  { from: 'CRITICAL', trigger: 'round.failed', to: 'RECOVERY' },
  { from: 'CRITICAL', trigger: 'round.abandoned', to: 'SILENCE' },

  { from: 'RECOVERY', trigger: 'recovery.timeout', to: 'DORMANT' },
  { from: 'RECOVERY', trigger: 'recovery.manual', to: 'MONITORING' },

  { from: 'EXTRACTION', trigger: 'extraction.complete', to: 'SILENCE' },
  { from: 'EXTRACTION', trigger: 'recovery.manual', to: 'DORMANT' },

  { from: 'SILENCE', trigger: 'silence.timeout', to: 'DORMANT' },
  { from: 'SILENCE', trigger: 'recovery.manual', to: 'DORMANT' },
];

export interface TransitionResult {
  roundId: string;
  userId: string;
  from: OperationalState;
  to: OperationalState;
  trigger: StateTrigger;
  transitionedAt: Date;
}

@Injectable()
export class RoundStateMachineService {
  private readonly logger = new Logger(RoundStateMachineService.name);

  constructor(
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
  ) {}

  /**
   * Returns the list of operational states that `currentState` is allowed
   * to transition to, paired with the trigger that effects each.
   */
  getValidTransitions(
    currentState: OperationalState,
  ): ReadonlyArray<{ to: OperationalState; trigger: StateTrigger }> {
    return TRANSITIONS.filter((t) => t.from === currentState).map((t) => ({
      to: t.to,
      trigger: t.trigger,
    }));
  }

  /**
   * Pure function: given a state and trigger, return the resolved next state
   * or `null` if the trigger is not valid in that state.
   */
  resolveTransition(
    state: OperationalState,
    trigger: StateTrigger,
  ): OperationalState | null {
    const match = TRANSITIONS.find(
      (t) => t.from === state && t.trigger === trigger,
    );
    return match ? match.to : null;
  }

  /**
   * Validates and persists a state transition. Admin force bypasses table.
   */
  async transitionState(
    roundId: string,
    trigger: StateTrigger,
    options: { force?: OperationalState } = {},
  ): Promise<TransitionResult> {
    const round = await this.rounds.findOne({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException('Round not found');
    }

    const from = round.operationalState;
    let to: OperationalState | null;

    if (trigger === 'admin.force') {
      if (!options.force) {
        throw new BadRequestException('admin.force requires explicit target state');
      }
      to = options.force;
    } else {
      to = this.resolveTransition(from, trigger);
    }

    if (to === null) {
      throw new BadRequestException(
        `Invalid transition: ${from} cannot accept trigger "${trigger}"`,
      );
    }

    if (to !== from) {
      round.operationalState = to;
      await this.rounds.save(round);
      this.logger.debug(
        `Round ${roundId} transitioned ${from} → ${to} (trigger=${trigger})`,
      );
    }

    return {
      roundId: round.id,
      userId: round.userId,
      from,
      to,
      trigger,
      transitionedAt: new Date(),
    };
  }
}
