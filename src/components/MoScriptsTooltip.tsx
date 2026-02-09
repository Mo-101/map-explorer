import { useState } from "react";

interface MoScriptsTooltipProps {
  children: React.ReactNode;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function MoScriptsTooltip({ 
  children, 
  title, 
  description, 
  position = 'bottom' 
}: MoScriptsTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-800 border-t-2 border-x-8 border-x-transparent',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-800 border-b-2 border-x-8 border-x-transparent',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-800 border-l-2 border-y-8 border-y-transparent',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-r-gray-800 border-r-2 border-y-8 border-y-transparent'
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children}
      </div>
      
      {isVisible && (
        <div 
          className={`absolute z-50 w-80 ${positionClasses[position]}`}
          style={{ minWidth: '320px' }}
        >
          {/* Tooltip Arrow */}
          <div className={`absolute ${arrowClasses[position]}`}></div>
          
          {/* Tooltip Content - matching BackendStatusBadge style */}
          <div className="px-4 py-3 rounded-xl backdrop-blur-md border shadow-lg text-xs font-mono bg-slate-800/90 border-slate-600/30 text-slate-200">
            {/* Title */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="font-semibold text-slate-100">{title}</span>
              <span className="text-slate-400 text-[10px]">MoScripts Info</span>
            </div>
            
            {/* Description */}
            <div className="opacity-90 leading-relaxed text-slate-300">
              {description}
            </div>
            
            {/* Additional Info */}
            <div className="mt-2 pt-2 border-t border-slate-600/30">
              <div className="text-[10px] opacity-70 text-slate-400">
                🔥 MoScripts Intelligence System
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
