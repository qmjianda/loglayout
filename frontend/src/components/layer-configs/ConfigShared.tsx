
import React from 'react';

export const ConfigLabel: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({ children, extra }) => (
  <div className="flex justify-between items-center mb-1">
    <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">{children}</label>
    {extra && <div className="text-[8px] text-gray-600">{extra}</div>}
  </div>
);

export const ConfigSection: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`space-y-1 ${className}`}>{children}</div>
);

export const ConfigInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input 
    {...props}
    className={`bg-[#1e1e1e] border border-[#444] px-2 py-1.5 text-[10px] rounded text-gray-200 w-full focus:outline-none focus:border-blue-500 transition-colors shadow-inner ${props.className || ''}`}
  />
);
