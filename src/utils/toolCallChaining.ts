import {
  getToolRequests,
  getTextAndImageContent,
  getToolResponses,
  type Message,
} from '../types/message';

export function identifyConsecutiveToolCalls(messages: Message[]): number[][] {
  const chains: number[][] = [];
  let currentChain: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const toolRequests = getToolRequests(message);
    const toolResponses = getToolResponses(message);
    const { textContent } = getTextAndImageContent(message);
    const hasText = textContent.trim().length > 0;

    if (toolResponses.length > 0 && toolRequests.length === 0) {
      continue;
    }

    if (toolRequests.length > 0) {
      if (hasText) {
        if (currentChain.length > 0) {
          if (currentChain.length > 1) {
            chains.push([...currentChain]);
          }
        }
        currentChain = [i];
      } else {
        currentChain.push(i);
      }
    } else if (hasText) {
      if (currentChain.length > 1) {
        chains.push([...currentChain]);
      }
      currentChain = [];
    } else {
      if (currentChain.length > 1) {
        chains.push([...currentChain]);
      }
      currentChain = [];
    }
  }

  if (currentChain.length > 1) {
    chains.push(currentChain);
  }

  return chains;
}

export function identifyToolCallGroups(messages: Message[]): number[][] {
  const groups: number[][] = [];
  let currentGroup: number[] = [];

  const finishGroup = () => {
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const toolRequests = getToolRequests(message);
    const toolResponses = getToolResponses(message);

    if (toolResponses.length > 0 && toolRequests.length === 0) {
      continue;
    }

    if (toolRequests.length > 0) {
      currentGroup.push(i);
    } else {
      finishGroup();
    }
  }

  finishGroup();
  return groups;
}

export function identifyWorkGroups(messages: Message[]): number[][] {
  const groups = new Map<string, number[]>();

  messages.forEach((message, index) => {
    const id = message.metadata.workGroupId;
    if (!id) return;
    const group = groups.get(id) ?? [];
    group.push(index);
    groups.set(id, group);
  });

  return [...groups.values()];
}

export type WorkGroupEntry =
  | { type: 'message'; index: number }
  | { type: 'tools'; indexes: number[] };

export function getWorkGroupEntries(messages: Message[], indexes: number[]): WorkGroupEntry[] {
  const entries: WorkGroupEntry[] = [];
  let toolIndexes: number[] = [];
  const finishTools = () => {
    if (toolIndexes.length > 0) {
      entries.push({ type: 'tools', indexes: toolIndexes });
      toolIndexes = [];
    }
  };

  for (const index of indexes) {
    if (getToolRequests(messages[index]).length > 0) {
      toolIndexes.push(index);
    } else {
      finishTools();
      entries.push({ type: 'message', index });
    }
  }
  finishTools();
  return entries;
}

export function shouldHideTimestamp(messageIndex: number, chains: number[][]): boolean {
  for (const chain of chains) {
    if (chain.includes(messageIndex)) {
      // Hide timestamp for all but the last message in the chain
      return chain[chain.length - 1] !== messageIndex;
    }
  }
  return false;
}

export function isInChain(messageIndex: number, chains: number[][]): boolean {
  return chains.some((chain) => chain.includes(messageIndex));
}
