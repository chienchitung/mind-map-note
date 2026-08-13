// The `zh` dictionary is the source of truth for which keys exist —
// `en`'s type is derived from it, so TypeScript flags any key that's
// missing (or misspelled) in either language at compile time.
const zh = {
  // --- common (shared across modals/panels) ---
  'common.close': '關閉',
  'common.closeEsc': '關閉 (Esc)',
  'common.cancel': '取消',
  'common.save': '儲存',
  'common.delete': '刪除',
  'common.retry': '重試',
  'common.confirm': '確定',
  'common.loading': '讀取中...',

  // --- header ---
  'header.toggleSidebar': '切換側邊欄',
  'header.sidebar': '側邊欄',
  'header.searchNotes': '搜尋筆記',
  'header.searchPlaceholder': '搜尋所有筆記... (⌘F)',
  'header.editorMode': '編輯模式',
  'header.previewMode': '預覽模式',
  'header.mindMapMode': '思維導圖模式',
  'header.switchLayout': '切換版面配置',
  'header.layoutMindMap': '心智圖',
  'header.layoutLogic': '邏輯圖',
  'header.layoutOrganizational': '組織圖',
  'header.voiceNote': '語音筆記',
  'header.aiPartner': 'AI 學習夥伴',
  'header.more': '更多',
  'header.moreOptions': '更多選項',
  'header.toggleTheme': '切換主題',
  'header.undo': '復原',
  'header.redo': '重做',
  'header.exportMindMapImage': '匯出心智圖圖片 (JPG)',
  'header.exportMarkdown': '匯出為 Markdown (.md)',
  'header.exportPDF': '匯出為 PDF',
  'header.exportNote': '匯出筆記',
  'header.settings': '設定',
  'header.help': '幫助',

  // --- sidebar / file explorer ---
  'sidebar.tabFiles': '檔案',
  'sidebar.tabOutline': '大綱',
  'sidebar.tabRecordings': '錄音',
  'sidebar.tabTrash': '垃圾桶',
  'sidebar.newNote': '新增筆記',
  'sidebar.newFolder': '新增資料夾',
  'sidebar.collapseSidebar': '收合側邊欄',
  'sidebar.selectOrCreateNote': '請先選擇或建立一篇筆記',
  'fileExplorer.rename': '重新命名',
  'fileExplorer.deleteConfirm': '確定要將 "{{name}}" 移到垃圾桶嗎？之後可以在垃圾桶分頁復原。',
  'fileExplorer.moveTo': '移動到...',
  'fileExplorer.dropToMoveOut': '拖放到此處以移出資料夾',
  'fileExplorer.moveModalTitle': '移動「{{name}}」到...',
  'fileExplorer.rootFolder': '根目錄',
  'fileExplorer.currentLocation': '（目前位置）',

  // --- trash tab ---
  'trash.empty': '垃圾桶是空的。從側邊欄刪除的筆記或資料夾會顯示在這裡，預設 30 天後自動永久刪除。',
  'trash.autoDeleteIn': '{{days}} 天後自動永久刪除',
  'trash.autoDeleteToday': '將於今天自動永久刪除',
  'trash.restore': '復原',
  'trash.deleteForever': '永久刪除',
  'trash.deleteForeverConfirm': '確定要永久刪除 "{{name}}" 嗎？此動作無法復原。',
  'trash.emptyTrash': '清空垃圾桶',
  'trash.emptyTrashConfirm': '確定要永久刪除垃圾桶中的所有項目嗎？此動作無法復原。',

  // --- settings modal ---
  'settings.title': '設定',
  'settings.language': '語言',
  'settings.languageDescription': '切換介面顯示語言，AI 生成的新筆記與對話也會使用這個語言（原始錄音逐字稿不受影響，永遠維持原本語言）。',
  'settings.languageZh': '繁體中文',
  'settings.languageEn': 'English',
  'settings.aiPartnerSectionTitle': 'AI 學習夥伴',
  'settings.aiPartnerDescription': '此應用程式的 AI 功能由 Google Gemini 提供。您的金鑰只會保存在「這台裝置的瀏覽器」裡，不會上傳到任何伺服器。',
  'settings.geminiApiKeyLabel': 'Gemini API 金鑰',
  'settings.apiKeyPlaceholder': '貼上您的 API 金鑰...',
  'settings.reveal': '顯示',
  'settings.hide': '隱藏',
  'settings.getGeminiKey': '還沒有金鑰？前往 Google AI Studio 免費取得 →',
  'settings.clearKey': '清除金鑰',
  'settings.voiceNoteSectionTitle': '語音筆記',
  'settings.voiceNoteDescription': '語音轉錄功能由 Groq 提供。您的金鑰只會保存在「這台裝置的瀏覽器」裡，不會上傳到任何伺服器。每次生成筆記後，原始錄音與逐字稿會保存在側邊欄的「錄音」分頁中，可以在那裡下載或刪除。',
  'settings.groqApiKeyLabel': 'Groq API 金鑰',
  'settings.getGroqKey': '還沒有金鑰？前往 Groq Console 免費取得 →',
  'settings.transcriptionLanguage': '轉錄語言',
  'settings.transcriptionLanguageDescription': '轉錄辨識錄音內容所用的語言，與上方的介面顯示語言無關——即使切換介面語言，也不會影響您實際說話的語言。「自動偵測」會讓系統自行判斷每段錄音的語言；若偵測不準確（例如錄音開頭是安靜或雜訊），可改為指定固定語言。',
  'settings.transcriptionLanguageAuto': '自動偵測',
  'settings.backupSectionTitle': '資料備份與還原',
  'settings.backupDescription': '所有筆記都只保存在「這台裝置的瀏覽器」裡。建議定期匯出備份，換裝置或清除瀏覽器資料前也別忘了先備份。',
  'settings.exportBackup': '匯出備份',
  'settings.importBackup': '匯入備份',

  // --- help modal ---
  'help.title': '鍵盤快捷鍵',
  'help.general': '通用',
  'help.toggleHelp': '顯示/隱藏此幫助',
  'help.switchToEditor': '切換到編輯器視圖',
  'help.switchToPreview': '切換到預覽視圖',
  'help.switchToMindMap': '切換到思維導圖視圖',
  'help.searchNotes': '搜尋筆記',
  'help.undo': '復原',
  'help.redo': '重做',
  'help.mindMapView': '思維導圖視圖',
  'help.navigateNodes': '導航節點',
  'help.editSelectedNode': '編輯選定的節點',
  'help.expandCollapseNode': '展開/折疊節點',
  'help.zoomIn': '放大',
  'help.zoomOut': '縮小',
  'help.resetView': '重置視圖',
  'help.editor': '編輯器',
  'help.indent': '縮排',
  'help.outdent': '減少縮排',
  'help.autoContinueList': '自動繼續列表',
  'help.windowsHint': '提示：在 Windows 和 Linux 上，使用 {{ctrl}} 代替 {{cmd}}。',

  // --- voice note modal ---
  'voiceNote.title': '語音筆記',
  'voiceNote.sourceTabs': '語音來源',
  'voiceNote.tabRecord': '錄音',
  'voiceNote.tabUpload': '上傳檔案',
  'voiceNote.recordDescription': '錄下你想整理的內容，AI 會自動轉成逐字稿並生成一篇結構化的筆記。長時間錄音會自動分段即時轉錄，錄多久都不怕。',
  'voiceNote.captureTabAudio': '同時擷取分享分頁的聲音（例如視訊會議對話）',
  'voiceNote.captureTabAudioUnsupported': '此功能僅支援 Chrome / Edge 瀏覽器',
  'voiceNote.captureVideo': '同時錄下分享的畫面影像',
  'voiceNote.startRecording': '開始錄音',
  'voiceNote.uploadDescription': '上傳一段錄音或影片檔案，AI 會自動轉成逐字稿並生成一篇結構化的筆記。',
  'voiceNote.dropzoneTitle': '點擊或拖曳音訊或影片檔到這裡',
  'voiceNote.dropzoneHint': '影片檔會自動抽取音軌，超過 25 MB 會自動分段處理',
  'voiceNote.selectFile': '選擇音訊或影片檔案',
  'voiceNote.recordingVideoHint': '同時錄製畫面中',
  'voiceNote.backgroundTranscribed': '背景已即時轉錄 {{count}} 段，繼續錄音中...',
  'voiceNote.stopAndGenerate': '停止並生成筆記',
  'voiceNote.discardRecordingConfirm': '確定要捨棄這段{{kind}}嗎？此動作無法復原。',
  'voiceNote.discardCancelRecordingConfirm': '確定要取消並捨棄這段{{kind}}嗎？此動作無法復原。',
  'voiceNote.kindVideo': '錄影',
  'voiceNote.kindAudio': '錄音',
  'voiceNote.discardAndCancel': '取消並捨棄這段錄音',
  'voiceNote.discardOnly': '取消並捨棄',
  'voiceNote.keep': '保留',
  'voiceNote.confirmDiscard': '確定捨棄',
  'voiceNote.recordingComplete': '錄製完成',
  'voiceNote.reviewVideoHint': '建議先下載影片備份，繼續後畫面就無法再取回。AI 仍會在背景整理逐字稿。',
  'voiceNote.downloadVideo': '下載影片檔',
  'voiceNote.continueGenerating': '繼續產生筆記',
  'voiceNote.downloadKind': '下載{{kind}}檔',
  'voiceNote.downloadVideoKind': '影片',
  'voiceNote.downloadAudioKind': '錄音',
  'voiceNote.cancel': '取消',
  'voiceNote.generatingLabel': 'AI 正在整理筆記內容...',
  'voiceNote.extractingAudio': '正在從影片抽取音軌...',
  'voiceNote.splittingFile': '檔案較大，正在自動分段處理...',
  'voiceNote.uploadingAudio': '正在上傳音檔...',
  'voiceNote.transcribingSegments': '正在轉錄語音（{{completed}} / {{total}} 段）...',
  'voiceNote.transcribing': 'AI 正在辨識語音內容...',
  'voiceNote.rateLimitMultiSegment': '已達 Groq 語音轉錄速率上限，{{seconds}} 秒後自動重試（已完成 {{completed}} / {{total}} 段，不需重新上傳）...',
  'voiceNote.rateLimitSingle': '已達 Groq 語音轉錄速率上限，{{seconds}} 秒後自動重試...',
  'voiceNote.recordingLengthPrefix': '錄音長度 {{duration}}，',
  'voiceNote.pleaseWait': '請稍候，這可能需要幾秒到十幾秒不等。',
  'voiceNote.minimizeBackground': '縮小到背景（不中斷）',
  'voiceNote.minimize': '縮小到背景',
  'voiceNote.canMinimizeHint': '可以縮小視窗，繼續瀏覽其他筆記',

  // --- voice recordings panel ---
  'voiceRecordings.storageUsed': '目前使用空間',
  'voiceRecordings.empty': '目前沒有保存的錄音。用語音筆記生成筆記後，原始錄音與逐字稿會顯示在這裡。',
  'voiceRecordings.goToNote': '前往這篇筆記',
  'voiceRecordings.noteDeleted': '（筆記已刪除）',
  'voiceRecordings.downloadAudio': '下載音檔',
  'voiceRecordings.downloadTranscript': '下載逐字稿',
  'voiceRecordings.delete': '刪除',
  'voiceRecordings.deleteConfirm': '確定要刪除這則錄音與逐字稿嗎？此動作無法復原（不會影響已生成的筆記內容）。',
  'voiceRecordings.clearAll': '清除所有語音錄音',
  'voiceRecordings.clearAllConfirm': '確定要清除所有已保存的語音錄音與逐字稿嗎？此動作無法復原（不會影響已生成的筆記內容）。',

  // --- voice note status pill ---
  'voicePill.processing': '處理中...',
  'voicePill.recordingVideo': '錄影中 {{duration}}',
  'voicePill.recordingAudio': '錄音中 {{duration}}',
  'voicePill.awaitingVideoReview': '等待確認下載影片',
  'voicePill.extractingAudio': '抽取音軌中...',
  'voicePill.splitting': '分段處理中...',
  'voicePill.uploading': '上傳音檔中...',
  'voicePill.transcribingSegments': '轉錄中 {{completed}}/{{total}} 段',
  'voicePill.transcribing': '辨識語音中...',
  'voicePill.generating': 'AI 整理筆記中...',
  'voicePill.rateLimited': '速率限制中，{{seconds}} 秒後重試',
  'voicePill.error': '語音筆記發生錯誤',
  'voicePill.backToVoiceNote': '回到語音筆記',
  'voicePill.backToVoiceNoteWithLabel': '回到語音筆記：{{label}}',

  // --- editor ---
  'editor.plainMode': '純文字模式（Markdown 原始語法）',
  'editor.plainModeLabel': '純文字模式',
  'editor.richMode': '格式化模式（所見即所得）',
  'editor.richModeLabel': '格式化模式',
  'editor.copied': '已複製！',
  'editor.copyContent': '複製內容',
  'editor.copiedLabel': '已複製',
  'editor.uploadImage': '上傳圖片',
  'editor.dropImageHint': '拖曳圖片至此以上傳',
  'editor.placeholder': '在這裡開始您的筆記...',
  'editor.stats': '{{chars}} 字元・{{words}} 字',
  'editor.statsLabel': '字元數與字數統計',

  // --- rich text editor toolbar ---
  'richEditor.imageLoading': '圖片載入中…',
  'richEditor.placeholder': '在這裡開始您的筆記…',
  'richEditor.heading1': '標題 1',
  'richEditor.heading2': '標題 2',
  'richEditor.heading3': '標題 3',
  'richEditor.bold': '粗體 (⌘B)',
  'richEditor.italic': '斜體 (⌘I)',
  'richEditor.blockquote': '引言',
  'richEditor.bulletList': '項目清單',
  'richEditor.orderedList': '編號清單',
  'richEditor.insertImage': '插入圖片',

  // --- AI chat panel ---
  'aiPanel.title': 'AI 學習夥伴',
  'aiPanel.newConversation': '清除對話並開始新對話',
  'aiPanel.collapse': '收合側邊欄 (Esc)',
  'aiPanel.collapseLabel': '收合 AI 面板',
  'aiPanel.inputPlaceholder': '在這裡問問題...（Enter 傳送，Shift + Enter 換行）',
  'aiPanel.inputLabel': '向 AI 學習夥伴提問',
  'aiPanel.sendShortcut': '傳送 (Enter)',
  'aiPanel.send': '傳送訊息',
  'aiPanel.stopGenerating': '停止生成',
  'aiPanel.greeting': '你好！我已經閱讀完 **{{noteName}}** 的內容了。我可以協助你做什麼呢？試試看問我：\n\n- 幫我總結這份筆記\n- 根據筆記內容出幾道練習題\n- 用更簡單的方式解釋第二段',
  'aiPanel.contextErrorReminder': '（提醒：讀取這篇筆記的內容時發生錯誤，後續回答可能沒有參考到筆記內容：{{error}}）',
  'aiPanel.errorPrefix': '抱歉，發生錯誤：{{error}}',

  // --- mind map ---
  'mindMap.zoomIn': '放大',
  'mindMap.zoomOut': '縮小',
  'mindMap.resetView': '重置視圖',
  'mindMap.emptyState': '請在編輯器中新增內容以生成思維導圖。',

  // --- search ---
  'search.placeholder': '搜尋所有筆記... (⌘F)',
  'search.mobilePlaceholder': '搜尋所有筆記...',
  'search.ariaLabel': '搜尋所有筆記',
  'search.clear': '清除搜尋',
  'search.cancel': '取消',
  'search.noResultsFor': '無符合 "{{query}}" 的結果',
  'search.typeToSearch': '輸入關鍵字搜尋所有筆記',

  // --- error boundary ---
  'errorBoundary.title': '發生錯誤，畫面無法顯示',
  'errorBoundary.retry': '重試',

  // --- toast ---
  'toast.close': '關閉提示',
  'toast.closeLabel': '關閉',

  // --- app-level toasts / confirms / empty states ---
  'app.untitledNote': '筆記',
  'app.selectOrCreateNote': '請選擇一篇筆記或建立新筆記',
  'app.exportedBackup': '已匯出備份檔案。',
  'app.importBackupReadError': '無法讀取備份檔案，請確認檔案格式正確。',
  'app.importBackupInvalid': '這不是有效的備份檔案。',
  'app.importBackupConfirm': '匯入備份將會取代目前所有的筆記與資料夾，此動作無法復原。確定要繼續嗎？',
  'app.importBackupSuccess': '已成功匯入備份。',
  'app.importBackupReadFileError': '讀取檔案時發生錯誤。',
  'app.voiceNoteCreated': '已從錄音建立新筆記。',
  'app.voiceNoteSaveError': '筆記已建立，但保存原始錄音與逐字稿時發生錯誤（可能是儲存空間不足）。',
  'app.voiceNotePartialTranscript': '已從錄音建立新筆記，但有 {{count}} 段錄音無法辨識而被略過，內容可能不完整。',
  'app.voiceNoteErrorPrefix': '語音筆記發生錯誤：{{message}}',
  'app.voiceNoteMissingKeys': '請先在設定中填入 Groq 與 Gemini API 金鑰，才能使用語音筆記功能。',
  'app.chatErrorPrefix': '抱歉，發生錯誤： {{error}}',
  'app.chatStopped': '（已停止生成回覆）',
  'app.deleteRecordingError': '刪除語音錄音時發生錯誤。',
  'app.clearRecordingsSuccess': '已清除所有已保存的語音錄音。',
  'app.clearRecordingsError': '清除語音錄音時發生錯誤。',

  // --- welcome/starter note (shown for brand-new users only) ---
  'app.welcomeNote': `# 歡迎使用思維導圖筆記工具

## 核心理念
- **輕鬆寫作，自動成圖**：您只需專注於使用 Markdown 語法（如標題 '#' 和列表 '-'）來撰寫筆記，應用程式會自動將其轉換為結構化的思維導圖。
- **階層式結構**：透過標題層級和列表縮排，輕鬆建立複雜的思緒層次。

## 開始使用
- **試著編輯看看！**
  - 直接修改這份文件，新增您自己的標題或列表項。
- **查看快捷鍵**
  - 按下 \`?\` 鍵可以打開快捷鍵說明，了解更多高效操作。

> 現在，開始您的第一次思維導圖筆記之旅吧！
`,
  'app.firstNoteName': '我的第一篇筆記',
  'app.untitledNoteName': '無標題筆記',
  'app.newFolderName': '新資料夾',
  'app.storageFullError': '儲存空間已滿，最新的變更目前無法儲存。請刪除較大的圖片或筆記以釋出空間。',
  'app.storageSaveError': '筆記儲存失敗，變更可能會在重新整理後遺失。',

  // --- voice note pipeline errors (hooks/useVoiceNotePipeline.ts) ---
  'pipeline.unknownError': '發生未知的錯誤，請再試一次。',
  'pipeline.noSpeechDetected': '沒有辨識到任何語音內容，請確認錄音或音檔中有清楚的說話聲。',
  'pipeline.missingGeminiKey': '尚未設定 Gemini API 金鑰，請至設定頁面新增。',
  'pipeline.recordingUnsupported': '這個瀏覽器不支援錄音功能，請改用最新版的 Chrome、Edge 或 Safari。',
  'pipeline.tabShareUnsupported': '這個瀏覽器不支援分享分頁擷取，請改用 Chrome 或 Edge，或取消勾選該選項。',
  'pipeline.micPermissionDenied': '麥克風權限被拒絕，請至瀏覽器設定允許存取麥克風後再試一次。',
  'pipeline.micNotFound': '找不到可用的麥克風裝置。',
  'pipeline.recordingStartFailed': '無法啟動錄音，請確認麥克風已連接並授權存取。',
  'pipeline.unsupportedFileFormat': '不支援的檔案格式，請上傳 mp3、wav、m4a、webm 等常見音訊格式，或 mp4、mov、webm 等常見影片格式。',
  'pipeline.fileTooLargeToSplit': '檔案超過 {{maxMb}} MB，瀏覽器端無法處理這麼大的檔案，請先壓縮或改用「錄音」功能分段錄製。',
  'pipeline.cannotParseFile': '無法解析這個檔案，請確認檔案未損毀。',

  // --- audio splitter errors (utils/audioSplitter.ts) ---
  'audioSplitter.decodeUnsupported': '這個瀏覽器不支援音訊解碼，無法自動分段這個檔案，請改用「錄音」功能或先手動壓縮檔案。',
  'audioSplitter.cannotParseAudio': '無法解析這個音訊檔案，請確認檔案未損毀，或改用「錄音」功能分段錄製。',

  // --- groq transcription service errors ---
  'groq.missingApiKey': '尚未設定 Groq API 金鑰。',
  'groq.fileTooLarge': '檔案超過 {{maxMb}} MB 的轉錄上限，請先壓縮音檔，或改用「錄音」分段轉錄。',
  'groq.noSpeechDetected': '沒有辨識到任何語音內容，請確認錄音時有清楚說話。',
  'groq.cannotParseResponse': '無法解析語音轉錄的回應內容。',
  'groq.transcriptionFailedHttp': '語音轉錄失敗（HTTP {{status}}）。',
  'groq.networkError': '網路連線發生錯誤，語音轉錄失敗。',

  // --- gemini chat service ---
  'gemini.missingApiKey': '尚未設定 Gemini API 金鑰。',
  'gemini.unknownError': '發生未知的錯誤。',
  'gemini.emptyTranscript': '逐字稿是空的，無法生成筆記。',
  'gemini.noteGenerationFailed': 'AI 未能從逐字稿生成筆記內容，請再試一次。',
} as const;

