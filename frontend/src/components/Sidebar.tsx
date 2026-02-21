import React from 'react';

interface SidebarProps {
  activeView: string;
  onSetActiveView: (view: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onSetActiveView }) => {
  const icons = [
    {
      id: 'main',
      icon: (
        <>
          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M13 2v7h7" />
        </>
      ),
      label: '工作区',
      fill: false
    },
    {
      id: 'search',
      icon: <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
      label: '搜索',
      fill: false
    },
    {
      id: 'help',
      icon: <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
      label: '帮助与 API',
      fill: false
    },
  ];

  return (
    <div className="w-12 bg-[#333333] flex flex-col items-center py-2 shrink-0 h-full border-r border-[#111]">
      {icons.map((item) => (
        <button
          key={item.id}
          onClick={() => onSetActiveView(item.id)}
          className={`w-12 h-12 flex items-center justify-center relative group transition-colors ${activeView === item.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          {activeView === item.id && (
            <div className="absolute left-0 w-0.5 h-full bg-white" />
          )}
          <svg
            className="w-6 h-6"
            fill={item.fill ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            {item.icon}
          </svg>
          <span className="absolute left-14 bg-[#252526] text-white text-[10px] px-2 py-1 rounded hidden group-hover:block whitespace-nowrap z-50 shadow-lg">
            {item.label}
          </span>
        </button>
      ))}
      <div className="mt-auto">
        <button className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-gray-300">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
};