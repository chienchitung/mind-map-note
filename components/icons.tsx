import React from 'react';

interface IconProps {
    className?: string;
}

export const LogoIcon: React.FC<IconProps> = ({ className }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 512 512" 
        className={className} 
        fill="currentColor"
    >
        <path d="M486.489,25.506c-34.007-34.007-89.046-34.01-123.055,0C355.961,32.98,38.747,350.194,36.475,352.465    c-0.006,0.006-0.011,0.012-0.017,0.018c-2.017,2.02-3.557,4.605-4.333,7.555c-3.353,12.74-27.56,104.719-31.257,118.767    c-2.386,9.065,0.25,18.816,6.88,25.445c6.994,6.993,16.767,9.162,25.443,6.878c13.866-3.649,106.391-28,118.766-31.257    c2.849-0.75,5.447-2.235,7.556-4.333c0.006-0.006,0.012-0.011,0.018-0.017c1.875-1.875,319.131-319.131,326.959-326.959    C520.496,114.556,520.498,59.517,486.489,25.506z M69.706,466.91l-24.619-24.619l11.99-45.559l58.187,58.189L69.706,466.91z     M147.697,440.022l-75.724-75.724L339.468,96.803l75.724,75.724L147.697,440.022z M462.824,124.896l-23.966,23.965l-75.724-75.724    l23.966-23.966c20.925-20.926,54.796-20.929,75.724,0C483.751,70.098,483.752,103.968,462.824,124.896z"/>
    </svg>
);

export const EditorIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

export const MindMapIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <circle cx="12" cy="18" r="2" />
        <circle cx="7" cy="6" r="2" />
        <circle cx="17" cy="6" r="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v4" />
    </svg>
);

export const PreviewIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const ExportIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
);

export const MinusIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
    </svg>
);

export const ResetZoomIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

export const UndoIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
);

export const RedoIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
);

export const ChevronUpIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

export const XIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const HelpIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
);

export const LogicDiagramIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <rect x="2" y="10" width="4" height="4" rx="1" />
        <rect x="10" y="4" width="4" height="4" rx="1" />
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <rect x="10" y="16" width="4" height="4" rx="1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h4m0 0a2 2 0 002-2V6m-2 2a2 2 0 012 2v0m-2-2a2 2 0 012 2v2" />
    </svg>
);

export const OrganizationalChartIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <rect x="10" y="3" width="4" height="4" rx="1" />
        <rect x="3" y="17" width="4" height="4" rx="1" />
        <rect x="10" y="17" width="4" height="4" rx="1" />
        <rect x="17" y="17" width="4" height="4" rx="1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v6m0 0a2 2 0 00-2 2v2m2-4a2 2 0 012 2v2M5 17v-2a2 2 0 012-2h10a2 2 0 012 2v2" />
    </svg>
);

export const MindMapLayoutIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <rect x="18" y="4" width="4" height="4" rx="1" />
        <rect x="18" y="16" width="4" height="4" rx="1" />
        <rect x="2" y="4" width="4" height="4" rx="1" />
        <rect x="2" y="16" width="4" height="4" rx="1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 12h2q2 0 2-6 M14 12h2q2 0 2 6 M10 12h-2q-2 0-2-6 M10 12h-2q-2 0-2 6" />
    </svg>
);

export const FolderIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
);

export const FileIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);

export const PencilIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

export const FolderPlusIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
);

export const ImageIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
);

export const SunIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
);

export const MoonIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.92-.99 6.752-2.648z" />
    </svg>
);

export const ChevronDoubleLeftIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
    </svg>
);

export const ChevronDoubleRightIcon: React.FC<IconProps> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5" />
    </svg>
);

