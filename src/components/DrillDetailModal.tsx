import React, { useState } from "react";
import {
  X,
  Clock,
  User,
  Tag,
  Edit2,
  Trash2,
  CalendarCheck,
  LayoutGrid,
  Users,
  FileText,
} from "lucide-react";
import { Drill } from "../hooks/useDrillDatabase";

interface DrillDetailModalProps {
  drill: Drill;
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  onEdit: (drill: Drill) => void;
  onDelete: (id: string) => void;
}

export default function DrillDetailModal({
  drill,
  isOpen,
  onClose,
  currentUser,
  onEdit,
  onDelete,
}: DrillDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-full animate-in zoom-in-95 duration-200">
        {/* Actions Bar & Close Button */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10 bg-white/80 backdrop-blur-sm px-2 py-1.5 rounded-full border border-slate-100 shadow-sm">
          {currentUser === drill.created_by && (
            <>
              <button
                onClick={() => {
                  onClose();
                  onEdit(drill);
                }}
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-full transition-colors flex items-center gap-1.5 text-xs font-bold"
              >
                <Edit2 size={14} /> แก้ไข
              </button>
              <div className="w-px h-4 bg-slate-200"></div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white rounded-full transition-colors flex items-center gap-1.5 text-xs font-bold"
              >
                <Trash2 size={14} /> ลบ
              </button>
              <div className="w-px h-4 bg-slate-200"></div>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content - Logbook Style */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10">
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                TRAINING LOGBOOK
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-3">
                {drill.title}
              </h1>
              <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold font-mono border border-blue-100">
                {drill.category}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-500">
                วันที่ฝึกซ้อม
              </div>
              <div className="text-lg font-bold text-slate-800">
                {drill.date || "ไม่ได้ระบุ"}
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-slate-100 mb-6"></div>

          {/* Quick Info Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={16} />
                <span className="text-xs font-bold">เวลา / ระยะเวลา</span>
              </div>
              <div className="font-medium text-slate-800 text-sm">
                {drill.duration || "-"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Users size={16} />
                <span className="text-xs font-bold">กลุ่มผู้เล่น</span>
              </div>
              <div className="font-medium text-slate-800 text-sm">
                {drill.ageGroup || "-"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <FileText size={16} />
                <span className="text-xs font-bold">โค้ชผู้ฝึกสอน</span>
              </div>
              <div className="font-medium text-slate-800 text-sm">
                {drill.created_by}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <span className="text-xs font-bold">Phase</span>
              </div>
              <div className="font-medium text-slate-800 text-sm">
                {drill.phase || "-"}
              </div>
            </div>
          </div>

          {/* Training Method */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-4">
            <h3 className="font-bold text-slate-800 mb-2">
              วิธีการฝึก (Training Method)
            </h3>
            <p className="text-slate-600 text-sm whitespace-pre-wrap">
              {drill.trainingMethod || (
                <span className="text-slate-400 italic">ไม่มีข้อมูล</span>
              )}
            </p>
          </div>

          {/* Coaching Points */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-8">
            <h3 className="font-bold text-slate-800 mb-2">
              จุดโค้ชชิ่ง (Coaching Points)
            </h3>
            <p className="text-slate-600 text-sm whitespace-pre-wrap">
              {drill.coachingPoints || (
                <span className="text-slate-400 italic">ไม่มีข้อมูล</span>
              )}
            </p>
          </div>

          {/* Tactic Board Preview */}
          <div>
            <h3 className="font-bold text-slate-800 mb-4 text-lg">
              แผนการฝึกซ้อม (Tactic Board)
            </h3>
            <div className="w-full aspect-[4/3] sm:aspect-video bg-white rounded-xl relative flex items-center justify-center overflow-hidden shadow-sm border border-slate-200">
              {/* Subtle Grid Pattern */}
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNykiLz48L3N2Zz4=')] z-0 pointer-events-none opacity-50"></div>

              <div className="absolute inset-4 lg:inset-8 ring-[1.5px] ring-slate-800 pointer-events-none z-0">
                {drill.canvas_data?.fieldType === "full" ? (
                  <>
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1.5px] bg-slate-800 -translate-x-1/2"></div>
                    <div className="absolute top-1/2 left-1/2 w-[22%] max-w-[200px] aspect-square border-[1.5px] border-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                    <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>

                    <div className="absolute top-1/2 left-0 w-[16%] h-[55%] border-[1.5px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                    <div className="absolute top-1/2 left-0 w-[5%] h-[24%] border-[1.5px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                    <div className="absolute top-1/2 left-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                    <div className="absolute top-1/2 left-[16%] w-[8%] max-w-[80px] h-[20%] border-[1.5px] border-slate-800 border-l-0 rounded-r-full -translate-y-1/2"></div>
                    <div className="absolute top-1/2 left-0 w-[2.5%] h-[12%] border-[1.5px] border-slate-800 -translate-y-1/2 -translate-x-full border-r-0"></div>

                    <div className="absolute top-1/2 right-0 w-[16%] h-[55%] border-[1.5px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                    <div className="absolute top-1/2 right-0 w-[5%] h-[24%] border-[1.5px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                    <div className="absolute top-1/2 right-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                    <div className="absolute top-1/2 right-[16%] w-[8%] max-w-[80px] h-[20%] border-[1.5px] border-slate-800 border-r-0 rounded-l-full -translate-y-1/2"></div>
                    <div className="absolute top-1/2 right-0 w-[2.5%] h-[12%] border-[1.5px] border-slate-800 -translate-y-1/2 translate-x-full border-l-0"></div>

                    <div className="absolute top-0 left-0 w-4 h-4 border-b-[1.5px] border-r-[1.5px] border-slate-800 rounded-br-full"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-t-[1.5px] border-r-[1.5px] border-slate-800 rounded-tr-full"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-b-[1.5px] border-l-[1.5px] border-slate-800 rounded-bl-full"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-t-[1.5px] border-l-[1.5px] border-slate-800 rounded-tl-full"></div>
                  </>
                ) : (
                  <>
                    <div className="absolute top-0 left-1/2 w-[55%] h-[35%] border-[1.5px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                    <div className="absolute top-0 left-1/2 w-[24%] h-[12%] border-[1.5px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                    <div className="absolute top-[24%] left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2"></div>
                    <div className="absolute top-[35%] left-1/2 w-[20%] max-w-[200px] h-[15%] border-[1.5px] border-slate-800 border-t-0 rounded-b-full -translate-x-1/2"></div>

                    <div className="absolute top-0 left-1/2 w-[12%] h-[5%] border-[1.5px] border-slate-800 border-b-0 -translate-y-full -translate-x-1/2"></div>

                    <div className="absolute top-0 left-0 w-6 h-6 border-b-[1.5px] border-r-[1.5px] border-slate-800 rounded-br-full"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-b-[1.5px] border-l-[1.5px] border-slate-800 rounded-bl-full"></div>

                    <div className="absolute bottom-0 left-1/2 w-[35%] max-w-[300px] aspect-square border-[1.5px] border-slate-800 border-b-0 rounded-t-full -translate-x-1/2 translate-y-[50%]"></div>
                    <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 translate-y-1/2"></div>
                  </>
                )}
              </div>
              {drill.previewImage ? (
                <img
                  src={drill.previewImage}
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 scale-[0.8]"
                />
              ) : (
                <LayoutGrid className="text-slate-200 w-16 h-16 relative z-0" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-5">
              <Trash2 size={28} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              ยืนยันการลบแบบฝึก
            </h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              คุณต้องการลบ <b>"{drill.title}"</b> ใช่หรือไม่?
              ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  onDelete(drill.id);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
