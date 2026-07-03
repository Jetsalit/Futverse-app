const fs = require('fs');

function processFile() {
    let content = fs.readFileSync('c:/Users/asus/Documents/Futverse-app/src/components/ProPlayerManager.tsx', 'utf8');

    const importsToAdd = `import { db } from "../lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { Edit2, Trash2, AlertCircle } from "lucide-react";`;
    content = content.replace('import { ProPlayer } from "../types/ProPlayer";', 'import { ProPlayer } from "../types/ProPlayer";\n' + importsToAdd);

    const stateToAdd = `  const [editingPlayer, setEditingPlayer] = useState<ProPlayer | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);`;
    content = content.replace('  const [isAddModalOpen, setIsAddModalOpen] = useState(false);', '  const [isAddModalOpen, setIsAddModalOpen] = useState(false);\n' + stateToAdd);

    const oldUseEffect = `  useEffect(() => {
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
  }, []);`;
  
    const newUseEffect = `  useEffect(() => {
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
  };`;
    content = content.replace(oldUseEffect, newUseEffect);

    const oldCardStart = `            <div
              key={player.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectPlayer(player)}
            >
              <div className="flex items-start p-5 gap-4">`;
              
    const newCardStart = `            <div
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
              <div className="flex items-start p-5 gap-4 mt-2">`;
    content = content.replace(oldCardStart, newCardStart);

    const oldModalRender = `      {isAddModalOpen && (
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
}`;

    const newModalRender = `      {isAddModalOpen && (
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
}`;
    content = content.replace(oldModalRender, newModalRender);

    const oldModalSig = `function AddProPlayerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: ProPlayer) => void;
}) {`;
    
    const newModalSig = `function AddProPlayerModal({
  initialData,
  onClose,
  onAdd,
}: {
  initialData?: ProPlayer | null;
  onClose: () => void;
  onAdd: (p: any) => void;
}) {`;
    content = content.replace(oldModalSig, newModalSig);
    
    const oldFormData = `  const [formData, setFormData] = useState<Partial<ProPlayer>>({
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
  });`;
  
    const newFormData = `  const [formData, setFormData] = useState<Partial<ProPlayer>>(
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
  );`;
    content = content.replace(oldFormData, newFormData);
    
    content = content.replace("เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)", "{initialData ? 'แก้ไขข้อมูลนักเตะ (Edit Pro Player)' : 'เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)'}");
    
    const oldSaveBtn = `          <button
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
          </button>`;
          
    const newSaveBtn = `          <button
            onClick={() => {
              const dataToSave = { ...formData };
              if (!initialData) {
                dataToSave.name = formData.name || "Unknown";
              }
              onAdd(dataToSave);
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm"
          >
            {initialData ? 'Update Player Data' : 'Save Player Data'}
          </button>`;
    content = content.replace(oldSaveBtn, newSaveBtn);

    fs.writeFileSync('c:/Users/asus/Documents/Futverse-app/src/components/ProPlayerManager.tsx', content, 'utf8');
}

processFile();
