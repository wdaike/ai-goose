import { useState, useEffect, useMemo, useCallback } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { errorMessage } from '../../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../../utils/workingDir';
import { defineMessages, useIntl } from '../../../i18n';
import { SearchView } from '../../conversation/SearchView';
import { getSearchShortcutText } from '../../../utils/keyboardShortcuts';
import { listSkillSources } from '../../../acp/sources';

const i18n = defineMessages({
  errorLoadingSkills: {
    id: 'skillsSettings.errorLoadingSkills',
    defaultMessage: 'Error Loading Skills',
  },
  tryAgain: {
    id: 'skillsSettings.tryAgain',
    defaultMessage: 'Try Again',
  },
  noSkillsInstalled: {
    id: 'skillsSettings.noSkillsInstalled',
    defaultMessage: 'No skills installed',
  },
  noSkillsDescription: {
    id: 'skillsSettings.noSkillsDescription',
    defaultMessage:
      'Skills are loaded from SKILL.md files in ~/.config/agents/skills/, .goose/skills/, or other supported directories.',
  },
  noMatchingSkills: {
    id: 'skillsSettings.noMatchingSkills',
    defaultMessage: 'No matching skills found',
  },
  adjustSearchTerms: {
    id: 'skillsSettings.adjustSearchTerms',
    defaultMessage: 'Try adjusting your search terms',
  },
  skillsTitle: {
    id: 'skillsSettings.skillsTitle',
    defaultMessage: 'Skills',
  },
  skillsDescription: {
    id: 'skillsSettings.skillsDescription',
    defaultMessage: 'View installed skills that extend Goose capabilities. {shortcut} to search.',
  },
  searchSkillsPlaceholder: {
    id: 'skillsSettings.searchSkillsPlaceholder',
    defaultMessage: 'Search skills...',
  },
});

interface SkillEntry {
  name: string;
  description: string;
}

function SkillItem({ skill }: { skill: SkillEntry }) {
  return (
    <Card className="py-2 px-4 mb-2 bg-background-primary border-none hover:bg-background-secondary transition-all duration-150">
      <div className="flex justify-between items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base truncate">{skill.name}</h3>
          </div>
          <p className="text-text-secondary text-sm line-clamp-2">{skill.description}</p>
        </div>
      </div>
    </Card>
  );
}

function SkillSkeleton() {
  return (
    <Card className="p-2 mb-2 bg-background-primary">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </Card>
  );
}

export default function SkillsSettingsSection() {
  const intl = useIntl();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSkills = useMemo(() => {
    if (!searchTerm) return skills;
    const searchLower = searchTerm.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(searchLower) ||
        skill.description.toLowerCase().includes(searchLower)
    );
  }, [skills, searchTerm]);

  const loadSkills = useCallback(async () => {
    try {
      setLoading(true);
      setShowSkeleton(true);
      setShowContent(false);
      setError(null);
      const sources = await listSkillSources(getInitialWorkingDir());
      setSkills(sources.map((source) => ({ name: source.name, description: source.description })));
    } catch (err) {
      setError(errorMessage(err, 'Failed to load skills'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (!loading && showSkeleton) {
      const timer = setTimeout(() => {
        setShowSkeleton(false);
        setTimeout(() => setShowContent(true), 50);
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, showSkeleton]);

  const renderContent = () => {
    if (loading || showSkeleton) {
      return (
        <div className="space-y-2">
          <SkillSkeleton />
          <SkillSkeleton />
          <SkillSkeleton />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
          <AlertCircle className="h-12 w-12 text-text-danger mb-4" />
          <p className="text-lg mb-2">{intl.formatMessage(i18n.errorLoadingSkills)}</p>
          <p className="text-sm text-center mb-4">{error}</p>
          <Button onClick={loadSkills} variant="default">
            {intl.formatMessage(i18n.tryAgain)}
          </Button>
        </div>
      );
    }

    if (skills.length === 0) {
      return (
        <div className="flex flex-col justify-center pt-2">
          <p className="text-lg">{intl.formatMessage(i18n.noSkillsInstalled)}</p>
          <p className="text-sm text-text-secondary">
            {intl.formatMessage(i18n.noSkillsDescription)}
          </p>
        </div>
      );
    }

    if (filteredSkills.length === 0 && searchTerm) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
          <Zap className="h-12 w-12 mb-4" />
          <p className="text-lg mb-2">{intl.formatMessage(i18n.noMatchingSkills)}</p>
          <p className="text-sm">{intl.formatMessage(i18n.adjustSearchTerms)}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filteredSkills.map((skill) => (
          <SkillItem key={skill.name} skill={skill} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1" data-search-scroll-area>
      <Card className="pb-2 rounded-lg">
        <CardHeader className="pb-2">
          <CardTitle>{intl.formatMessage(i18n.skillsTitle)}</CardTitle>
          <CardDescription>
            {intl.formatMessage(i18n.skillsDescription, { shortcut: getSearchShortcutText() })}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <SearchView
            onSearch={(term) => setSearchTerm(term)}
            placeholder={intl.formatMessage(i18n.searchSkillsPlaceholder)}
          >
            <div
              className={`relative transition-all duration-300 ${
                showContent || showSkeleton ? 'opacity-100 animate-in fade-in' : 'opacity-0'
              }`}
            >
              {renderContent()}
            </div>
          </SearchView>
        </CardContent>
      </Card>
    </div>
  );
}
