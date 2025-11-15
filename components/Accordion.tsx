
import React, { useState } from 'react';
import { Icon } from './Icon';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
}

export const Accordion: React.FC<AccordionProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left font-semibold text-gray-800"
      >
        <span>{title}</span>
        <span className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <Icon name="chevronDown" className="w-5 h-5" />
        </span>
      </button>
      {isOpen && (
        <div className="p-4 pt-0 text-gray-600">
          {children}
        </div>
      )}
    </div>
  );
};
