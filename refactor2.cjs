const fs = require('fs');
const filepath = 'c:/Users/asus/Documents/Futverse-app/src/components/ProPlayerManager.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Add useAuth import and firebase imports
if (!content.includes('useAuth')) {
    content = content.replace('import { ProPlayer } from "../types/ProPlayer";', `import { useAuth } from "../contexts/AuthContext";
import { ProPlayer } from "../types/ProPlayer";
import { db } from "../lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { Edit2, Trash2, AlertCircle } from "lucide-react";`);
}

// 2. Add useAuth and hasManagePermission
content = content.replace('  const [isAddModalOpen, setIsAddModalOpen] = useState(false);', 
`  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<ProPlayer | null>(null);
  const { currentUser } = useAuth();
  const hasManagePermission = currentUser?.role === "SUPERADMIN" || currentUser?.role === "ADMIN";`);

// 3. Replace useEffect and fetchPlayers
const old_use_effect = `  useEffect(() => {
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

const new_use_effect = `  useEffect(() => {
    const proPlayersRef = collection(db, "proPlayers");
    const unsubscribe = onSnapshot(
      proPlayersRef,
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
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("คุณต้องการลบนักเตะคนนี้ใช่หรือไม่?")) {
      try {
        await deleteDoc(doc(db, "proPlayers", id));
      } catch (err) {
        console.error("Error deleting pro player:", err);
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      }
    }
  };`;

content = content.replace(old_use_effect, new_use_effect);

// 4. Update the add player button
const old_add_btn = `        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors w-full lg:w-auto justify-center"
        >
          <UserPlus size={18} />
          เพิ่มนักเตะอาชีพ
        </button>`;
const new_add_btn = `        {hasManagePermission && (
          <button
            onClick={() => {
              setEditingPlayer(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors w-full lg:w-auto justify-center"
          >
            <UserPlus size={18} />
            เพิ่มนักเตะอาชีพ
          </button>
        )}`;
content = content.replace(old_add_btn, new_add_btn);

// 5. Add edit/delete buttons to player card
const old_card_header = '              <div className="flex items-start p-5 gap-4">';
const new_card_header = `              <div className="flex items-start p-5 gap-4 relative">
                {hasManagePermission && (
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPlayer(player);
                        setIsAddModalOpen(true);
                      }}
                      className="p-2 bg-white/80 hover:bg-indigo-50 text-indigo-600 rounded-full transition-colors shadow-sm border border-slate-100"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(player.id!);
                      }}
                      className="p-2 bg-white/80 hover:bg-red-50 text-red-600 rounded-full transition-colors shadow-sm border border-slate-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}`;
content = content.replace(old_card_header, new_card_header);

// 6. Update AddProPlayerModal usage
const old_modal_usage = `      {isAddModalOpen && (
        <AddProPlayerModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={(p) => {
            setPlayers((prev) => [p, ...prev]);
            setIsAddModalOpen(false);
          }}
        />
      )}`;

const new_modal_usage = `      {isAddModalOpen && (
        <AddProPlayerModal
          initialData={editingPlayer}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingPlayer(null);
          }}
          onSave={async (p) => {
            try {
              if (editingPlayer && editingPlayer.id) {
                await updateDoc(doc(db, "proPlayers", editingPlayer.id), p as any);
              } else {
                await addDoc(collection(db, "proPlayers"), p);
              }
              setIsAddModalOpen(false);
              setEditingPlayer(null);
            } catch (err) {
              console.error("Error saving pro player:", err);
              alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
            }
          }}
        />
      )}`;
content = content.replace(old_modal_usage, new_modal_usage);

// 7. Update AddProPlayerModal signature
const old_modal_sig = `function AddProPlayerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: ProPlayer) => void;
}) {
  const [formData, setFormData] = useState<Partial<ProPlayer>>({
    name: "",`;

const new_modal_sig = `function AddProPlayerModal({
  initialData,
  onClose,
  onSave,
}: {
  initialData?: ProPlayer | null;
  onClose: () => void;
  onSave: (p: Partial<ProPlayer>) => void;
}) {
  const [formData, setFormData] = useState<Partial<ProPlayer>>(initialData || {
    name: "",`;
content = content.replace(old_modal_sig, new_modal_sig);

// 8. Update save button
const old_save_btn = `          <button
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

const new_save_btn = `          <button
            onClick={() => {
              onSave({
                ...formData,
                name: formData.name || "Unknown",
              });
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm"
          >
            Save Player Data
          </button>`;
content = content.replace(old_save_btn, new_save_btn);

// Update title string
content = content.replace('เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)', '{initialData ? "แก้ไขข้อมูลนักเตะ (Edit Pro Player)" : "เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)"}');

fs.writeFileSync(filepath, content);
console.log('Successfully refactored ProPlayerManager.tsx');
