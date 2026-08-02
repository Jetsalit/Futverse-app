import React, { useState } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

export default function PDPAConsentModal() {
  const { currentUser } = useAuth();
  const [isAccepted, setIsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAccepted) {
      setError("กรุณากดยอมรับข้อตกลงเพื่อใช้งานระบบ");
      return;
    }

    if (!currentUser?.id) return;

    setIsSubmitting(true);
    setError("");

    try {
      await updateDoc(doc(db, "users", currentUser.id), {
        pdpaAccepted: true,
        pdpaAcceptedAt: new Date().toISOString(),
      });
      // Force reload to update context and UI
      window.location.reload();
    } catch (err: any) {
      console.error("Error accepting PDPA:", err);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">นโยบายความเป็นส่วนตัวและการให้ความยินยอม (PDPA)</h2>
            <p className="text-sm font-medium text-slate-500">สำหรับข้อมูลเยาวชนและการใช้งานแพลตฟอร์ม FutVerse</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="prose prose-sm text-slate-600">
            <p>
              แพลตฟอร์ม FutVerse ("บริษัท" หรือ "ระบบ") ให้ความสำคัญกับข้อมูลส่วนบุคคลของท่านและนักกีฬาเยาวชนในความดูแลของท่าน เราจึงขอความยินยอมในการเก็บรวบรวม ใช้ และเปิดเผยข้อมูล ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
            </p>

            <h3 className="font-bold text-slate-800 text-base mt-4 mb-2">1. ข้อมูลที่จัดเก็บ</h3>
            <p>ระบบอาจมีการเก็บรวบรวมข้อมูลส่วนบุคคลของนักกีฬาและผู้ใช้งาน ได้แก่:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>ข้อมูลทั่วไป:</strong> ชื่อ-นามสกุล, <u>วันเดือนปีเกิด (Date of Birth)</u>, ข้อมูลการติดต่อ</li>
              <li><strong>ข้อมูลทางกายภาพ:</strong> <u>น้ำหนัก, ส่วนสูง</u>, ความฟิต, และข้อมูลด้านสุขภาพที่เกี่ยวข้องกับการกีฬา</li>
              <li><strong>ข้อมูลผลงาน:</strong> ข้อมูลทางเทคนิค สถิติการเล่นฟุตบอล และผลการประเมิน</li>
              <li><strong>สื่อมัลติมีเดีย:</strong> <u>ภาพถ่าย (Photos)</u> และวิดีโอ ระหว่างการฝึกซ้อมและการแข่งขัน</li>
            </ul>

            <h3 className="font-bold text-slate-800 text-base mt-4 mb-2">2. วัตถุประสงค์การใช้งาน</h3>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>เพื่อใช้ในการวิเคราะห์และประเมินผลการพัฒนาการของนักกีฬา</li>
              <li>เพื่อจัดทำสถิติ รายงาน (Youth Report) และแผนการฝึกซ้อม (Periodization)</li>
              <li>เพื่อใช้ในการจัดทีม (Starting XI) และบริหารจัดการอะคาเดมี่</li>
              <li>การบันทึกภาพถ่าย/วิดีโอเพื่อใช้สำหรับการวิเคราะห์ฟอร์มการเล่น และอาจนำมาใช้ประกอบการประชาสัมพันธ์หรือรายงานผลการฝึกซ้อมในระบบ</li>
            </ul>

            <h3 className="font-bold text-slate-800 text-base mt-4 mb-2">3. การคุ้มครองข้อมูลของเยาวชน (ผู้เยาว์)</h3>
            <p>
              กรณีที่นักกีฬามีอายุต่ำกว่า 20 ปีบริบูรณ์ การให้ความยินยอมนี้ต้องกระทำโดยผู้ใช้อำนาจปกครอง (ผู้ปกครอง) การที่ท่านกดยอมรับ ถือเป็นการยืนยันว่าท่านเป็นผู้ปกครองตามกฎหมาย หรือเป็นโค้ช/ผู้ดูแลที่ได้รับอนุญาต และยินยอมให้ระบบประมวลผลข้อมูลของเยาวชนในความดูแลของท่าน
            </p>

            <h3 className="font-bold text-slate-800 text-base mt-4 mb-2">4. สิทธิของเจ้าของข้อมูล</h3>
            <p>
              ท่านมีสิทธิในการขอเข้าถึง แก้ไข ขอระงับการใช้ หรือขอให้ลบข้อมูลส่วนบุคคลของท่านและเยาวชนในความดูแลได้ตลอดเวลา โดยสามารถติดต่อผู้ดูแลระบบ (Superadmin) ผ่านทางแพลตฟอร์ม
            </p>
          </div>
        </div>

        {/* Footer & Action */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/80">
          <form onSubmit={handleSubmit}>
            <label className="flex items-start gap-3 cursor-pointer group mb-4">
              <div className="relative flex items-start pt-0.5">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isAccepted}
                  onChange={(e) => setIsAccepted(e.target.checked)}
                />
                <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white scale-0 peer-checked:scale-100 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                ข้าพเจ้าได้อ่าน ทำความเข้าใจ และให้ความยินยอมตามเงื่อนไขนโยบายความเป็นส่วนตัวที่ระบุไว้ข้างต้น
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-lg text-sm font-bold mb-4">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isAccepted}
              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isAccepted && !isSubmitting
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                "ยอมรับข้อตกลง (Accept)"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
