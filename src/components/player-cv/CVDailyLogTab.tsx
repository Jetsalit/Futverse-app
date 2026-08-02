import React, { ReactNode } from "react";

interface CVDailyLogTabProps {
  isSelfView: boolean;
  children?: ReactNode;
}

function CVDailyLogTab({ isSelfView, children }: CVDailyLogTabProps) {
  if (!isSelfView) return null;
  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      {children || (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-6">Daily Wellness & Nutrition</h2>
          <p className="text-slate-500 mb-8">
            คุณสามารถเพิ่มบันทึกโภชนาการและสภาพร่างกายได้ที่นี่
          </p>
        </div>
      )}
    </div>
  );
}

export default React.memo(CVDailyLogTab);
