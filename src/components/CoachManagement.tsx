import React, { useState } from "react";
import {
  Plus,
  X,
  Edit2,
  Trash2,
  ChevronLeft,
  Search,
  Upload,
} from "lucide-react";

const MOCK_TEAMS = [
  { id: "1", name: "U-17 National Prospects" },
  { id: "2", name: "U-15 Development" },
  { id: "3", name: "U-13 Grassroots" },
  { id: "4", name: "Senior Pro Squad" },
];

const LICENSES = ["Pro", "A", "B", "C", "ไม่มี"];

const MOCK_COACHES = [
  {
    id: "1",
    firstName: "Somchai",
    lastName: "Kirati",
    email: "somchai@academy.com",
    phone: "081-234-5678",
    license: "Pro",
    teams: ["U-17 National Prospects", "Senior Pro Squad"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Somchai",
  },
  {
    id: "2",
    firstName: "Takano",
    lastName: "Yuki",
    email: "takano@academy.com",
    phone: "089-876-5432",
    license: "A",
    teams: ["U-17 National Prospects", "U-15 Development"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Takano",
  },
  {
    id: "3",
    firstName: "Pipat",
    lastName: "Tong",
    email: "pipat@academy.com",
    phone: "082-345-6789",
    license: "C",
    teams: ["U-13 Grassroots"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Pipat",
  },
];

export default function CoachManagement({ onBack }: { onBack: () => void }) {
  const [coaches, setCoaches] = useState(MOCK_COACHES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [coachToDelete, setCoachToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    license: "C",
    teams: [] as string[],
    avatarUrl: "",
  });

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
        setFormData((prev) => ({
          ...prev,
          avatarUrl: reader.result as string,
        }));
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newCoach = {
      id: Date.now().toString(),
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
    setCoaches([newCoach, ...coaches]);
    setIsModalOpen(false);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      license: "C",
      teams: [],
      avatarUrl: "",
    });
  };

  const handleDeleteClick = (id: string) => {
    setCoachToDelete(id);
  };

  const handleConfirmDelete = () => {
    if (coachToDelete) {
      setCoaches(coaches.filter((c) => c.id !== coachToDelete));
      setCoachToDelete(null);
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
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          <span>เพิ่มผู้ฝึกสอน</span>
        </button>
      </div>

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
                      <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
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
                เพิ่มผู้ฝึกสอน (Add Coach)
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
                <label className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img
                      src={formData.avatarUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Upload
                        size={20}
                        className="mb-1 group-hover:-translate-y-1 transition-transform"
                      />
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        รููปภาพ
                      </span>
                    </>
                  )}
                  <input
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
                    {MOCK_TEAMS.map((team) => (
                      <label
                        key={team.id}
                        className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.teams.includes(team.name)}
                          onChange={() => toggleTeam(team.name)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {team.name}
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