export const ChatbotIcon: React.FC<IconProps> = ({ className }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 122.88 93.04" 
        className={className} 
        fill="currentColor"
    >
        <g>
            <path d="M7.09,43.87h7.11v-1.65c0-2.2,0.44-4.3,1.24-6.22c0.83-1.99,2.04-3.79,3.55-5.29c1.5-1.5,3.3-2.72,5.29-3.55 c1.92-0.8,4.02-1.24,6.22-1.24h28.29l0-0.14V15.65c-0.46-0.17-0.9-0.38-1.32-0.62c-0.59-0.35-1.13-0.77-1.61-1.25 c-0.74-0.74-1.34-1.63-1.75-2.62c-0.39-0.95-0.61-2-0.61-3.08c0-1.09,0.22-2.13,0.61-3.08c0.41-0.99,1.01-1.88,1.75-2.62 c0.74-0.74,1.63-1.34,2.62-1.75c0.95-0.4,2-0.61,3.08-0.61s2.13,0.22,3.08,0.61c0.99,0.41,1.88,1.01,2.62,1.75 c0.74,0.74,1.34,1.63,1.75,2.62c0.39,0.95,0.61,2,0.61,3.08c0,1.09-0.22,2.13-0.61,3.08c-0.41,0.99-1.01,1.88-1.75,2.62l-0.04,0.04 c-0.47,0.46-1,0.87-1.57,1.21c-0.42,0.25-0.86,0.46-1.32,0.62v10.13l0,0.14h28.29c2.2,0,4.3,0.44,6.22,1.24 c2,0.83,3.79,2.04,5.29,3.55c1.5,1.5,2.72,3.3,3.55,5.29c0.8,1.92,1.24,4.02,1.24,6.22v1.65h6.86c0.95,0,1.87,0.19,2.71,0.54 c0.87,0.36,1.65,0.89,2.3,1.54l0.04,0.04c0.64,0.65,1.15,1.41,1.5,2.26c0.35,0.84,0.54,1.75,0.54,2.71v18.92 c0,0.95-0.19,1.87-0.54,2.71c-0.36,0.86-0.89,1.65-1.54,2.3l0,0c-1.28,1.28-3.06,2.08-5.01,2.08h-6.87 c-0.03,2.11-0.47,4.14-1.24,5.99c-0.83,2-2.04,3.79-3.55,5.29c-1.5,1.5-3.3,2.72-5.29,3.55c-1.92,0.8-4.02,1.24-6.22,1.24H30.5 c-2.2,0-4.3-0.44-6.22-1.24c-2-0.83-3.79-2.04-5.29-3.55c-1.5-1.5-2.72-3.3-3.55-5.29c-0.77-1.85-1.21-3.88-1.24-5.99H7.09 c-0.95,0-1.87-0.19-2.71-0.54c-0.87-0.36-1.65-0.89-2.3-1.54l-0.04-0.04c-0.64-0.65-1.15-1.41-1.5-2.26C0.19,71.75,0,70.83,0,69.88 V50.96c0-0.95,0.19-1.87,0.54-2.71c0.36-0.87,0.89-1.65,1.54-2.3l0,0c0.65-0.65,1.43-1.18,2.3-1.54 C5.22,44.06,6.13,43.87,7.09,43.87L7.09,43.87z M47,74.3c-0.14-0.11-0.26-0.23-0.37-0.37c-0.33-0.4-0.5-0.86-0.51-1.33 c-0.01-0.47,0.14-0.94,0.45-1.35c0.11-0.14,0.23-0.27,0.38-0.39c0.52-0.43,1.21-0.66,1.89-0.67c0.68-0.01,1.36,0.19,1.9,0.6 c1.86,1.43,3.7,2.47,5.52,3.16c1.8,0.68,3.58,1,5.34,0.98c1.77-0.02,3.56-0.39,5.39-1.08c1.85-0.7,3.71-1.75,5.6-3.1 c0.56-0.4,1.25-0.58,1.93-0.55c0.68,0.03,1.36,0.27,1.87,0.72c0.13,0.12,0.25,0.25,0.36,0.4c0.3,0.42,0.44,0.9,0.41,1.37 c-0.03,0.47-0.22,0.93-0.56,1.32c-0.12,0.13-0.26,0.26-0.42,0.37c-2.37,1.71-4.75,3.01-7.16,3.9c-2.42,0.89-4.87,1.36-7.35,1.39 c-2.49,0.03-4.95-0.39-7.4-1.28c-2.43-0.88-4.85-2.23-7.23-4.06L47,74.3L47,74.3z M40.77,43.72c0.6,0,1.2,0.06,1.77,0.18 c0.58,0.12,1.15,0.29,1.7,0.52c0.56,0.23,1.09,0.51,1.58,0.84c0.48,0.32,0.93,0.68,1.33,1.08l0.06,0.05 c0.42,0.42,0.8,0.88,1.13,1.38l0.02,0.03c0.32,0.48,0.6,1,0.82,1.55c0.23,0.55,0.4,1.12,0.52,1.7c0.11,0.58,0.18,1.17,0.18,1.77 c0,0.6-0.06,1.2-0.18,1.77c-0.12,0.58-0.29,1.15-0.52,1.71c-0.23,0.56-0.51,1.09-0.84,1.58c-0.34,0.51-0.72,0.97-1.13,1.38 c-0.83,0.83-1.84,1.51-2.97,1.97c-0.55,0.23-1.12,0.4-1.71,0.52c-0.58,0.11-1.17,0.17-1.77,0.17s-1.2-0.06-1.77-0.17 c-0.58-0.12-1.15-0.29-1.71-0.52c-0.56-0.23-1.09-0.51-1.58-0.84c-0.51-0.34-0.97-0.72-1.38-1.13c-0.42-0.42-0.8-0.88-1.13-1.38 l-0.02-0.03c-0.32-0.48-0.6-1-0.82-1.55c-0.23-0.55-0.4-1.12-0.52-1.7c-0.11-0.58-0.17-1.17-0.17-1.77c0-0.6,0.06-1.2,0.17-1.77 c0.12-0.58,0.29-1.15,0.52-1.7c0.23-0.56,0.51-1.09,0.84-1.58c0.34-0.51,0.72-0.97,1.13-1.38c0.42-0.42,0.88-0.8,1.38-1.13 l0.03-0.02c0.48-0.32,1-0.6,1.55-0.82c0.55-0.23,1.12-0.4,1.7-0.52C39.57,43.78,40.17,43.72,40.77,43.72L40.77,43.72z M42.73,48.1 c-0.3-0.12-0.62-0.22-0.95-0.29c-0.32-0.06-0.66-0.1-1.01-0.1c-0.35,0-0.69,0.03-1.01,0.1c-0.34,0.07-0.66,0.16-0.95,0.29 c-0.31,0.13-0.6,0.28-0.88,0.47c-0.27,0.18-0.53,0.4-0.78,0.65c-0.25,0.25-0.46,0.51-0.65,0.78c-0.19,0.28-0.34,0.57-0.47,0.87 c-0.12,0.3-0.22,0.62-0.29,0.95c-0.06,0.32-0.1,0.66-0.1,1.01s0.03,0.69,0.1,1.01c0.07,0.34,0.16,0.66,0.29,0.95 c0.13,0.31,0.28,0.6,0.47,0.87c0.18,0.27,0.4,0.53,0.65,0.78c0.25,0.25,0.51,0.46,0.78,0.65c0.27,0.18,0.57,0.34,0.88,0.47 l0.03,0.02c0.29,0.12,0.59,0.21,0.92,0.27c0.32,0.06,0.66,0.1,1.01,0.1c0.35,0,0.69-0.03,1.01-0.1c0.34-0.07,0.65-0.16,0.95-0.28 c0.31-0.13,0.6-0.29,0.88-0.47c0.28-0.19,0.54-0.4,0.78-0.64v0c0.25-0.25,0.46-0.51,0.65-0.78c0.19-0.28,0.34-0.57,0.47-0.87 c0.12-0.3,0.22-0.62,0.29-0.95c0.06-0.32,0.1-0.66,0.1-1.01c0-0.35-0.03-0.69-0.1-1.01c-0.07-0.34-0.16-0.66-0.29-0.95 c-0.13-0.31-0.28-0.6-0.47-0.88c-0.19-0.28-0.4-0.54-0.64-0.78l-0.05-0.05c-0.23-0.22-0.47-0.42-0.73-0.59 C43.34,48.38,43.04,48.22,42.73,48.1L42.73,48.1z M82.35,43.72c0.6,0,1.2,0.06,1.77,0.18c0.58,0.12,1.15,0.29,1.7,0.52 c0.56,0.23,1.09,0.51,1.58,0.84c0.47,0.32,0.91,0.67,1.31,1.07c0.02,0.02,0.05,0.04,0.07,0.06c0.42,0.42,0.8,0.88,1.13,1.38 l0.02,0.03c0.32,0.48,0.6,1,0.82,1.55c0.23,0.55,0.4,1.12,0.52,1.7c0.11,0.58,0.17,1.17,0.17,1.77c0,0.6-0.06,1.2-0.17,1.77 c-0.12,0.58-0.29,1.15-0.52,1.71c-0.23,0.56-0.51,1.09-0.84,1.58c-0.34,0.51-0.72,0.97-1.13,1.38c-0.42,0.42-0.88,0.8-1.38,1.13 l-0.03,0.02c-0.49,0.32-1,0.6-1.55,0.82c-0.55,0.23-1.12,0.4-1.71,0.52c-0.58,0.11-1.17,0.17-1.77,0.17c-0.6,0-1.2-0.06-1.77-0.17 c-0.58-0.12-1.15-0.29-1.71-0.52c-0.57-0.24-1.1-0.52-1.58-0.84l-0.05-0.04c-0.48-0.33-0.93-0.69-1.33-1.09 c-0.42-0.42-0.8-0.88-1.13-1.38l-0.02-0.03c-0.32-0.48-0.6-1-0.82-1.55c-0.23-0.55-0.4-1.12-0.52-1.7 c-0.11-0.58-0.18-1.17-0.18-1.77c0-0.6,0.06-1.2,0.18-1.77c0.12-0.58,0.29-1.15,0.52-1.7c0.23-0.56,0.51-1.09,0.84-1.58 c0.34-0.51,0.72-0.97,1.13-1.38c0.41-0.41,0.88-0.79,1.38-1.13c0.49-0.33,1.02-0.61,1.58-0.85c0.55-0.23,1.12-0.4,1.7-0.52 C81.16,43.78,81.75,43.72,82.35,43.72L82.35,43.72z M84.32,48.1c-0.3-0.12-0.62-0.22-0.95-0.29c-0.32-0.06-0.66-0.1-1.01-0.1 c-0.35,0-0.69,0.03-1.01,0.1c-0.34,0.07-0.66,0.16-0.95,0.29c-0.31,0.13-0.6,0.28-0.88,0.47c-0.27,0.18-0.53,0.4-0.78,0.65 c-0.25,0.25-0.46,0.51-0.65,0.78c-0.19,0.28-0.34,0.57-0.47,0.87c-0.12,0.3-0.22,0.62-0.29,0.95c-0.06,0.32-0.1,0.66-0.1,1.01 c0,0.35,0.03,0.69,0.1,1.01c0.07,0.34,0.16,0.66,0.29,0.95c0.13,0.31,0.28,0.6,0.47,0.87c0.18,0.27,0.4,0.53,0.65,0.78 c0.25,0.25,0.51,0.46,0.78,0.65c0.27,0.18,0.57,0.34,0.88,0.47l0.03,0.02c0.29,0.12,0.59,0.21,0.92,0.27 c0.32,0.06,0.66,0.1,1.01,0.1c0.35,0,0.69-0.03,1.01-0.1c0.34-0.07,0.65-0.16,0.95-0.28c0.31-0.13,0.6-0.29,0.88-0.47 c0.28-0.19,0.54-0.4,0.78-0.64v0c0.25-0.25,0.46-0.51,0.65-0.78c0.19-0.28,0.34-0.57,0.47-0.87c0.12-0.3,0.22-0.62,0.29-0.95 c0.06-0.32,0.1-0.66,0.1-1.01c0-0.35-0.03-0.69-0.1-1.01c-0.07-0.34-0.16-0.66-0.29-0.95c-0.13-0.31-0.28-0.6-0.47-0.88 c-0.19-0.28-0.4-0.54-0.64-0.78l-0.05-0.05c-0.23-0.22-0.47-0.42-0.73-0.59C84.92,48.38,84.63,48.22,84.32,48.1L84.32,48.1z M18.19,45.87v30.87c0,1.66,0.33,3.24,0.93,4.69c0.63,1.5,1.54,2.86,2.68,4c1.14,1.14,2.5,2.06,4,2.68 c1.44,0.6,3.03,0.93,4.69,0.93h62.13c1.66,0,3.24-0.33,4.69-0.93c1.5-0.63,2.86-1.54,4-2.68s2.06-2.5,2.68-4 c0.6-1.44,0.93-3.03,0.93-4.69V42.22c0-1.66-0.33-3.25-0.93-4.69c-0.63-1.5-1.54-2.86-2.68-4c-1.14-1.14-2.5-2.06-4-2.68 c-1.44-0.6-3.03-0.93-4.69-0.93H30.5c-1.66,0-3.24,0.33-4.69,0.93c-1.5,0.63-2.86,1.54-4,2.68c-1.14,1.14-2.06,2.5-2.68,4 c-0.6,1.44-0.93,3.03-0.93,4.69V45.87L18.19,45.87z M14.2,47.86H7.09c-0.42,0-0.82,0.08-1.18,0.23c-0.38,0.16-0.72,0.39-1.01,0.68 l-0.04,0.03c-0.27,0.28-0.49,0.61-0.64,0.97c-0.15,0.36-0.23,0.76-0.23,1.18v18.92c0,0.42,0.08,0.82,0.23,1.18 c0.16,0.38,0.39,0.72,0.68,1.01c0.56,0.56,1.33,0.91,2.18,0.91h7.11V47.86L14.2,47.86z M115.79,47.86h-6.86v25.11h6.86 c0.42,0,0.82-0.08,1.18-0.23c0.38-0.16,0.72-0.39,1.01-0.68c0.29-0.29,0.52-0.63,0.68-1.01c0.15-0.36,0.23-0.76,0.23-1.18V50.96 c0-0.42-0.08-0.82-0.23-1.18c-0.16-0.38-0.39-0.72-0.68-1.01l0,0c-0.29-0.29-0.63-0.52-1.01-0.68 C116.61,47.95,116.21,47.86,115.79,47.86L115.79,47.86z"/>
        </g>
    </svg>
);