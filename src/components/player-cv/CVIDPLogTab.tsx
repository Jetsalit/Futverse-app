import React from "react";
import {
  Target,
  Activity,
  CheckCircle,
  BookOpen,
  Clock,
  Flame,
  Trophy,
  Smile,
  Meh,
  Frown,
  ArrowDown,
  Sparkles,
  ShieldAlert,
  Tag
} from "lucide-react";

interface CVIDPLogTabProps {
  idpsList: any[];
  playerGoals?: any[];
  journals?: any[];
  trainingLogs?: any[];
}

function CVIDPLogTab({ idpsList = [], playerGoals = [], journals = [], trainingLogs = [] }: CVIDPLogTabProps) {
  const getMoodIcon = (mood: string, size = 14) => {
    switch (mood) {
      case "GREAT":
        return <Smile size={size} className="text-emerald-500" />;
      case "GOOD":
        return <Smile size={size} className="text-blue-500" />;
      case "OKAY":
        return <Meh size={size} className="text-amber-500" />;
      case "BAD":
        return <Frown size={size} className="text-rose-500" />;
      default:
        return <Smile size={size} className="text-slate-400" />;
    }
  };

  // Build combined display list of IDPs and standalone Player Goals
  const linkedGoalIds = new Set(
    idpsList.map(idp => idp.sourceGoalId).filter(Boolean)
  );

  const standaloneGoals = playerGoals.filter(
    (g: any) =>
      !g.idpId &&
      !g.convertedToIdp &&
      !linkedGoalIds.has(g.id) &&
      (g.approvalStatus === "APPROVED" || g.status === "ACHIEVED" || g.status === "IN_PROGRESS")
  );

  const standaloneAsItems = standaloneGoals.map((g: any) => ({
    id: `goal_${g.id}`,
    goal: g.title,
    status: g.status === "ACHIEVED" ? "Completed" : "Active",
    startDate: g.createdAt
      ? typeof g.createdAt === "string"
        ? g.createdAt.split("T")[0]
        : new Date((g.createdAt.seconds || 0) * 1000).toISOString().split("T")[0]
      : "N/A",
    endDate: g.dateCompleted
      ? typeof g.dateCompleted === "string"
        ? g.dateCompleted.split("T")[0]
        : new Date((g.dateCompleted.seconds || 0) * 1000).toISOString().split("T")[0]
      : "",
    playerRequest: g.title,
    parentRequest: "-",
    process: `พัฒนาทักษะหมวดหมู่ ${g.category || "ทั่วไป"} (${g.type === "SHORT_TERM" ? "ระยะสั้น" : "ระยะยาว"})`,
    applicationNote: "ฝึกซ้อมและลงบันทึกความรู้สึกใน Daily Reflection",
    evaluation: g.status === "ACHIEVED" ? "ผู้เล่นฝึกซ้อมบรรลุเป้าหมายการพัฒนาตนเองเรียบร้อยแล้ว" : "อยู่ระหว่างการฝึกซ้อมและติดตามผล",
    isStandaloneGoal: true,
    rawGoal: g
  }));

  const displayList = [...idpsList, ...standaloneAsItems];

  // Overall evidence metrics for Parent Report transparency
  let totalEvidencesCount = 0;
  let totalEvidencesMinutes = 0;
  let totalVerifiedCount = 0;

  (trainingLogs || []).forEach((item: any) => {
    const tr = item.idpTraining || item.log?.idpTraining;
    if (tr && tr.activity) {
      totalEvidencesCount += 1;
      totalEvidencesMinutes += Number(tr.minutes || 0);
      if (tr.coachVerified) totalVerifiedCount += 1;
    }
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)] flex items-center gap-2">
              <Target className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" />
              Individual Development Plan (IDP) Log & Player Development Flow
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              เส้นทางการพัฒนาตนเองจริงของนักกีฬา: IDP ➔ Goal ➔ Daily Reflections ➔ Progress ➔ Completion
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* Parent Report Summary Header Banner */}
          <div className="mb-6 p-4.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    สรุปหลักฐานการฝึกซ้อมจริง (Parent Evidence Verification)
                  </h4>
                  <p className="text-xs text-slate-300">
                    รายงานความโปร่งใสสำหรับผู้ปกครอง: จำนวนครั้งฝึกจริง, นาทีที่ซ้อม, การยืนยันจากโค้ช และบันทึกความรู้สึกนักกีฬา
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ✓ โปรไฟล์โปร่งใสสำหรับผู้ปกครอง
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">เป้าหมายทั้งหมด</span>
                <span className="text-lg font-black text-white">{displayList.length} <span className="text-xs font-normal text-slate-400">เป้าหมาย</span></span>
              </div>
              <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-emerald-400 uppercase block">จำนวนครั้งที่ฝึกจริง</span>
                <span className="text-lg font-black text-emerald-300">{totalEvidencesCount} <span className="text-xs font-normal text-slate-400">ครั้ง</span></span>
              </div>
              <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-cyan-400 uppercase block">เวลารวมที่ฝึกซ้อม</span>
                <span className="text-lg font-black text-cyan-300">{totalEvidencesMinutes} <span className="text-xs font-normal text-slate-400">นาที</span></span>
              </div>
              <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-amber-400 uppercase block">บันทึกความรู้สึกนักกีฬา</span>
                <span className="text-lg font-black text-amber-300">{journals.length} <span className="text-xs font-normal text-slate-400">บันทึก</span></span>
              </div>
            </div>
          </div>

          {displayList.length > 0 ? (
            <div className="space-y-8">
              {displayList.map((idp: any, index: number) => {
                // 1. Find Linked Goal
                const linkedGoal = idp.rawGoal || playerGoals.find(
                  (g: any) =>
                    g.idpId === idp.id ||
                    g.sourceIdpId === idp.id ||
                    (idp.sourceGoalId && g.id === idp.sourceGoalId) ||
                    g.title === idp.goal
                );

                // 2. Find Linked Training Evidences (idpTraining)
                const linkedEvidences = (trainingLogs || []).filter((item: any) => {
                  const tr = item.idpTraining || item.log?.idpTraining;
                  if (!tr || !tr.activity) return false;
                  if (tr.idpId && tr.idpId === idp.id) return true;
                  if (tr.goalId && linkedGoal && tr.goalId === linkedGoal.id) return true;
                  if (idp.sourceGoalId && tr.goalId === idp.sourceGoalId) return true;
                  return false;
                });

                const cardMinutesTotal = linkedEvidences.reduce((sum, item) => {
                  const tr = item.idpTraining || item.log?.idpTraining;
                  return sum + Number(tr?.minutes || 0);
                }, 0);

                const cardVerifiedCount = linkedEvidences.filter((item) => {
                  const tr = item.idpTraining || item.log?.idpTraining;
                  return tr?.coachVerified;
                }).length;

                // 3. Find Linked Daily Reflections
                const linkedJournals = journals.filter(
                  (j: any) =>
                    j.idpId === idp.id ||
                    (linkedGoal && j.goalId === linkedGoal.id)
                );

                // 4. Compute Progress Metrics
                const reflectionCount = linkedJournals.length;
                const isCompleted = idp.status === "Completed" || linkedGoal?.status === "ACHIEVED";
                const isActive = idp.status === "Active" || linkedGoal?.status === "IN_PROGRESS";
                
                let progressPercent = 0;
                if (isCompleted) {
                  progressPercent = 100;
                } else if (isActive) {
                  progressPercent = Math.min(95, Math.max(30, reflectionCount * 15));
                } else {
                  progressPercent = 15;
                }

                return (
                  <div
                    key={idp.id || index}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/40 p-5 space-y-6 shadow-sm"
                  >
                    {/* IDP Log Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                          IDP #{idpsList.length - index}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                isCompleted
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                  : isActive
                                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                  : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {idp.status || "Draft"}
                            </span>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                              <Clock size={12} /> {idp.startDate || "N/A"} - {idp.endDate || "ปัจจุบัน"}
                            </span>
                          </div>
                          <h4 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                            {idp.goal}
                          </h4>
                        </div>
                      </div>
                    </div>

                    {/* Step-by-Step Flow Nodes */}
                    <div className="space-y-4">
                      {/* Step 1: IDP Details */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
                          <Target size={14} />
                          Step 1: IDP (แผนพัฒนาส่วนบุคคลของโค้ช)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Player's Request:</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{idp.playerRequest || "-"}</p>
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Parent's Request:</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{idp.parentRequest || "-"}</p>
                          </div>
                          <div className="md:col-span-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1 mb-1">
                              <Activity size={12} /> Training Process:
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{idp.process || "-"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Arrow Connector */}
                      <div className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={12} className="text-indigo-500 animate-bounce" />
                          <span>เชื่อมโยงเป้าหมาย</span>
                        </div>
                      </div>

                      {/* Step 2: Goal Details */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            <Flame size={14} />
                            Step 2: Goal (เป้าหมายของนักกีฬา)
                          </div>
                          {linkedGoal && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                              Linked Goal #{linkedGoal.id?.slice(0, 6)}
                            </span>
                          )}
                        </div>

                        {linkedGoal ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${linkedGoal.type === 'SHORT_TERM' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                {linkedGoal.type?.replace("_", " ")}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {linkedGoal.category}
                              </span>
                              {linkedGoal.approvalStatus && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  linkedGoal.approvalStatus === 'APPROVED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' :
                                  linkedGoal.approvalStatus === 'NEEDS_REVISION' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' :
                                  'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}>
                                  {linkedGoal.approvalStatus === 'NEEDS_REVISION' ? 'ส่งกลับแก้ไข (Needs Revision)' : linkedGoal.approvalStatus}
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                              {linkedGoal.title}
                            </div>
                            {(linkedGoal.coachFeedback || linkedGoal.revisionReason || linkedGoal.revisionSuggestedTitle) && (
                              <div className="mt-2 bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/80 dark:border-amber-800/40 text-xs space-y-1">
                                {linkedGoal.revisionReason && (
                                  <div>
                                    <span className="font-bold text-amber-800 dark:text-amber-400">เหตุผลที่ต้องปรับปรุง:</span>{" "}
                                    <span className="text-slate-700 dark:text-slate-300">{linkedGoal.revisionReason}</span>
                                  </div>
                                )}
                                {linkedGoal.coachFeedback && (
                                  <div>
                                    <span className="font-bold text-indigo-700 dark:text-indigo-400">คำแนะนำจากโค้ช:</span>{" "}
                                    <span className="text-slate-700 dark:text-slate-300">{linkedGoal.coachFeedback}</span>
                                  </div>
                                )}
                                {linkedGoal.revisionSuggestedTitle && (
                                  <div>
                                    <span className="font-bold text-blue-700 dark:text-blue-400">ชื่อเป้าหมายที่แนะนำ:</span>{" "}
                                    <span className="text-slate-700 dark:text-slate-300">{linkedGoal.revisionSuggestedTitle}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600 dark:text-slate-300 bg-amber-50/50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-100 dark:border-amber-800/40">
                            <span className="font-bold">เป้าหมายหลัก:</span> {idp.goal}
                          </div>
                        )}
                      </div>

                      {/* Arrow Connector */}
                      <div className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={12} className="text-emerald-500 animate-bounce" />
                          <span>หลักฐานการซ้อมจริงสนาม (Training Evidence)</span>
                        </div>
                      </div>

                      {/* Step 3: Training Evidence */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            <CheckCircle size={14} className="text-emerald-500" />
                            Step 3: Training Evidence (หลักฐานการฝึกซ้อมจริงในสนาม)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              ฝึกจริง {linkedEvidences.length} ครั้ง ({cardMinutesTotal} นาที)
                            </span>
                            {cardVerifiedCount > 0 && (
                              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                ✓ โค้ชยืนยัน {cardVerifiedCount}/{linkedEvidences.length} ครั้ง
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Parent Evidence Summary Box */}
                        <div className="bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">ฝึกจริงทั้งหมด:</span>
                            <strong className="text-slate-800 dark:text-slate-100 text-sm font-black">{linkedEvidences.length} ครั้ง</strong>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">เวลารวมที่ฝึกซ้อม:</span>
                            <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-black">{cardMinutesTotal} นาที</strong>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">ฝึกครั้งละ:</span>
                            <strong className="text-slate-800 dark:text-slate-100 text-sm font-black">
                              {linkedEvidences.length > 0 ? `${Math.round(cardMinutesTotal / linkedEvidences.length)} นาที/ครั้ง` : "0 นาที"}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">ยืนยันโดยโค้ช:</span>
                            <strong className="text-blue-700 dark:text-blue-400 text-sm font-black">
                              {cardVerifiedCount > 0 ? `✓ ยืนยันแล้ว (${cardVerifiedCount} ครั้ง)` : "รอการยืนยัน"}
                            </strong>
                          </div>
                        </div>

                        {linkedEvidences.length > 0 ? (
                          <div className="space-y-2.5 pt-1">
                            {linkedEvidences.map((item: any, idx: number) => {
                              const tr = item.idpTraining || item.log?.idpTraining;
                              return (
                                <div
                                  key={idx}
                                  className="bg-white dark:bg-slate-900/60 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-2 text-xs shadow-sm"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
                                      <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />
                                      {tr.activity}
                                    </span>
                                    {tr.coachVerified ? (
                                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-700">
                                        <CheckCircle size={10} /> ✓ โค้ชยืนยันการฝึกจริง
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                        รอโค้ชยืนยัน
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-medium pt-1">
                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                      <span className="block text-[10px] text-slate-400 font-bold uppercase">เวลาฝึกซ้อมจริง:</span>
                                      <strong className="text-slate-800 dark:text-slate-100 text-xs">{tr.minutes} นาที / ครั้ง</strong>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                      <span className="block text-[10px] text-slate-400 font-bold uppercase">จำนวนรอบที่ซ้อม:</span>
                                      <strong className="text-slate-800 dark:text-slate-100 text-xs">{tr.repetitions} ครั้ง</strong>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                                      <span className="block text-[10px] text-slate-400 font-bold uppercase">วันที่ฝึกซ้อม:</span>
                                      <strong className="text-slate-800 dark:text-slate-100 text-xs">{tr.completedAt || item.date || "N/A"}</strong>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center">
                            ยังไม่มีหลักฐานการซ้อมพิเศษ IDP Training ที่ลงบันทึกโดยโค้ช
                          </div>
                        )}
                      </div>

                      {/* Arrow Connector */}
                      <div className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={12} className="text-amber-500 animate-bounce" />
                          <span>ความรู้สึกและการสะท้อนคิด</span>
                        </div>
                      </div>

                      {/* Step 4: Daily Reflections */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                            <BookOpen size={14} />
                            Step 4: Daily Reflections (การสะท้อนความรู้สึกของนักกีฬา)
                          </div>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                            {reflectionCount} บันทึกความรู้สึก
                          </span>
                        </div>

                        {linkedJournals.length > 0 ? (
                          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                            {linkedJournals.map((j: any) => (
                              <div
                                key={j.id}
                                className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-1.5 text-xs shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700">
                                      {getMoodIcon(j.mood, 16)}
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                      วันที่ {j.date}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                      อารมณ์: {j.mood}
                                    </span>
                                  </div>
                                  {j.tags && j.tags.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {j.tags.map((t: string) => (
                                        <span key={t} className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                          #{t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">สิ่งที่นักกีฬาสะท้อนคิด:</span>
                                  <p className="text-slate-700 dark:text-slate-200 font-medium whitespace-pre-wrap leading-relaxed">
                                    "{j.reflection}"
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                            ยังไม่มีบันทึกความรู้สึกการฝึกซ้อม (Daily Reflection) ที่เชื่อมโยงกับเป้าหมายนี้
                          </div>
                        )}
                      </div>

                      {/* Arrow Connector */}
                      <div className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={12} className="text-blue-500 animate-bounce" />
                          <span>วัดผลความคืบหน้า</span>
                        </div>
                      </div>

                      {/* Step 5: Progress Bar & Indicators */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            <Activity size={14} />
                            Step 5: Progress (ความคืบหน้าการฝึกซ้อม)
                          </div>
                          <span className="text-emerald-700 dark:text-emerald-300 font-black">
                            {progressPercent}%
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-medium pt-1">
                          <div className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">จำนวนบันทึกซ้อม:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{reflectionCount} ครั้ง</span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">สถานะเป้าหมาย:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{linkedGoal?.status || idp.status}</span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">สถานะแผน IDP:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">{idp.status}</span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow Connector */}
                      <div className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={12} className="text-purple-500 animate-bounce" />
                          <span>การประเมินขั้นสุดท้าย</span>
                        </div>
                      </div>

                      {/* Step 6: Completed / Final Evaluation */}
                      <div className="bg-emerald-50/40 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                            <Trophy size={14} className="text-amber-500" />
                            Step 6: Completed (ผลการประเมินขั้นสุดท้าย)
                          </div>
                          {isCompleted && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white shadow-sm">
                              <CheckCircle size={10} /> สำเร็จแผน IDP แล้ว
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/40 whitespace-pre-wrap">
                          {idp.evaluation || "อยู่ระหว่างการดำเนินงานตามแผน IDP โดยโค้ชและนักกีฬา"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Target className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={48} />
              <h4 className="text-lg font-bold text-slate-700 dark:text-slate-400">ไม่มีประวัติ IDP</h4>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                นักกีฬาคนนี้ยังไม่เคยมีแผนพัฒนารายบุคคล
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CVIDPLogTab);
