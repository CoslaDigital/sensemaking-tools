import { VoteGroup } from "../models/report.model";

type VoteLike = unknown;
type VoteTotals = VoteGroup & { total: number };

/**
 * The normalizeVotes function is used to normalize the votes object to an array of VoteGroup objects.
 * This is because the votes object can be in a variety of formats, such as:
 * - A single VoteGroup object (e.g. { agreeCount: 1, disagreeCount: 0, passCount: 0 })
 * - A Record<string, VoteGroup> object (e.g. { "group1": { agreeCount: 1, disagreeCount: 0, passCount: 0 }, "group2": { agreeCount: 0, disagreeCount: 1, passCount: 0 } })
 */

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isVoteGroup(value: unknown): value is VoteGroup {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<VoteGroup>;
  return (
    typeof candidate.agreeCount === "number" &&
    typeof candidate.disagreeCount === "number" &&
    (candidate.passCount === undefined || typeof candidate.passCount === "number")
  );
}

export function normalizeVotes(votes: VoteLike): VoteGroup[] {
  if (!votes || typeof votes !== "object") {
    return [];
  }

  if (isVoteGroup(votes)) {
    return [
      {
        agreeCount: toNumber(votes.agreeCount),
        disagreeCount: toNumber(votes.disagreeCount),
        passCount: toNumber(votes.passCount),
      },
    ];
  }

  return Object.values(votes)
    .filter(isVoteGroup)
    .map((group) => ({
      agreeCount: toNumber(group.agreeCount),
      disagreeCount: toNumber(group.disagreeCount),
      passCount: toNumber(group.passCount),
    }));
}

export function getVoteTotals(votes: VoteLike): VoteTotals {
  return normalizeVotes(votes).reduce(
    (acc: VoteTotals, group: VoteGroup) => {
      acc.agreeCount += group.agreeCount;
      acc.disagreeCount += group.disagreeCount;
      acc.passCount += group.passCount;
      acc.total += group.agreeCount + group.disagreeCount + group.passCount;
      return acc;
    },
    { agreeCount: 0, disagreeCount: 0, passCount: 0, total: 0 }
  );
}