export type TranslationKey = keyof typeof zh;

const en: Record<TranslationKey, string> = {
  // --- common ---
  'common.close': 'Close',
  'common.closeEsc': 'Close (Esc)',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',

  // --- header ---
  'header.toggleSidebar': 'Toggle sidebar',
  'header.sidebar': 'Sidebar',
  'header.searchNotes': 'Search notes',
  'header.searchPlaceholder': 'Search all notes... (⌘F)',
  'header.editorMode': 'Editor mode',
  'header.previewMode': 'Preview mode',
  'header.mindMapMode': 'Mind map mode',
  'header.switchLayout': 'Switch layout',
  'header.layoutMindMap': 'Mind Map',
  'header.layoutLogic': 'Logic Chart',
  'header.layoutOrganizational': 'Org Chart',
  'header.voiceNote': 'Voice Note',
  'header.aiPartner': 'AI Study Partner',
  'header.more': 'More',
  'header.moreOptions': 'More options',
  'header.toggleTheme': 'Toggle theme',
  'header.undo': 'Undo',
  'header.redo': 'Redo',
  'header.exportMindMapImage': 'Export mind map image (JPG)',
  'header.exportMarkdown': 'Export as Markdown (.md)',
  'header.exportPDF': 'Export as PDF',
  'header.exportNote': 'Export note',
  'header.settings': 'Settings',
  'header.help': 'Help',

  // --- sidebar / file explorer ---
  'sidebar.tabFiles': 'Files',
  'sidebar.tabOutline': 'Outline',
  'sidebar.tabRecordings': 'Recordings',
  'sidebar.tabTrash': 'Trash',
  'sidebar.newNote': 'New note',
  'sidebar.newFolder': 'New folder',
  'sidebar.collapseSidebar': 'Collapse sidebar',
  'sidebar.selectOrCreateNote': 'Select or create a note to get started',
  'fileExplorer.rename': 'Rename',
  'fileExplorer.deleteConfirm': 'Move "{{name}}" to trash? You can restore it from the Trash tab later.',
  'fileExplorer.moveTo': 'Move to...',
  'fileExplorer.dropToMoveOut': 'Drop here to move out of the folder',
  'fileExplorer.moveModalTitle': 'Move "{{name}}" to...',
  'fileExplorer.rootFolder': 'Root',
  'fileExplorer.currentLocation': '(current location)',

  // --- trash tab ---
  'trash.empty': 'Trash is empty. Notes and folders deleted from the sidebar show up here, and are permanently deleted after 30 days by default.',
  'trash.autoDeleteIn': 'Permanently deleted in {{days}} days',
  'trash.autoDeleteToday': 'Will be permanently deleted today',
  'trash.restore': 'Restore',
  'trash.deleteForever': 'Delete forever',
  'trash.deleteForeverConfirm': 'Permanently delete "{{name}}"? This cannot be undone.',
  'trash.emptyTrash': 'Empty trash',
  'trash.emptyTrashConfirm': 'Permanently delete everything in the trash? This cannot be undone.',

  // --- settings modal ---
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageDescription': 'Switches the interface language. New AI-generated notes and chat replies will also use this language (the raw recording transcript is unaffected and always keeps its original spoken language).',
  'settings.languageZh': '繁體中文',
  'settings.languageEn': 'English',
  'settings.aiPartnerSectionTitle': 'AI Study Partner',
  'settings.aiPartnerDescription': "This app's AI features are powered by Google Gemini. Your key is only stored in this device's browser — it's never uploaded to any server.",
  'settings.geminiApiKeyLabel': 'Gemini API Key',
  'settings.apiKeyPlaceholder': 'Paste your API key...',
  'settings.reveal': 'Show',
  'settings.hide': 'Hide',
  'settings.getGeminiKey': "Don't have a key yet? Get one free from Google AI Studio →",
  'settings.clearKey': 'Clear key',
  'settings.voiceNoteSectionTitle': 'Voice Note',
  'settings.voiceNoteDescription': 'Voice transcription is powered by Groq. Your key is only stored in this device\'s browser — it\'s never uploaded to any server. After each note is generated, the original recording and transcript are saved in the "Recordings" tab in the sidebar, where you can download or delete them.',
  'settings.groqApiKeyLabel': 'Groq API Key',
  'settings.getGroqKey': "Don't have a key yet? Get one free from Groq Console →",
  'settings.transcriptionLanguage': 'Transcription Language',
  'settings.transcriptionLanguageDescription': "The language used to recognize your recordings — independent from the interface language above, so switching the interface language never changes what language you're actually understood to be speaking. \"Auto-detect\" lets the system determine each recording's language on its own; if detection is inaccurate (e.g. a quiet or noisy opening), pin it to a fixed language instead.",
  'settings.transcriptionLanguageAuto': 'Auto-detect',
  'settings.backupSectionTitle': 'Data Backup & Restore',
  'settings.backupDescription': "All notes are only stored in this device's browser. We recommend exporting a backup regularly, and especially before switching devices or clearing browser data.",
  'settings.exportBackup': 'Export backup',
  'settings.importBackup': 'Import backup',

  // --- help modal ---
  'help.title': 'Keyboard Shortcuts',
  'help.general': 'General',
  'help.toggleHelp': 'Show/hide this help',
  'help.switchToEditor': 'Switch to editor view',
  'help.switchToPreview': 'Switch to preview view',
  'help.switchToMindMap': 'Switch to mind map view',
  'help.searchNotes': 'Search notes',
  'help.undo': 'Undo',
  'help.redo': 'Redo',
  'help.mindMapView': 'Mind Map View',
  'help.navigateNodes': 'Navigate nodes',
  'help.editSelectedNode': 'Edit selected node',
  'help.expandCollapseNode': 'Expand/collapse node',
  'help.zoomIn': 'Zoom in',
  'help.zoomOut': 'Zoom out',
  'help.resetView': 'Reset view',
  'help.editor': 'Editor',
  'help.indent': 'Indent',
  'help.outdent': 'Outdent',
  'help.autoContinueList': 'Auto-continue list',
  'help.windowsHint': 'Tip: on Windows and Linux, use {{ctrl}} instead of {{cmd}}.',

  // --- voice note modal ---
  'voiceNote.title': 'Voice Note',
  'voiceNote.sourceTabs': 'Voice source',
  'voiceNote.tabRecord': 'Record',
  'voiceNote.tabUpload': 'Upload File',
  'voiceNote.recordDescription': "Record what you'd like to organize — AI will automatically transcribe it and generate a structured note. Long recordings are transcribed live in segments, so there's no limit on how long you record.",
  'voiceNote.captureTabAudio': 'Also capture audio from a shared tab (e.g. a video call)',
  'voiceNote.captureTabAudioUnsupported': 'This feature is only supported in Chrome / Edge',
  'voiceNote.captureVideo': 'Also record the shared screen video',
  'voiceNote.startRecording': 'Start recording',
  'voiceNote.uploadDescription': 'Upload an audio or video file — AI will automatically transcribe it and generate a structured note.',
  'voiceNote.dropzoneTitle': 'Click or drag an audio/video file here',
  'voiceNote.dropzoneHint': 'Video files have their audio track extracted automatically; files over 25 MB are split automatically',
  'voiceNote.selectFile': 'Select an audio or video file',
  'voiceNote.recordingVideoHint': 'Recording video too',
  'voiceNote.backgroundTranscribed': '{{count}} segment(s) transcribed live in the background, still recording...',
  'voiceNote.stopAndGenerate': 'Stop and generate note',
  'voiceNote.discardRecordingConfirm': 'Discard this {{kind}}? This cannot be undone.',
  'voiceNote.discardCancelRecordingConfirm': 'Cancel and discard this {{kind}}? This cannot be undone.',
  'voiceNote.kindVideo': 'video recording',
  'voiceNote.kindAudio': 'recording',
  'voiceNote.discardAndCancel': 'Cancel and discard this recording',
  'voiceNote.discardOnly': 'Cancel and discard',
  'voiceNote.keep': 'Keep',
  'voiceNote.confirmDiscard': 'Discard',
  'voiceNote.recordingComplete': 'Recording complete',
  'voiceNote.reviewVideoHint': "We recommend downloading the video now — once you continue, it can't be recovered. AI is still organizing the transcript in the background.",
  'voiceNote.downloadVideo': 'Download video',
  'voiceNote.continueGenerating': 'Continue generating note',
  'voiceNote.downloadKind': 'Download {{kind}}',
  'voiceNote.downloadVideoKind': 'video',
  'voiceNote.downloadAudioKind': 'recording',
  'voiceNote.cancel': 'Cancel',
  'voiceNote.generatingLabel': 'AI is organizing your note...',
  'voiceNote.extractingAudio': 'Extracting audio from video...',
  'voiceNote.splittingFile': 'File is large — splitting it automatically...',
  'voiceNote.uploadingAudio': 'Uploading audio...',
  'voiceNote.transcribingSegments': 'Transcribing ({{completed}} / {{total}} segments)...',
  'voiceNote.transcribing': 'AI is recognizing the speech...',
  'voiceNote.rateLimitMultiSegment': "Groq's transcription rate limit was reached — retrying automatically in {{seconds}}s ({{completed}} / {{total}} segments already done, no need to re-upload)...",
  'voiceNote.rateLimitSingle': "Groq's transcription rate limit was reached — retrying automatically in {{seconds}}s...",
  'voiceNote.recordingLengthPrefix': 'Recording length {{duration}}, ',
  'voiceNote.pleaseWait': 'Please wait, this can take a few seconds to around a minute.',
  'voiceNote.minimizeBackground': 'Minimize to background (keeps running)',
  'voiceNote.minimize': 'Minimize to background',
  'voiceNote.canMinimizeHint': 'You can minimize this window and keep browsing other notes',

  // --- voice recordings panel ---
  'voiceRecordings.storageUsed': 'Storage used',
  'voiceRecordings.empty': 'No saved recordings yet. After generating a note with Voice Note, the original recording and transcript will show up here.',
  'voiceRecordings.goToNote': 'Go to this note',
  'voiceRecordings.noteDeleted': '(note deleted)',
  'voiceRecordings.downloadAudio': 'Download audio',
  'voiceRecordings.downloadTranscript': 'Download transcript',
  'voiceRecordings.delete': 'Delete',
  'voiceRecordings.deleteConfirm': "Delete this recording and its transcript? This can't be undone (the generated note itself is unaffected).",
  'voiceRecordings.clearAll': 'Clear all voice recordings',
  'voiceRecordings.clearAllConfirm': "Clear all saved voice recordings and transcripts? This can't be undone (generated notes themselves are unaffected).",

  // --- voice note status pill ---
  'voicePill.processing': 'Processing...',
  'voicePill.recordingVideo': 'Recording video {{duration}}',
  'voicePill.recordingAudio': 'Recording {{duration}}',
  'voicePill.awaitingVideoReview': 'Waiting to confirm video download',
  'voicePill.extractingAudio': 'Extracting audio...',
  'voicePill.splitting': 'Splitting into segments...',
  'voicePill.uploading': 'Uploading audio...',
  'voicePill.transcribingSegments': 'Transcribing {{completed}}/{{total}} segments',
  'voicePill.transcribing': 'Recognizing speech...',
  'voicePill.generating': 'AI organizing note...',
  'voicePill.rateLimited': 'Rate limited, retrying in {{seconds}}s',
  'voicePill.error': 'Voice note ran into an error',
  'voicePill.backToVoiceNote': 'Back to voice note',
  'voicePill.backToVoiceNoteWithLabel': 'Back to voice note: {{label}}',

  // --- editor ---
  'editor.plainMode': 'Plain text mode (raw Markdown)',
  'editor.plainModeLabel': 'Plain text mode',
  'editor.richMode': 'Rich text mode (WYSIWYG)',
  'editor.richModeLabel': 'Rich text mode',
  'editor.copied': 'Copied!',
  'editor.copyContent': 'Copy content',
  'editor.copiedLabel': 'Copied',
  'editor.uploadImage': 'Upload image',
  'editor.dropImageHint': 'Drop image here to upload',
  'editor.placeholder': 'Start writing your note here...',
  'editor.stats': '{{chars}} chars · {{words}} words',
  'editor.statsLabel': 'Character and word count',

  // --- rich text editor toolbar ---
  'richEditor.imageLoading': 'Loading image…',
  'richEditor.placeholder': 'Start writing your note here…',
  'richEditor.heading1': 'Heading 1',
  'richEditor.heading2': 'Heading 2',
  'richEditor.heading3': 'Heading 3',
  'richEditor.bold': 'Bold (⌘B)',
  'richEditor.italic': 'Italic (⌘I)',
  'richEditor.blockquote': 'Quote',
  'richEditor.bulletList': 'Bullet list',
  'richEditor.orderedList': 'Numbered list',
  'richEditor.insertImage': 'Insert image',

  // --- AI chat panel ---
  'aiPanel.title': 'AI Study Partner',
  'aiPanel.newConversation': 'Clear conversation and start over',
  'aiPanel.collapse': 'Collapse sidebar (Esc)',
  'aiPanel.collapseLabel': 'Collapse AI panel',
  'aiPanel.inputPlaceholder': 'Ask a question here... (Enter to send, Shift+Enter for a new line)',
  'aiPanel.inputLabel': 'Ask the AI study partner a question',
  'aiPanel.sendShortcut': 'Send (Enter)',
  'aiPanel.send': 'Send message',
  'aiPanel.stopGenerating': 'Stop generating',
  'aiPanel.greeting': "Hi! I've read through **{{noteName}}**. What can I help you with? Try asking me to:\n\n- Summarize this note\n- Come up with a few practice questions from it\n- Explain the second section more simply",
  'aiPanel.contextErrorReminder': "(Note: there was an error reading this note's content, so my answers below may not be based on it: {{error}})",
  'aiPanel.errorPrefix': 'Sorry, something went wrong: {{error}}',

  // --- mind map ---
  'mindMap.zoomIn': 'Zoom in',
  'mindMap.zoomOut': 'Zoom out',
  'mindMap.resetView': 'Reset view',
  'mindMap.emptyState': 'Add some content in the editor to generate a mind map.',

  // --- search ---
  'search.placeholder': 'Search all notes... (⌘F)',
  'search.mobilePlaceholder': 'Search all notes...',
  'search.ariaLabel': 'Search all notes',
  'search.clear': 'Clear search',
  'search.cancel': 'Cancel',
  'search.noResultsFor': 'No results for "{{query}}"',
  'search.typeToSearch': 'Type a keyword to search all notes',

  // --- error boundary ---
  'errorBoundary.title': 'Something went wrong and the page could not be displayed',
  'errorBoundary.retry': 'Retry',

  // --- toast ---
  'toast.close': 'Dismiss notification',
  'toast.closeLabel': 'Close',

  // --- app-level toasts / confirms / empty states ---
  'app.untitledNote': 'Note',
  'app.selectOrCreateNote': 'Select or create a note to get started',
  'app.exportedBackup': 'Backup file exported.',
  'app.importBackupReadError': 'Could not read the backup file — please check the file format.',
  'app.importBackupInvalid': 'This is not a valid backup file.',
  'app.importBackupConfirm': "Importing a backup will replace all of your current notes and folders. This can't be undone. Continue?",
  'app.importBackupSuccess': 'Backup imported successfully.',
  'app.importBackupReadFileError': 'An error occurred while reading the file.',
  'app.voiceNoteCreated': 'Created a new note from the recording.',
  'app.voiceNoteSaveError': 'The note was created, but an error occurred saving the original recording and transcript (storage may be full).',
  'app.voiceNotePartialTranscript': "Created a new note from the recording, but {{count}} segment(s) couldn't be recognized and were skipped — the content may be incomplete.",
  'app.voiceNoteErrorPrefix': 'Voice note error: {{message}}',
  'app.voiceNoteMissingKeys': 'Please add your Groq and Gemini API keys in Settings to use Voice Note.',
  'app.chatErrorPrefix': 'Sorry, something went wrong: {{error}}',
  'app.chatStopped': '(Stopped generating a reply)',
  'app.deleteRecordingError': 'An error occurred deleting the voice recording.',
  'app.clearRecordingsSuccess': 'All saved voice recordings have been cleared.',
  'app.clearRecordingsError': 'An error occurred clearing voice recordings.',

  // --- welcome/starter note (shown for brand-new users only) ---
  'app.welcomeNote': `# Welcome to Mind Map Note

## Core Idea
- **Write freely, get a mind map for free**: just focus on writing with Markdown syntax (headings like '#' and lists like '-') — the app automatically turns it into a structured mind map.
- **Hierarchical structure**: heading levels and list indentation let you build up complex trains of thought with ease.

## Getting Started
- **Try editing this!**
  - Edit this document directly, and add your own headings or list items.
- **Check the shortcuts**
  - Press \`?\` to open the keyboard shortcuts guide and learn more.

> Now, start your first mind-map note!
`,
  'app.firstNoteName': 'My First Note',
  'app.untitledNoteName': 'Untitled Note',
  'app.newFolderName': 'New Folder',
  'app.storageFullError': 'Storage is full — the latest changes could not be saved. Delete some larger images or notes to free up space.',
  'app.storageSaveError': 'Failed to save the note — changes may be lost after refreshing.',

  // --- voice note pipeline errors ---
  'pipeline.unknownError': 'An unknown error occurred — please try again.',
  'pipeline.noSpeechDetected': 'No speech was detected — please make sure the recording or audio file has clear speech in it.',
  'pipeline.missingGeminiKey': 'No Gemini API key set yet — please add one on the Settings page.',
  'pipeline.recordingUnsupported': 'This browser does not support recording — please use a recent version of Chrome, Edge, or Safari.',
  'pipeline.tabShareUnsupported': 'This browser does not support tab-sharing capture — please use Chrome or Edge, or uncheck this option.',
  'pipeline.micPermissionDenied': 'Microphone access was denied — please allow microphone access in your browser settings and try again.',
  'pipeline.micNotFound': 'No available microphone device was found.',
  'pipeline.recordingStartFailed': 'Could not start recording — please make sure a microphone is connected and access is authorized.',
  'pipeline.unsupportedFileFormat': 'Unsupported file format — please upload a common audio format (mp3, wav, m4a, webm, etc.) or video format (mp4, mov, webm, etc.).',
  'pipeline.fileTooLargeToSplit': 'File exceeds {{maxMb}} MB — the browser cannot process a file this large. Please compress it first, or use the "Record" feature to record in segments instead.',
  'pipeline.cannotParseFile': 'Could not parse this file — please make sure it is not corrupted.',

  // --- audio splitter errors ---
  'audioSplitter.decodeUnsupported': 'This browser does not support audio decoding, so this file cannot be split automatically — please use the "Record" feature, or compress the file manually first.',
  'audioSplitter.cannotParseAudio': 'Could not parse this audio file — please make sure it is not corrupted, or use the "Record" feature to record in segments instead.',

  // --- groq transcription service errors ---
  'groq.missingApiKey': 'No Groq API key set yet.',
  'groq.fileTooLarge': 'File exceeds the {{maxMb}} MB transcription limit — please compress the audio first, or use "Record" to transcribe in segments instead.',
  'groq.noSpeechDetected': 'No speech was detected — please make sure there is clear speech in the recording.',
  'groq.cannotParseResponse': 'Could not parse the transcription response.',
  'groq.transcriptionFailedHttp': 'Transcription failed (HTTP {{status}}).',
  'groq.networkError': 'A network error occurred — transcription failed.',

  // --- gemini chat service ---
  'gemini.missingApiKey': 'No Gemini API key set yet.',
  'gemini.unknownError': 'An unknown error occurred.',
  'gemini.emptyTranscript': 'The transcript is empty — a note cannot be generated.',
  'gemini.noteGenerationFailed': 'AI was unable to generate a note from the transcript — please try again.',
};

export const translations = { zh, en } as const;

const STORAGE_KEY = 'mind-map-language';

// Non-reactive language read for plain (non-component) modules — services
// and utils that need a translated error message can't call the
// useTranslation() hook, so they read localStorage directly instead. It's
// still always current since it's read fresh on each call, just without
// the React re-render subscription useTranslation() provides.
export const getCurrentLanguage = (): 'zh' | 'en' => {
    if (typeof window === 'undefined') return 'zh';
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        return parsed === 'en' ? 'en' : 'zh';
    } catch {
        return 'zh';
    }
};

export const translate = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const language = getCurrentLanguage();
    const template = translations[language][key] ?? translations.zh[key] ?? key;
    if (!params) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    ));
};
