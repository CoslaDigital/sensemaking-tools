// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Utils to get statistical information from a conversation

import { Comment, CommentWithVoteTallies, isCommentWithVoteTalliesType, VoteTally } from "./types";
import { groupCommentsBySubtopic } from "./sensemaker_utils";

/**
 * A function which returns the estimated aggree probability for a given vote tally entry as a MAP estimate
 */
export function getAgreeProbability(voteTally: VoteTally): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (voteTally.agreeCount + 1) / (totalCount + 2);
}

/**
 * A function which computes group informed consensus for the given set of vote tallies, given vote tally data, aggregated by some groupBy factor.
 * Computed as the product of the aggree probabilities
 */
export function getGroupInformedConsensus(
  comment: Comment & { voteTalliesByGroup: { [key: string]: VoteTally } }
): number {
  return Object.values(comment.voteTalliesByGroup).reduce(
    (product, voteTally) => product * getAgreeProbability(voteTally),
    1
  );
}

/**
 * A function which returns the minimum aggree probability across groups
 */
export function getMinAgreeProb(
  comment: Comment & { voteTalliesByGroup: { [key: string]: VoteTally } }
): number {
  return Math.min(...Object.values(comment.voteTalliesByGroup).map(getAgreeProbability));
}

/**
 * Computes the difference between the MAP agree probabilities for a given group, as computed by the getAgreeProbability function, as compared
 * with the rest of the conversation
 */
export function getGroupAgreeDifference(comment: CommentWithVoteTallies, group: string): number {
  const groupAgreeProb = getAgreeProbability(comment.voteTalliesByGroup[group]);
  // compute the vote tally for the remainder of the conversation by reducing over and adding up all other group vote tallies
  const otherGroupsVoteTally = Object.entries(comment.voteTalliesByGroup)
    .filter(([g]) => g !== group)
    // build up the new VoteTally object as a reduction of the vote counts for the remaining groups
    .map(([_, voteTally]) => voteTally) // eslint-disable-line @typescript-eslint/no-unused-vars
    .reduce(
      (acc: VoteTally, voteTally: VoteTally): VoteTally => {
        return {
          agreeCount: acc.agreeCount + voteTally.agreeCount,
          disagreeCount: acc.disagreeCount + voteTally.disagreeCount,
          passCount: (acc.passCount || 0) + (voteTally.passCount || 0),
          totalCount: acc.totalCount + voteTally.totalCount,
        };
      },
      { agreeCount: 0, disagreeCount: 0, passCount: 0, totalCount: 0 }
    );
  const otherGroupsAgreeProb = getAgreeProbability(otherGroupsVoteTally);
  return groupAgreeProb - otherGroupsAgreeProb;
}

export function getCommentVoteCount(comment: Comment): number {
  let count = 0;
  for (const groupName in comment.voteTalliesByGroup) {
    const groupCount = comment.voteTalliesByGroup[groupName].totalCount;
    if (groupCount > 0) {
      count += groupCount;
    }
  }
  return count;
}

// Statistics to include in the summary.
export class SummaryStats {
  comments: Comment[];
  constructor(comments: Comment[]) {
    this.comments = comments;
  }

  // The total number of votes in all comments in a conversation.
  get voteCount(): number {
    return this.comments.reduce((sum: number, comment: Comment) => {
      return sum + getCommentVoteCount(comment);
    }, 0);
  }

  // The total number of comments in a conversation.
  get commentCount(): number {
    return this.comments.length;
  }

  /**
   * Returns the top k comments according to the given metric. K defaults to 12.
   */
  topK(
    sortBy: (comment: CommentWithVoteTallies) => number,
    k: number = 12,
    filterFn: (comment: CommentWithVoteTallies) => boolean = () => true
  ): Comment[] {
    return this.comments
      .filter(isCommentWithVoteTalliesType)
      .filter(filterFn)
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, k);
  }

  /**
   * Sort through the comments with the highest getGroupAgreeDifference for the corresponding group
   */
  getRepresentativeComments(group: string, k: number = 12) {
    return this.topK(
      (comment: CommentWithVoteTallies) => getGroupAgreeDifference(comment, group),
      k,
      isCommentWithVoteTalliesType
    );
  }

  /**
   * Sorts topics and their subtopics based on comment count in descending order, with
   * "Other" topics and subtopics going last.
   *
   * @param commentsByTopic A nested map where keys are topic names, values are maps
   *                        where keys are subtopic names, and values are maps where
   *                        keys are comment IDs and values are comment texts.
   * @returns A list of TopicStats objects sorted by comment count with "Other" topics last.
   */
  getStatsByTopic(): TopicStats[] {
    const commentsByTopic = groupCommentsBySubtopic(this.comments);
    const topicStats: TopicStats[] = [];

    for (const topicName in commentsByTopic) {
      const subtopics = commentsByTopic[topicName];
      const subtopicStats: TopicStats[] = [];
      let totalTopicComments = 0;

      for (const subtopicName in subtopics) {
        const commentCount = Object.keys(subtopics[subtopicName]).length;
        totalTopicComments += commentCount;
        subtopicStats.push({ name: subtopicName, commentCount });
      }

      topicStats.push({
        name: topicName,
        commentCount: totalTopicComments,
        subtopicStats: subtopicStats,
      });
    }

    topicStats.sort((a, b) => {
      if (a.name === "Other") return 1;
      if (b.name === "Other") return -1;
      return b.commentCount - a.commentCount;
    });

    topicStats.forEach((topic) => {
      if (topic.subtopicStats) {
        topic.subtopicStats.sort((a, b) => {
          if (a.name === "Other") return 1;
          if (b.name === "Other") return -1;
          return b.commentCount - a.commentCount;
        });
      }
    });

    return topicStats;
  }

  getStatsByGroup(): GroupStats[] {
    const groupNameToStats: { [key: string]: GroupStats } = {};
    for (const comment of this.comments) {
      for (const groupName in comment.voteTalliesByGroup) {
        const commentVoteCount = comment.voteTalliesByGroup[groupName].totalCount;
        if (groupName in groupNameToStats) {
          groupNameToStats[groupName].voteCount += commentVoteCount;
        } else {
          groupNameToStats[groupName] = { name: groupName, voteCount: commentVoteCount };
        }
      }
    }
    return Object.values(groupNameToStats);
  }
}

/**
 * Represents statistics about a topic and its subtopics.
 */
export interface TopicStats {
  name: string;
  commentCount: number;
  subtopicStats?: TopicStats[];
}

/**
 * Represents statistics about a group.
 */
export interface GroupStats {
  name: string;
  voteCount: number;
}
