import React, { useState, useEffect } from "react";
import {
  Plus,
  X,
  Edit2,
  Trash2,
  ChevronLeft,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useAcademy } from "../contexts/AcademyContext";
import { useAuth } from "../contexts/AuthContext";
import { EmptyState } from "./common/EmptyState";
import { approveAcademyJoinClaim } from "../services/membershipService";
import type { AcademyJoinClaim, TenantRole } from "../types/Membership";

const LICENSES = ["Pro", "A", "B", "C", "G", "ไม่มี"];

interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  license: string;
  teams: string[];
  avatar: string;
  userId?: string;
}

const MOCK_COACHES: Coach[] = [];

const getClaimRole = (claim: AcademyJoinClaim): TenantRole | null => {
  if (claim.type === "COACH_JOIN") return "COACH";
  return claim.requestedRole === "ADMIN" || claim.requestedRole === "COACH"
    ? claim.requestedRole
    : null;
};

const formatClaimDate = (value: AcademyJoinClaim["createdAt"]) => {
  if (!value) return "Unknown";
  const date = typeof value === "object" && "toDate" in value
    ? value.toDate()
    : new Date(value as Date | string);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
};

export default function CoachManagement({ onBack }: { onBack: () => void }) {
  const { settings, getAcademyCollection, academyId } = useAcademy();
  const { currentUser } = useAuth();
  const [coaches, setCoaches] = useState<Coach[]>(MOCK_COACHES);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [coachToDelete, setCoachToDelete] = useState<string | null>(null);
  
  const [pendingClaims, setPendingClaims] = useState<AcademyJoinClaim[]>([]);
  const [activeTab, setActiveTab] = useState<"coaches" | "claims">("coaches");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    license: "C",
    teams: [] as string[],
    avatarUrl: "",
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(getAcademyCollection("coaches"), (snapshot) => {
      const loadedCoaches = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Coach[];
      setCoaches(loadedCoaches);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!settings.inviteCode) return;
    const q = query(
      collection(db, "profile_claims"), 
      where("inviteCode", "==", settings.inviteCode),
      where("status", "==", "PENDING")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setPendingClaims(
        snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }) as AcademyJoinClaim)
          .filter((claim) => getClaimRole(claim) !== null),
      );
    });
    return () => unsub();
  }, [settings.inviteCode]);

  const handleApproveClaim = async (claim: AcademyJoinClaim) => {
    try {
      const approvedBy = currentUser?.uid || currentUser?.id;
      if (!academyId || !approvedBy) {
        throw new Error("An exact Academy ID and approving user are required.");
      }
      const result = await approveAcademyJoinClaim({
        academyId,
        claim,
        approvedBy,
      });
      alert(
        `${result.role} Membership approved. The user must activate Academy access from their account.`,
      );
    } catch (error) {
      console.error("Error approving claim", error);
      alert(error instanceof Error ? error.message : "Failed to approve request");
    }
  };

  const handleRejectClaim = async (claimId: string) => {
    try {
      const rejectedBy = currentUser?.uid || currentUser?.id;
      if (!rejectedBy) throw new Error("An approving user is required.");
      await updateDoc(doc(db, "profile_claims", claimId), {
        status: "REJECTED",
        rejectedAt: serverTimestamp(),
        rejectedBy,
        updatedAt: serverTimestamp(),
      });
      alert("Academy join request rejected");
    } catch (error) {
      console.error("Error rejecting claim", error);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      license: "C",
      teams: [],
      avatarUrl: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (coach: Coach) => {
    setEditingId(coach.id);
    setFormData({
      firstName: coach.firstName,
      lastName: coach.lastName,
      email: coach.email,
      phone: coach.phone,
      license: coach.license,
      teams: coach.teams || [],
      avatarUrl: coach.avatar || "",
    });
    setIsModalOpen(true);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 500;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setFormData((prev) => ({
            ...prev,
            avatarUrl: dataUrl,
          }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleTeam = (teamName: string) => {
    setFormData((prev) => {
      const isSelected = prev.teams.includes(teamName);
      return {
        ...prev,
        teams: isSelected
          ? prev.teams.filter((t) => t !== teamName)
          : [...prev.teams, teamName],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const currentCoachDoc = editingId ? coaches.find(c => c.id === editingId) : null;
      let matchedUserId = currentCoachDoc?.userId;

      if (!matchedUserId && currentUser?.email && formData.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) {
        matchedUserId = (currentUser as any).uid || (currentUser as any).id;
      }

      const coachData: any = {
        ...(matchedUserId && { userId: matchedUserId }),
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        license: formData.license,
        teams: formData.teams,
        avatar:
          formData.avatarUrl ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.firstName}`,
      };

      if (editingId) {
        await updateDoc(doc(getAcademyCollection("coaches"), editingId), coachData);
      } else {
        await addDoc(getAcademyCollection("coaches"), coachData);
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        license: "C",
        teams: [],
        avatarUrl: "",
      });
    } catch (error) {
      console.error("Error saving coach:", error);
    }
  };

  const handleDeleteClick = (id: string) => {
    setCoachToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (coachToDelete) {
      try {
        await deleteDoc(doc(getAcademyCollection("coaches"), coachToDelete));
        setCoachToDelete(null);
      } catch (error) {
        console.error("Error deleting coach:", error);
      }
    }
  };

  const handleCancelDelete = () => {
    setCoachToDelete(null);
  };

  const filteredCoaches = coaches.filter(
    (c) =>
      `${c.firstName} ${c.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              จัดการผู้ฝึกสอน (Coach Directory)
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Staff Management
            </p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          <span>เพิ่มผู้ฝึกสอน</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("coaches")}
          className={`pb-3 text-sm font-bold transition-colors relative ${
            activeTab === "coaches"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Coaches List
        </button>
        <button
          onClick={() => setActiveTab("claims")}
          className={`pb-3 text-sm font-bold transition-colors relative ${
            activeTab === "claims"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Pending Requests
          {pendingClaims.length > 0 && (
            <span className="absolute -top-1 -right-4 bg-rose-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
              {pendingClaims.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "claims" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Pending Join Requests</h2>
          {pendingClaims.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              No pending requests at the moment.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingClaims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl bg-slate-50">
                  <div>
                    <h3 className="font-bold text-slate-800">{claim.userName || "Unknown"}</h3>
                    <p className="text-sm text-slate-500">{claim.userEmail}</p>
                    <p className="text-xs font-bold text-indigo-600 mt-1">
                      Requested role: {getClaimRole(claim)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Requested on {formatClaimDate(claim.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveClaim(claim)}
                      className="px-4 py-2 bg-emerald-100 text-emerald-700 font-bold rounded-lg text-sm hover:bg-emerald-200 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectClaim(claim.id)}
                      className="px-4 py-2 bg-rose-100 text-rose-700 font-bold rounded-lg text-sm hover:bg-rose-200 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : coaches.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Coaches Yet"
          description="Start building your coaching staff."
          primaryActionLabel="Add Coach"
          onPrimaryAction={openAddModal}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center mb-6">
            <div className="relative w-full max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือ อีเมล..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Content Area - Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-6 py-4 border-b">ข้อมูลผู้ฝึกสอน</th>
                    <th className="px-6 py-4 border-b">สิทธิ์ / License</th>
                    <th className="px-6 py-4 border-b">
                      ทีมที่ดูแล (Assigned Teams)
                    </th>
                    <th className="px-6 py-4 border-b text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCoaches.map((coach) => (
                    <tr
                      key={coach.id}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-slate-100 shrink-0">
                            <img
                              src={
                                coach.avatar ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${coach.firstName}`
                              }
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">
                              {coach.firstName} {coach.lastName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {coach.email}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {coach.phone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center justify-center bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                          {coach.license}{" "}
                          {coach.license !== "ไม่มี" ? "License" : ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {coach.teams.map((team, idx) => (
                            <span
                              key={idx}
                              className="bg-slate-100 border border-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md font-medium"
                            >
                              {team}
                            </span>
                          ))}
                          {coach.teams.length === 0 && (
                            <span className="text-xs text-slate-400 italic">
                              No teams assigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(coach)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(coach.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCoaches.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        ไม่พบข้อมูลผู้ฝึกสอน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal เพิ่มผู้ฝึกสอน */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "แก้ไขผู้ฝึกสอน (Edit Coach)" : "เพิ่มผู้ฝึกสอน (Add Coach)"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto">
              <div className="flex flex-col items-center justify-center mb-6">
                <label htmlFor="coach-photo-upload" className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img
                      src={formData.avatarUrl}
                      alt="Preview"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <>
                      <Upload
                        size={20}
                        className="mb-1 group-hover:-translate-y-1 transition-transform pointer-events-none"
                      />
                      <span className="text-[10px] font-medium uppercase tracking-wider pointer-events-none">
                        รููปภาพ
                      </span>
                    </>
                  )}
                  <input
                    id="coach-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      ชื่อ (First Name)
                    </label>
                    <input
                      required
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="ระบุชื่อ"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      นามสกุล (Last Name)
                    </label>
                    <input
                      required
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="ระบุนามสกุล"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      อีเมล (Email)
                    </label>
                    <input
                      required
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      type="email"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      เบอร์โทร (Phone)
                    </label>
                    <input
                      required
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    ระดับ License
                  </label>
                  <select
                    name="license"
                    value={formData.license}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {LICENSES.map((lic) => (
                      <option key={lic} value={lic}>
                        {lic} {lic !== "ไม่มี" ? "License" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                    รุ่นอายุที่รับผิดชอบ (Assigned Teams)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {settings.squads.map((teamName) => (
                      <label
                        key={teamName}
                        className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.teams.includes(teamName)}
                          onChange={() => toggleTeam(teamName)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {teamName}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ลบผู้ฝึกสอน */}
      {coachToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={handleCancelDelete}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              ยืนยันการลบข้อมูล
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              คุณต้องการลบข้อมูลผู้ฝึกสอนท่านนี้ออกจากระบบใช่หรือไม่?
              ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelDelete}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmDelete}
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
}
