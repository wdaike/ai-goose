/**
 * Hub Component
 *
 * The empty-chat landing screen, styled after ChatGPT's Codex home: a
 * centered logo, a "What should we build in {project}?" headline, a row of
 * suggestion cards that prefill the input, and a folder/Local/branch chip
 * bar above the ChatInput. Submitting creates a session and navigates to
 * /pair so the rest of the chat lifecycle lives there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bug, GitBranch, Hammer, Laptop, RefreshCcwDot, Telescope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { AppEvents } from '../constants/events';
import ChatInput from './ChatInput';
import { ChatInputCard } from './ChatInputCard';
import { ChatState } from '../types/chatState';
import 'react-toastify/dist/ReactToastify.css';
import { View, ViewOptions } from '../utils/navigationUtils';
import { useConfig } from './ConfigContext';
import { getInitialWorkingDir } from '../utils/workingDir';
import { createSession } from '../sessions';
import LoadingGoose from './LoadingGoose';
import { Goose } from './icons/Goose';
import { DirSwitcher } from './bottom_menu/DirSwitcher';
import { UserInput } from '../types/message';
import {
  createNextChatExtensionDraft,
  selectNextChatExtensions,
  type NextChatExtensionDraft,
} from '../utils/nextChatExtensions';

const i18n = defineMessages({
  headline: {
    id: 'hub.headline',
    defaultMessage: 'What should we build in {project}?',
  },
  headlineNoProject: {
    id: 'hub.headlineNoProject',
    defaultMessage: 'What should we build?',
  },
  local: { id: 'hub.local', defaultMessage: 'Local' },
  suggestionExplore: {
    id: 'hub.suggestionExplore',
    defaultMessage: 'Explore and understand code',
  },
  suggestionBuild: {
    id: 'hub.suggestionBuild',
    defaultMessage: 'Build a new feature, app, or tool',
  },
  suggestionReview: {
    id: 'hub.suggestionReview',
    defaultMessage: 'Review code and suggest changes',
  },
  suggestionFix: {
    id: 'hub.suggestionFix',
    defaultMessage: 'Fix issues and failures',
  },
});

interface Suggestion {
  key: string;
  label: keyof typeof i18n;
  icon: LucideIcon;
  iconClass: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    key: 'explore',
    label: 'suggestionExplore',
    icon: Telescope,
    iconClass: 'text-blue-200',
    prompt: 'Explore this codebase and explain how it is structured.',
  },
  {
    key: 'build',
    label: 'suggestionBuild',
    icon: Hammer,
    iconClass: 'text-block-teal',
    prompt: 'Help me build a new feature: ',
  },
  {
    key: 'review',
    label: 'suggestionReview',
    icon: RefreshCcwDot,
    iconClass: 'text-green-200',
    prompt: 'Review my current changes and suggest improvements.',
  },
  {
    key: 'fix',
    label: 'suggestionFix',
    icon: Bug,
    iconClass: 'text-block-orange',
    prompt: 'Find and fix failing tests or broken behavior in this project.',
  },
];

const leafDirName = (dir: string) => dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || dir;

export default function Hub({
  setView,
}: {
  setView: (view: View, viewOptions?: ViewOptions) => void;
}) {
  const intl = useIntl();
  const { extensionsList } = useConfig();
  const [workingDir, setWorkingDir] = useState(getInitialWorkingDir());
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [nextChatExtensionDraft, setNextChatExtensionDraft] =
    useState<NextChatExtensionDraft | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const projectName = useMemo(() => leafDirName(workingDir), [workingDir]);
  const homeDir = (window.appConfig?.get('GOOSE_HOME_DIR') as string | undefined) ?? '';
  const isInProject = workingDir !== homeDir;

  const draftForMenu = useMemo(
    () => nextChatExtensionDraft ?? createNextChatExtensionDraft(extensionsList),
    [extensionsList, nextChatExtensionDraft]
  );

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getGitBranch(workingDir)
      .then((branch) => {
        if (!cancelled) setGitBranch(branch);
      })
      .catch(() => {
        if (!cancelled) setGitBranch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workingDir]);

  // rAF is more reliable than autoFocus across async render boundaries.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setDraft(suggestion.prompt);
    requestAnimationFrame(() => {
      const textarea = inputRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  };

  const handleNextChatExtensionDraftChange = useCallback((draft: NextChatExtensionDraft) => {
    setNextChatExtensionDraft(draft);
  }, []);

  const handleSubmit = async (input: UserInput) => {
    const { msg: userMessage, images } = input;
    if (!(images.length > 0 || userMessage.trim()) || isCreatingSession) return;

    setIsCreatingSession(true);

    try {
      const selectedExtensions = nextChatExtensionDraft
        ? selectNextChatExtensions(extensionsList, nextChatExtensionDraft)
        : [];
      const sessionOptions =
        selectedExtensions.length > 0
          ? { extensionConfigs: selectedExtensions }
          : { allExtensions: extensionsList };

      const session = await createSession(workingDir, sessionOptions);
      setNextChatExtensionDraft(null);

      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
      window.dispatchEvent(
        new CustomEvent(AppEvents.ADD_ACTIVE_SESSION, {
          detail: { sessionId: session.id, initialMessage: { msg: userMessage, images } },
        })
      );

      setView('pair', {
        disableAnimation: true,
        resumeSessionId: session.id,
        initialMessage: { msg: userMessage, images },
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      setIsCreatingSession(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 items-center justify-center px-6 relative">
      <div className="w-full max-w-3xl">
        <div className="mb-5 flex justify-center">
          <Goose className="size-12 text-text-secondary" />
        </div>

        <h1 className="mb-10 text-center text-3xl font-normal text-text-primary">
          {isInProject
            ? intl.formatMessage(i18n.headline, {
                project: (
                  <span className="underline decoration-border-secondary decoration-2 underline-offset-8">
                    {projectName}
                  </span>
                ),
              })
            : intl.formatMessage(i18n.headlineNoProject)}
        </h1>

        <div className="mb-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SUGGESTIONS.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.key}
                onClick={() => handleSuggestionClick(suggestion)}
                className="flex flex-col items-start gap-8 rounded-2xl border border-border-primary bg-background-secondary/40 p-4 text-left transition-colors hover:bg-background-secondary"
              >
                <Icon className={`size-5 ${suggestion.iconClass}`} />
                <span className="text-[15px] leading-snug text-text-primary">
                  {intl.formatMessage(i18n[suggestion.label])}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex items-center gap-1 rounded-2xl border border-border-primary bg-background-secondary/40 px-3 py-2">
          <DirSwitcher
            className=""
            sessionId={undefined}
            workingDir={workingDir}
            onWorkingDirChange={setWorkingDir}
          />
          <span className="mx-2 h-4 w-px bg-border-primary" />
          <span className="flex items-center gap-1.5 text-xs text-text-primary/70">
            <Laptop size={16} />
            {intl.formatMessage(i18n.local)}
          </span>
          {gitBranch && (
            <>
              <span className="mx-2 h-4 w-px bg-border-primary" />
              <span className="flex items-center gap-1.5 text-xs text-text-primary/70">
                <GitBranch size={16} />
                <span className="max-w-[200px] truncate">{gitBranch}</span>
              </span>
            </>
          )}
        </div>

        <ChatInputCard>
          <ChatInput
            sessionId={null}
            handleSubmit={handleSubmit}
            chatState={isCreatingSession ? ChatState.LoadingConversation : ChatState.Idle}
            onStop={() => {}}
            initialValue={draft}
            setView={setView}
            totalTokens={0}
            accumulatedInputTokens={0}
            accumulatedOutputTokens={0}
            droppedFiles={[]}
            onFilesProcessed={() => {}}
            messages={[]}
            disableAnimation={false}
            onWorkingDirChange={setWorkingDir}
            inputRef={inputRef}
            nextChatExtensionDraft={draftForMenu}
            onNextChatExtensionDraftChange={handleNextChatExtensionDraftChange}
            hideDirSwitcher
          />
        </ChatInputCard>
      </div>

      {isCreatingSession && (
        <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
          <LoadingGoose chatState={ChatState.LoadingConversation} />
        </div>
      )}
    </div>
  );
}
