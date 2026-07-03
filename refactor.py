import re

def process_file():
    with open('c:/Users/asus/Documents/Futverse-app/src/components/ProPlayerManager.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add imports
    imports_to_add = """import { db } from "../lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { Edit2, Trash2, AlertCircle } from "lucide-react";"""
    
    content = content.replace('import { ProPlayer } from "../types/ProPlayer";', 'import { ProPlayer } from "../types/ProPlayer";\n' + imports_to_add)

    # 2. Add Edit/Delete state to ProPlayerManager
    state_to_add = """  const [editingPlayer, setEditingPlayer] = useState<ProPlayer | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);"""
    
    content = content.replace('  const [isAddModalOpen, setIsAddModalOpen] = useState(false);', '  const [isAddModalOpen, setIsAddModalOpen] = useState(false);\n' + state_to_add)

    # 3. Replace useEffect
    old_use_effect = """  useEffect(() => {
    let isMounted = true;
    const fetchPlayers = async () => {
      try {
        setIsLoading(true);
        // Simulate fetch delay to show loading state if needed
        await new Promise((r) => setTimeout(r, 400));
        if (isMounted) setPlayers(MOCK_PRO_PLAYERS);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchPlayers();
    return () => {
      isMounted = false;
    };
  }, []);"""
  
    new_use_effect = """  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "proPlayers"),
      (snapshot) => {
        const playersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProPlayer[];
        setPlayers(playersData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching pro players:", error);
        alert("ไม่สามารถโหลดข้อมูลได้: " + error.message);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSavePlayer = async (playerData: any) => {
    try {
      if (editingPlayer) {
        await updateDoc(doc(db, "proPlayers", editingPlayer.id!), playerData);
      } else {
        await addDoc(collection(db, "proPlayers"), playerData);
      }
      setIsAddModalOpen(false);
      setEditingPlayer(null);
    } catch (error: any) {
      console.error("Error saving pro player:", error);
      alert("ไม่สามารถบันทึกข้อมูลได้: " + error.message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (playerToDelete) {
      try {
        await deleteDoc(doc(db, "proPlayers", playerToDelete));
        setPlayerToDelete(null);
      } catch (error: any) {
        console.error("Error deleting pro player:", error);
        alert("ไม่สามารถลบข้อมูลได้: " + error.message);
      }
    }
  };"""
    content = content.replace(old_use_effect, new_use_effect)

    # 4. Modify player card to add Edit/Delete buttons
    old_card_start = """            <div
              key={player.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectPlayer(player)}
            >
              <div className="flex items-start p-5 gap-4">"""
              
    new_card_start = """            <div
              key={player.id}
              className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectPlayer(player)}
            >
              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPlayer(player);
                    setIsAddModalOpen(true);
                  }}
                  className="p-2 bg-white text-indigo-600 hover:bg-indigo-50 rounded-lg shadow-sm border border-slate-200"
                  title="Edit Player"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlayerToDelete(player.id!);
                  }}
                  className="p-2 bg-white text-rose-600 hover:bg-rose-50 rounded-lg shadow-sm border border-slate-200"
                  title="Delete Player"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-start p-5 gap-4 mt-2">"""
    
    content = content.replace(old_card_start, new_card_start)

    # 5. Modify Add Modal rendering
    old_modal_render = """      {isAddModalOpen && (
        <AddProPlayerModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={(p) => {
            setPlayers((prev) => [p, ...prev]);
            setIsAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}"""

    new_modal_render = """      {isAddModalOpen && (
        <AddProPlayerModal
          initialData={editingPlayer}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingPlayer(null);
          }}
          onAdd={handleSavePlayer}
        />
      )}

      {/* Delete Confirmation Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPlayerToDelete(null)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-xl font-black text-slate-800 text-center mb-2">ยืนยันการลบข้อมูล</h3>
            <p className="text-slate-500 text-center text-sm mb-6 font-medium">
              คุณแน่ใจหรือไม่ว่าต้องการลบนักเตะคนนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPlayerToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                ลบข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}"""
    content = content.replace(old_modal_render, new_modal_render)

    # 6. Update AddProPlayerModal signature and logic
    old_modal_sig = """function AddProPlayerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: ProPlayer) => void;
}) {"""
    
    new_modal_sig = """function AddProPlayerModal({
  initialData,
  onClose,
  onAdd,
}: {
  initialData?: ProPlayer | null;
  onClose: () => void;
  onAdd: (p: any) => void;
}) {"""
    content = content.replace(old_modal_sig, new_modal_sig)
    
    # 7. Initialize form with initialData
    old_form_data = """  const [formData, setFormData] = useState<Partial<ProPlayer>>({
    name: "",
    nationality: "",
    dob: "",
    position: "Striker",
    height: 175,
    weight: 70,
    preferredFoot: "Right",
    currentClub: "",
    league: "T1",
    contractExpiry: "",
    marketValue: "",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=new",
    actionShotUrl: "",
    highlightVideoUrl: "",
    careerHistory: [],
    attributes: {
      technical: 70,
      tactical: 70,
      physical: 70,
      mental: 70,
      attacking: 70,
      defending: 70,
    },
  });"""
  
    new_form_data = """  const [formData, setFormData] = useState<Partial<ProPlayer>>(
    initialData || {
      name: "",
      nationality: "",
      dob: "",
      position: "Striker",
      height: 175,
      weight: 70,
      preferredFoot: "Right",
      currentClub: "",
      league: "T1",
      contractExpiry: "",
      marketValue: "",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=new",
      actionShotUrl: "",
      highlightVideoUrl: "",
      careerHistory: [],
      attributes: {
        technical: 70,
        tactical: 70,
        physical: 70,
        mental: 70,
        attacking: 70,
        defending: 70,
      },
    }
  );"""
    content = content.replace(old_form_data, new_form_data)
    
    # 8. Update Modal Title
    content = content.replace("เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)", "{initialData ? 'แก้ไขข้อมูลนักเตะ (Edit Pro Player)' : 'เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)'}")
    
    # 9. Update Save Button
    old_save_btn = """          <button
            onClick={() => {
              onAdd({
                ...formData,
                id: "new_" + Date.now(),
                name: formData.name || "Unknown",
              } as ProPlayer);
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm"
          >
            Save Player Data
          </button>"""
          
    new_save_btn = """          <button
            onClick={() => {
              const dataToSave = { ...formData };
              if (!initialData) {
                // Let Firestore assign ID, so we don't need to add it here
                dataToSave.name = formData.name || "Unknown";
              }
              onAdd(dataToSave);
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm"
          >
            {initialData ? 'Update Player Data' : 'Save Player Data'}
          </button>"""
    content = content.replace(old_save_btn, new_save_btn)

    with open('c:/Users/asus/Documents/Futverse-app/src/components/ProPlayerManager.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

process_file()
