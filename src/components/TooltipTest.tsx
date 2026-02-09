/**
 * Simple Tooltip Test Component
 * ==============================
 * Add this to your page to immediately see if tooltips work
 * 
 * Usage:
 * import { TooltipTest } from './TooltipTest';
 * <TooltipTest />
 */

import React, { useState } from 'react';

export const TooltipTest: React.FC = () => {
  const [tooltip1, setTooltip1] = useState(false);
  const [tooltip2, setTooltip2] = useState(false);
  const [tooltip3, setTooltip3] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      padding: '20px',
      zIndex: 9999,
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      minWidth: '300px'
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold' }}>
        🔥 Tooltip Test Panel
      </h3>

      {/* Test 1: Inline style tooltip */}
      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <button
          onMouseEnter={() => setTooltip1(true)}
          onMouseLeave={() => setTooltip1(false)}
          style={{
            padding: '8px 12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Test 1: Hover Me (Inline)
        </button>
        
        {tooltip1 && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 99999,
            pointerEvents: 'none'
          }}>
            ✅ Inline style tooltip works!
          </div>
        )}
      </div>

      {/* Test 2: Portal tooltip (appends to body) */}
      <div style={{ marginBottom: '10px' }}>
        <button
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const tooltip = document.createElement('div');
            tooltip.id = 'test-tooltip-2';
            tooltip.style.cssText = `
              position: fixed;
              top: ${rect.top - 40}px;
              left: ${rect.left}px;
              background: rgba(0,0,0,0.9);
              color: white;
              padding: 8px 12px;
              border-radius: 4px;
              font-size: 12px;
              z-index: 999999;
              pointer-events: none;
            `;
            tooltip.textContent = '✅ Portal tooltip works!';
            document.body.appendChild(tooltip);
          }}
          onMouseLeave={() => {
            document.getElementById('test-tooltip-2')?.remove();
          }}
          style={{
            padding: '8px 12px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Test 2: Hover Me (Portal)
        </button>
      </div>

      {/* Test 3: Tailwind classes tooltip */}
      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <button
          onMouseEnter={() => setTooltip3(true)}
          onMouseLeave={() => setTooltip3(false)}
          className="px-3 py-2 bg-purple-500 text-white rounded cursor-pointer text-xs"
        >
          Test 3: Tailwind Tooltip
        </button>
        
        {tooltip3 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/90 text-white px-3 py-2 rounded text-xs whitespace-nowrap z-[99999] pointer-events-none">
            ✅ Tailwind tooltip works!
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        marginTop: '15px',
        paddingTop: '15px',
        borderTop: '1px solid #e5e7eb',
        fontSize: '11px',
        color: '#6b7280'
      }}>
        <p style={{ margin: 0 }}>
          <strong>🔍 TOOLTIP DEBUGGING:</strong>
        </p>
        <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
          <li>If any tooltip shows above → Your tooltip system WORKS</li>
          <li>If NO tooltips show → There's a z-index or event issue</li>
          <li>Test 1 (Inline) = Most reliable method</li>
          <li>Test 2 (Portal) = Bypasses React container issues</li>
          <li>Test 3 (Tailwind) = Tests if Tailwind is working</li>
        </ul>
        <p style={{ margin: '10px 0 0', fontSize: '10px', color: '#059669' }}>
          <strong>Next:</strong> Whichever works, use that method for your main tooltips!
        </p>
      </div>
    </div>
  );
};
