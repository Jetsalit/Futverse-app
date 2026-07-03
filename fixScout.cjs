const fs = require('fs');
const filepath = 'c:/Users/asus/Documents/Futverse-app/src/components/ScoutDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add Firebase imports and useAuth
content = content.replace(
  'import React, { useState, useMemo } from "react";\nimport {',
  `import React, { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import {`
);

content = content.replace(
  '  BadgeCheck,\n} from "lucide-react";',
  `  BadgeCheck,
  Edit2,
  Trash2,
} from "lucide-react";`
);

// 2. Remove MOCK_PLAYERS
content = content.replace(/const MOCK_PLAYERS: ScoutPlayer\[\] = \[\s*\{[\s\S]*?\];/m, '');

// 3. Setup ScoutDashboard with Firestore
content = content.replace(
  'export default function ScoutDashboard({ onBack }: { onBack: () => void }) {\n  const [searchQuery, setSearchQuery] = useState("");',
  `export default function ScoutDashboard({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("SUPERADMIN") || hasPermission("ADMIN");
  
  const [players, setPlayers] = useState<ScoutPlayer[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<ScoutPlayer | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "scoutPlayers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScoutPlayer));
      setPlayers(data);
    });
    return () => unsub();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");`
);

content = content.replace(
  '  const filteredPlayers = useMemo(() => {\n    return MOCK_PLAYERS.filter((player) => {',
  `  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {`
);

content = content.replace(
  '  const PROVINCES = Array.from(new Set(MOCK_PLAYERS.map((p) => p.province)));',
  '  const PROVINCES = Array.from(new Set(players.map((p) => p.province)));'
);

content = content.replace(
  '                {filteredPlayers.map((player) => (\n                  <TalentCard\n                    key={player.id}\n                    player={player}\n                    compareMode={compareMode}\n                  />\n                ))}',
  `                {filteredPlayers.map((player) => (
                  <TalentCard
                    key={player.id}
                    player={player}
                    compareMode={compareMode}
                    canEdit={canEdit}
                    onEdit={() => {
                      setEditingPlayer(player);
                      setIsSubmitModalOpen(true);
                    }}
                    onDelete={async () => {
                      if (confirm("Are you sure you want to delete this player?")) {
                        await deleteDoc(doc(db, "scoutPlayers", player.id));
                      }
                    }}
                  />
                ))}`
);

content = content.replace(
  '      {isSubmitModalOpen && (\n        <SubmitTalentModal onClose={() => setIsSubmitModalOpen(false)} />\n      )}',
  `      {isSubmitModalOpen && (
        <SubmitTalentModal 
          initialData={editingPlayer}
          onClose={() => {
            setIsSubmitModalOpen(false);
            setEditingPlayer(null);
          }}
          onSave={async (p) => {
            try {
              if (editingPlayer && editingPlayer.id) {
                await updateDoc(doc(db, "scoutPlayers", editingPlayer.id), p as any);
              } else {
                await addDoc(collection(db, "scoutPlayers"), {
                  ...p,
                  status: "Pending",
                  grade: p.grade || "C",
                  stars: p.stars || 3,
                  stats: p.stats || { pace: 70, stamina: 70, passing: 70 },
                  image: p.image || \`https://api.dicebear.com/7.x/avataaars/svg?seed=\${p.name}\`
                });
              }
              setIsSubmitModalOpen(false);
              setEditingPlayer(null);
            } catch (err) {
              console.error("Error saving scout player:", err);
              alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
            }
          }}
        />
      )}`
);

// 4. Update TalentCard
content = content.replace(
  '  compareMode,\n}: {\n  player: ScoutPlayer;\n  compareMode: boolean;\n}) {',
  `  compareMode,
  canEdit,
  onEdit,
  onDelete,
}: {
  player: ScoutPlayer;
  compareMode: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {`
);

content = content.replace(
  '      {/* Card Header & Profile */}',
  `      {/* Edit/Delete Actions */}
      {canEdit && !compareMode && (
        <div className="absolute top-3 left-3 flex gap-2 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="w-8 h-8 rounded-full bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center shadow-sm border border-slate-200 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="w-8 h-8 rounded-full bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shadow-sm border border-slate-200 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Card Header & Profile */}`
);

// 5. Update SubmitTalentModal
content = content.replace(
  'function SubmitTalentModal({ onClose }: { onClose: () => void }) {\n  const [submitComplete, setSubmitComplete] = useState(false);',
  `function SubmitTalentModal({ 
  initialData, 
  onClose, 
  onSave 
}: { 
  initialData?: ScoutPlayer | null;
  onClose: () => void;
  onSave: (p: Partial<ScoutPlayer>) => void;
}) {
  const [formData, setFormData] = useState<Partial<ScoutPlayer>>(initialData || {
    name: "",
    age: 15,
    height: 170,
    weight: 60,
    position: "",
    academy: "",
    province: "",
    // We add an extra field for video link if needed, but sticking to ScoutPlayer interface
  });
  
  const [submitComplete, setSubmitComplete] = useState(false);`
);

content = content.replace(
  '          <button\n            onClick={onClose}\n            className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"\n          >\n            กลับสู่หน้าหลัก\n          </button>',
  `          <button
            onClick={() => {
              setSubmitComplete(false);
              onClose();
            }}
            className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            ปิด
          </button>`
);

content = content.replace(
  '        <form\n          className="flex-1 overflow-y-auto p-6 space-y-8"\n          onSubmit={(e) => {\n            e.preventDefault();\n            setSubmitComplete(true);\n          }}\n        >',
  `        <form
          className="flex-1 overflow-y-auto p-6 space-y-8"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(formData);
            setSubmitComplete(true);
          }}
        >`
);

content = content.replace(
  '                <input\n                  type="text"\n                  required\n                  placeholder="ด.ช. หรือ นาย..."\n                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"\n                />',
  `                <input
                  type="text"
                  required
                  placeholder="ด.ช. หรือ นาย..."
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />`
);

content = content.replace(
  '                <input\n                  type="number"\n                  required\n                  placeholder="เช่น 15"\n                  min={10}\n                  max={22}\n                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"\n                />',
  `                <input
                  type="number"
                  required
                  placeholder="เช่น 15"
                  min={10}
                  max={22}
                  value={formData.age || ""}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />`
);

content = content.replace(
  '                <input\n                  type="number"\n                  required\n                  placeholder="เช่น 170"\n                  min={120}\n                  max={210}\n                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"\n                />',
  `                <input
                  type="number"
                  required
                  placeholder="เช่น 170"
                  min={120}
                  max={210}
                  value={formData.height || ""}
                  onChange={(e) => setFormData({ ...formData, height: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />`
);

content = content.replace(
  '                <select\n                  required\n                  defaultValue=""\n                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"\n                >',
  `                <select
                  required
                  value={formData.position || ""}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                >`
);

content = content.replace(
  '                <input\n                  type="text"\n                  required\n                  placeholder="เช่น รร.อัสสัมชัญธนบุรี, อะคาเดมี่..."\n                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"\n                />',
  `                <input
                  type="text"
                  required
                  placeholder="เช่น รร.อัสสัมชัญธนบุรี, อะคาเดมี่..."
                  value={formData.academy || ""}
                  onChange={(e) => setFormData({ ...formData, academy: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  จังหวัด <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น กรุงเทพมหานคร"
                  value={formData.province || ""}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />`
);

fs.writeFileSync(filepath, content);
console.log('Script written');
