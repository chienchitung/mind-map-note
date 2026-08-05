import React from 'react';
import { XIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Shortcut: React.FC<{ keys: string[], description: string }> = ({ keys, description }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-text-secondary">{description}</span>
    <div>
      {keys.map((key, i) => (
        <kbd key={i} className="shortcut-key">{key}</kbd>
      ))}
    </div>
  </div>
);


const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title={t('common.closeEsc')} aria-label={t('common.close')}>
          <XIcon className="w-5 h-5" />
        </button>
        <h2 id="help-modal-title" className="text-xl font-semibold mb-6 text-text-main tracking-tight">{t('help.title')}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">{t('help.general')}</h3>
            <Shortcut keys={['?']} description={t('help.toggleHelp')} />
            <Shortcut keys={['⌘', '1']} description={t('help.switchToEditor')} />
            <Shortcut keys={['⌘', '2']} description={t('help.switchToPreview')} />
            <Shortcut keys={['⌘', '3']} description={t('help.switchToMindMap')} />
            <Shortcut keys={['⌘', 'F']} description={t('help.searchNotes')} />
            <Shortcut keys={['⌘', 'Z']} description={t('help.undo')} />
            <Shortcut keys={['⌘', 'Shift', 'Z']} description={t('help.redo')} />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">{t('help.mindMapView')}</h3>
            <Shortcut keys={['↑', '↓', '←', '→']} description={t('help.navigateNodes')} />
            <Shortcut keys={['Enter']} description={t('help.editSelectedNode')} />
            <Shortcut keys={['Space']} description={t('help.expandCollapseNode')} />
            <Shortcut keys={['⌘', '+']} description={t('help.zoomIn')} />
            <Shortcut keys={['⌘', '-']} description={t('help.zoomOut')} />
            <Shortcut keys={['⌘', '0']} description={t('help.resetView')} />
          </div>

           <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">{t('help.editor')}</h3>
            <Shortcut keys={['Tab']} description={t('help.indent')} />
            <Shortcut keys={['Shift', 'Tab']} description={t('help.outdent')} />
            <Shortcut keys={['Enter']} description={t('help.autoContinueList')} />
          </div>

        </div>
         <div className="text-xs text-text-secondary mt-6 text-center">
            {t('help.windowsHint', {
              ctrl: '<ctrl/>',
              cmd: '<cmd/>',
            }).split(/(<ctrl\/>|<cmd\/>)/).map((part, i) => {
              if (part === '<ctrl/>') return <kbd key={i} className="shortcut-key text-xs">Ctrl</kbd>;
              if (part === '<cmd/>') return <kbd key={i} className="shortcut-key text-xs">⌘</kbd>;
              return part;
            })}
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
