import React from "react";

export interface Column<T> {
  header: React.ReactNode;
  key: string;
  render?: (row: T, index: number) => React.ReactNode;
  sticky?: boolean;
  width?: string;
  className?: string;
  headerClassName?: string;
}

interface ResponsiveDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  className?: string;
  emptyMessage?: string;
  renderExpandedRow?: (row: T) => React.ReactNode;
  isExpanded?: (row: T) => boolean;
}

export function ResponsiveDataTable<T>({ 
  columns, 
  data, 
  keyExtractor, 
  className = "",
  emptyMessage = "ไม่มีข้อมูล",
  renderExpandedRow,
  isExpanded
}: ResponsiveDataTableProps<T>) {
  return (
    <div className={`overflow-x-auto border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-sm bg-white dark:bg-slate-800/40 backdrop-blur-sm relative ${className}`}>
      <table className="w-full text-left border-collapse min-w-max">
        <thead className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs border-b border-slate-200 dark:border-slate-700/50">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={col.key} 
                className={`p-4 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-md sticky top-0 z-20 ${col.sticky ? 'left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} ${col.headerClassName || col.className || ''}`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {data.length > 0 ? data.map((row, rIdx) => (
            <React.Fragment key={keyExtractor(row)}>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/60 transition-colors group">
                {columns.map((col) => (
                  <td 
                    key={col.key} 
                    className={`p-4 align-middle bg-white dark:bg-slate-800/40 group-hover:bg-slate-50/50 dark:group-hover:bg-slate-800/60 transition-colors ${col.sticky ? 'sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''} ${col.className || ''}`}
                  >
                    {col.render ? col.render(row, rIdx) : (row as any)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
              {isExpanded && isExpanded(row) && renderExpandedRow && (
                <tr className="bg-indigo-50/30 dark:bg-indigo-900/10">
                  <td colSpan={columns.length} className="px-4 py-3 border-t border-indigo-100 dark:border-indigo-500/20">
                    {renderExpandedRow(row)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          )) : (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-slate-500 dark:text-slate-400 font-medium">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
