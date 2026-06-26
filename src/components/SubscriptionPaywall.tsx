import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Upload, CheckCircle, Clock, CreditCard, ChevronRight, X, AlertCircle } from 'lucide-react';

export default function SubscriptionPaywall() {
  const { currentUser, submitSubscription, logout } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slipUrl, setSlipUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Mock upload delay
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      setTimeout(() => {
        setSlipUrl('https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?auto=format&fit=crop&q=80&w=300'); // Mock image URL
        setIsUploading(false);
      }, 1500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time || !slipUrl) return;
    submitSubscription(selectedPlan, date, time, slipUrl);
  };

  if (currentUser?.status === 'Pending') {
    return (
      <div className="flex h-screen w-full bg-slate-50 items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
          <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-3">รอการตรวจสอบ (Pending)</h2>
          <p className="text-slate-500 font-medium mb-8 leading-relaxed">
            ระบบได้รับข้อมูลการโอนเงินหน้าแพ็กเกจ <span className="font-bold text-slate-700">{currentUser.subscriptionPlan === 'yearly' ? 'รายปี (Yearly)' : 'รายเดือน (Monthly)'}</span> ของคุณแล้ว<br/>
            แอดมินจะทำการเปิดสิทธิ์ให้ภายใน 24 ชั่วโมง
          </p>
          <button 
            onClick={logout}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield size={32} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 tracking-tight">Upgrade Your Plan</h1>
          <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Choose a subscription plan to continue accessing FUTVERSE Command Center.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Plan Selection */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">Select Package</h2>
            
            <button 
              onClick={() => setSelectedPlan('monthly')}
              className={`w-full p-6 rounded-2xl border-2 text-left transition-all ${
                selectedPlan === 'monthly' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-bold text-slate-800">รายเดือน (Monthly)</span>
                {selectedPlan === 'monthly' && <CheckCircle className="text-indigo-600" size={24} />}
              </div>
              <div className="text-3xl font-black text-indigo-600 mb-2">฿990 <span className="text-sm font-medium text-slate-500">/mo</span></div>
              <p className="text-sm text-slate-500 font-medium">เข้าถึงฟีเจอร์พื้นฐานทั้งหมด ใช้งานได้ 1 เดือน</p>
            </button>

            <button 
              onClick={() => setSelectedPlan('yearly')}
              className={`w-full p-6 rounded-2xl border-2 text-left relative transition-all ${
                selectedPlan === 'yearly' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200'
              }`}
            >
              <div className="absolute -top-3 right-6 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                Best Value / ประหยัดกว่า
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-bold text-slate-800">รายปี (Yearly)</span>
                {selectedPlan === 'yearly' && <CheckCircle className="text-indigo-600" size={24} />}
              </div>
              <div className="text-3xl font-black text-indigo-600 mb-2">฿9,900 <span className="text-sm font-medium text-slate-500">/year</span></div>
              <p className="text-sm text-slate-500 font-medium">เซฟไป 2 เดือน เข้าถึงฟีเจอร์พรีเมียมแบบเต็มประสิทธิภาพ</p>
            </button>
            
            <button 
              onClick={logout}
              className="w-full text-center py-4 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              กลับหน้า Login
            </button>
          </div>

          {/* Payment Info */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1 mb-6 flex items-center gap-2">
              <CreditCard size={18} /> Payment Information
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Fake QR/Bank Info */}
              <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100">
                <div className="w-40 h-40 bg-white border border-slate-200 rounded-xl mx-auto mb-4 flex flex-col items-center justify-center p-2 shadow-sm">
                   {/* QR Code Placeholder */}
                   <div className="w-full h-full border-4 border-slate-800 rounded-lg p-2">
                      <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#1e293b_10px,#1e293b_20px)] opacity-20"></div>
                   </div>
                </div>
                <p className="text-sm font-bold text-slate-800 mb-1">สแกนชำระเงิน (PromptPay)</p>
                <p className="text-xs text-slate-500 font-medium">ชื่อบัญชี: บจก. ฟุตเวิร์ส อคาเดมี</p>
                <div className="mt-4 pt-4 border-t border-slate-200 text-left">
                  <p className="text-xs text-slate-500 font-medium mb-1">หรือโอนผ่านบัญชีธนาคาร</p>
                  <p className="text-sm font-bold text-slate-800">กสิกรไทย 012-3-45678-9</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">แนบสลิปโอนเงิน <span className="text-rose-500">*</span></label>
                  {!slipUrl ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {isUploading ? (
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Upload className="text-slate-400 mb-2" size={24} />
                            <p className="text-sm text-slate-500 font-medium"><span className="font-bold text-indigo-600">คลิกอัปโหลด</span> หรือลากไฟล์มาวาง</p>
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </label>
                  ) : (
                    <div className="relative w-full h-32 rounded-xl overflow-hidden group border border-slate-200">
                      <img src={slipUrl} alt="Slip" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <button type="button" onClick={() => setSlipUrl('')} className="bg-white/20 p-2 rounded-full text-white hover:bg-rose-500 transition-colors">
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">วันที่โอน <span className="text-rose-500">*</span></label>
                    <input 
                      type="date" 
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">เวลาที่โอน <span className="text-rose-500">*</span></label>
                    <input 
                      type="time" 
                      required
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500" 
                    />
                  </div>
                </div>
              </div>

              {currentUser?.rejectionReason && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <div className="text-sm font-bold text-rose-800">Payment Rejected</div>
                    <div className="text-xs text-rose-600 font-medium mt-1">{currentUser.rejectionReason}</div>
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={!slipUrl || !date || !time}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(79,70,229,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ยืนยันการชำระเงิน <ChevronRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
