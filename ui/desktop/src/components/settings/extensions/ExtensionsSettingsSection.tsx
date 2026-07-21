import { useEffect, useState } from 'react';
import kebabCase from 'lodash/kebabCase';
import { Plus } from 'lucide-react';
import type { ExtensionConfig } from '../../../types/extensions';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { GPSIcon } from '../../ui/icons';
import { SearchView } from '../../conversation/SearchView';
import { getSearchShortcutText } from '../../../utils/keyboardShortcuts';
import { useConfig } from '../../ConfigContext';
import ExtensionsSection from './ExtensionsSection';
import ExtensionModal from './modal/ExtensionModal';
import { createExtensionConfig, ExtensionFormData, getDefaultFormData } from './utils';
import { activateExtensionDefault } from '../extensions';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  heading: {
    id: 'extensionsSettings.heading',
    defaultMessage: 'Extensions',
  },
  description: {
    id: 'extensionsSettings.description',
    defaultMessage:
      "These extensions use the Model Context Protocol (MCP). They can expand Goose's capabilities using three main components: Prompts, Resources, and Tools. {searchShortcut} to search.",
  },
  defaultNote: {
    id: 'extensionsSettings.defaultNote',
    defaultMessage:
      'Extensions enabled here are used as the default for new chats. You can also toggle active extensions during chat.',
  },
  addCustomExtension: {
    id: 'extensionsSettings.addCustomExtension',
    defaultMessage: 'Add custom extension',
  },
  browseExtensions: {
    id: 'extensionsSettings.browseExtensions',
    defaultMessage: 'Browse extensions',
  },
  searchPlaceholder: {
    id: 'extensionsSettings.searchPlaceholder',
    defaultMessage: 'Search extensions...',
  },
  addExtension: {
    id: 'extensionsSettings.addExtension',
    defaultMessage: 'Add Extension',
  },
});

export interface ExtensionsSettingsSectionProps {
  deepLinkConfig?: ExtensionConfig;
  showEnvVars?: boolean;
}

function scrollToExtension(extensionName: string) {
  setTimeout(() => {
    const element = document.getElementById(`extension-${kebabCase(extensionName)}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.5)';
    setTimeout(() => {
      element.style.boxShadow = '';
    }, 2000);
  }, 200);
}

export default function ExtensionsSettingsSection({
  deepLinkConfig,
  showEnvVars,
}: ExtensionsSettingsSectionProps) {
  const intl = useIntl();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const { addExtension } = useConfig();

  useEffect(() => {
    if (deepLinkConfig && !showEnvVars) {
      setRefreshKey((prevKey) => prevKey + 1);
    }
  }, [deepLinkConfig, showEnvVars]);

  useEffect(() => {
    if (deepLinkConfig?.name && refreshKey > 0) {
      scrollToExtension(deepLinkConfig.name);
    }
  }, [deepLinkConfig?.name, refreshKey]);

  const handleAddExtension = async (formData: ExtensionFormData) => {
    setIsAddModalOpen(false);

    try {
      await activateExtensionDefault({
        addToConfig: addExtension,
        extensionConfig: createExtensionConfig(formData),
      });
    } catch (error) {
      console.error('Failed to activate extension:', error);
    } finally {
      setRefreshKey((prevKey) => prevKey + 1);
    }
  };

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1" data-search-scroll-area>
      <Card className="pb-2 rounded-lg">
        <CardHeader className="pb-2">
          <CardTitle>{intl.formatMessage(i18n.heading)}</CardTitle>
          <CardDescription>
            {intl.formatMessage(i18n.description, { searchShortcut: getSearchShortcutText() })}
          </CardDescription>
          <CardDescription>{intl.formatMessage(i18n.defaultNote)}</CardDescription>
          <div className="flex gap-3 pt-3">
            <Button
              className="flex items-center gap-2 justify-center"
              variant="default"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {intl.formatMessage(i18n.addCustomExtension)}
            </Button>
            <Button
              className="flex items-center gap-2 justify-center"
              variant="secondary"
              onClick={() => window.open('https://goose-docs.ai/v1/extensions/', '_blank')}
            >
              <GPSIcon size={12} />
              {intl.formatMessage(i18n.browseExtensions)}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          <SearchView
            onSearch={(term) => setSearchTerm(term)}
            placeholder={intl.formatMessage(i18n.searchPlaceholder)}
          >
            <ExtensionsSection
              key={refreshKey}
              deepLinkConfig={deepLinkConfig}
              showEnvVars={showEnvVars}
              hideButtons={true}
              searchTerm={searchTerm}
              onModalClose={scrollToExtension}
            />
          </SearchView>
        </CardContent>
      </Card>

      {isAddModalOpen && (
        <ExtensionModal
          title={intl.formatMessage(i18n.addCustomExtension)}
          initialData={getDefaultFormData()}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddExtension}
          submitLabel={intl.formatMessage(i18n.addExtension)}
          modalType={'add'}
        />
      )}
    </div>
  );
}
