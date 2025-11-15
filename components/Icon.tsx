import React from 'react';

interface IconProps {
  name: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, className = 'w-6 h-6' }) => {
  // Fix: Replaced JSX.Element with React.ReactElement to resolve namespace error.
  const icons: { [key: string]: React.ReactElement } = {
    play: <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />,
    pause: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />,
    refresh: <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.818 0l3.181-3.183m-4.991-2.69v4.992h-4.992m0 0l-3.182-3.182a8.25 8.25 0 0111.818 0l3.182 3.182" />,
    plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
    minus: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />,
    settings: <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.316c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    history: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    book: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
    chevronDown: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />,
    close: <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />,
    robot: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.03 1.126 0 1.131.094 1.976 1.057 1.976 2.192V7.5M8.25 7.5h7.5M8.25 7.5V9a.75.75 0 01-.75.75h-5.25a.75.75 0 01-.75-.75V7.5m14.25-1.5c-1.373 0-2.5 1.127-2.5 2.5v9.75c0 1.373 1.127 2.5 2.5 2.5s2.5-1.127 2.5-2.5V8.5c0-1.373-1.127-2.5-2.5-2.5zM3.75 16.5c-1.373 0-2.5-1.127-2.5-2.5V8.5c0-1.373 1.127-2.5 2.5-2.5s2.5 1.127 2.5 2.5v5.25c0 1.373-1.127 2.5-2.5 2.5z" />,
    coin: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75c-3.314 0-6 1.007-6 2.25s2.686 2.25 6 2.25 6-1.007 6-2.25S15.314 6.75 12 6.75zM12 11.25c-3.314 0-6 1.007-6 2.25s2.686 2.25 6 2.25 6-1.007 6-2.25S15.314 11.25 12 11.25zM12 15.75c-3.314 0-6 1.007-6 2.25s2.686 2.25 6 2.25 6-1.007 6-2.25S15.314 15.75 12 15.75z" />,
    sparkle: <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L9.5 9.5L2 12L9.5 14.5L12 22L14.5 14.5L22 12L14.5 9.5L12 2Z" />,
  };
  
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      {icons[name] || null}
    </svg>
  );
};