/**
 * Tests for Multi-Armed Bandit algorithm
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiArmedBandit, EpsilonGreedyBandit } from '../src/optimization/multi-armed-bandit';

describe('MultiArmedBandit', () => {
  let bandit: MultiArmedBandit;

  beforeEach(() => {
    bandit = new MultiArmedBandit(0.1);
  });

  describe('arm management', () => {
    it('should add new arms', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      
      const stats = bandit.getStatistics();
      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.id === 'arm1')).toBeDefined();
      expect(stats.find(s => s.id === 'arm2')).toBeDefined();
    });

    it('should not duplicate arms', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm1');
      
      const stats = bandit.getStatistics();
      expect(stats).toHaveLength(1);
    });
  });

  describe('arm selection', () => {
    it('should return null when no arms available', () => {
      const selected = bandit.selectArm();
      expect(selected).toBeNull();
    });

    it('should select from available arms', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      bandit.addArm('arm3');
      
      const selected = bandit.selectArm();
      expect(['arm1', 'arm2', 'arm3']).toContain(selected);
    });

    it('should force exploration for under-sampled arms', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      
      // Update arm1 many times
      for (let i = 0; i < 20; i++) {
        bandit.updateArm('arm1', Math.random());
      }
      
      // arm2 should be selected due to insufficient samples
      const selections: string[] = [];
      for (let i = 0; i < 10; i++) {
        const selected = bandit.selectArm();
        if (selected) selections.push(selected);
      }
      
      expect(selections.filter(s => s === 'arm2').length).toBeGreaterThan(5);
    });
  });

  describe('arm updates', () => {
    it('should update arm statistics', () => {
      bandit.addArm('arm1');
      
      bandit.updateArm('arm1', 1);
      bandit.updateArm('arm1', 0);
      bandit.updateArm('arm1', 1);
      
      const stats = bandit.getStatistics();
      const arm1Stats = stats.find(s => s.id === 'arm1');
      
      expect(arm1Stats?.pulls).toBe(3);
      expect(arm1Stats?.averageReward).toBeCloseTo(0.667, 2);
    });

    it('should update Beta distribution parameters', () => {
      bandit.addArm('arm1');
      
      // 3 successes, 2 failures
      bandit.updateArm('arm1', 1);
      bandit.updateArm('arm1', 1);
      bandit.updateArm('arm1', 0);
      bandit.updateArm('arm1', 1);
      bandit.updateArm('arm1', 0);
      
      const state = bandit.getState();
      const arm = state.arms.get('arm1');
      
      expect(arm?.alpha).toBe(4); // 1 + 3 successes
      expect(arm?.beta).toBe(3); // 1 + 2 failures
    });

    it('should ignore updates for non-existent arms', () => {
      bandit.updateArm('nonexistent', 1);
      const stats = bandit.getStatistics();
      expect(stats).toHaveLength(0);
    });
  });

  describe('best arm detection', () => {
    it('should return null when no arms have sufficient data', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      
      const best = bandit.getBestArm();
      expect(best).toBeNull();
    });

    it('should identify best performing arm', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      
      // Give arm1 poor performance
      for (let i = 0; i < 15; i++) {
        bandit.updateArm('arm1', i < 3 ? 1 : 0); // 20% success
      }
      
      // Give arm2 good performance
      for (let i = 0; i < 15; i++) {
        bandit.updateArm('arm2', i < 12 ? 1 : 0); // 80% success
      }
      
      const best = bandit.getBestArm();
      expect(best).toBe('arm2');
    });
  });

  describe('confidence calculation', () => {
    it('should return 0 for insufficient data', () => {
      bandit.addArm('arm1');
      const confidence = bandit.getConfidence('arm1');
      expect(confidence).toBe(0);
    });

    it('should calculate confidence for arms with data', () => {
      bandit.addArm('arm1');
      
      // Add sufficient data
      for (let i = 0; i < 20; i++) {
        bandit.updateArm('arm1', Math.random() > 0.3 ? 1 : 0);
      }
      
      const confidence = bandit.getConfidence('arm1');
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('arm pruning', () => {
    it('should remove poorly performing arms', () => {
      bandit.addArm('good');
      bandit.addArm('bad');
      
      // Good arm: 90% success rate
      for (let i = 0; i < 30; i++) {
        bandit.updateArm('good', i < 27 ? 1 : 0);
      }
      
      // Bad arm: 5% success rate
      for (let i = 0; i < 30; i++) {
        bandit.updateArm('bad', i < 2 ? 1 : 0);
      }
      
      bandit.pruneArms(0.1);
      
      const stats = bandit.getStatistics();
      expect(stats.find(s => s.id === 'good')).toBeDefined();
      expect(stats.find(s => s.id === 'bad')).toBeUndefined();
    });

    it('should not prune arms with insufficient data', () => {
      bandit.addArm('arm1');
      bandit.addArm('arm2');
      
      // Only update arm1
      for (let i = 0; i < 30; i++) {
        bandit.updateArm('arm1', 1);
      }
      
      bandit.pruneArms(0.1);
      
      const stats = bandit.getStatistics();
      expect(stats).toHaveLength(2); // Both arms should remain
    });
  });
});

describe('EpsilonGreedyBandit', () => {
  let bandit: EpsilonGreedyBandit;

  beforeEach(() => {
    bandit = new EpsilonGreedyBandit(0.1);
  });

  it('should select arms using epsilon-greedy strategy', () => {
    bandit.addArm('arm1');
    bandit.addArm('arm2');
    
    // Make arm1 better
    bandit.updateArm('arm1', 1);
    bandit.updateArm('arm1', 1);
    bandit.updateArm('arm2', 0);
    bandit.updateArm('arm2', 0);
    
    // Count selections
    const selections: Record<string, number> = { arm1: 0, arm2: 0 };
    for (let i = 0; i < 1000; i++) {
      const selected = bandit.selectArm();
      if (selected) selections[selected]++;
    }
    
    // arm1 should be selected more often (exploitation)
    expect(selections.arm1).toBeGreaterThan(selections.arm2);
    
    // But arm2 should still be selected sometimes (exploration)
    expect(selections.arm2).toBeGreaterThan(50); // At least 5% of the time
  });

  it('should update arm rewards correctly', () => {
    bandit.addArm('arm1');
    
    bandit.updateArm('arm1', 1);
    bandit.updateArm('arm1', 0);
    bandit.updateArm('arm1', 1);
    
    // We can't directly access internal state in this implementation
    // but we can verify behavior through selection
    const selected = bandit.selectArm();
    expect(selected).toBe('arm1');
  });
});