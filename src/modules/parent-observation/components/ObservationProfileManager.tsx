import React, { useState, useEffect } from "react";
import { 
  Plus, Edit2, CheckCircle2, GripVertical, Save, X, Lock, Copy
} from "lucide-react";
import { ObservationProfile, ObservationProfileMetric, ObservationMetric } from "../types";
import { 
  getObservationProfiles, 
  getSystemMetrics, 
  createObservationProfile, 
  updateObservationProfile,
  checkProfileUsedInSession
} from "../firebase/api";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useToast } from "../../../contexts/ToastContext";

interface ProfileManagerProps {
  academyId: string;
}

export default function ObservationProfileManager({ academyId }: ProfileManagerProps) {
  const [profiles, setProfiles] = useState<ObservationProfile[]>([]);
  const [globalMetrics, setGlobalMetrics] = useState<ObservationMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<ObservationProfile | null>(null);
  const [profileLockedStatus, setProfileLockedStatus] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profilesData, metricsData] = await Promise.all([
        getObservationProfiles(academyId),
        getSystemMetrics()
      ]);
      setProfiles(profilesData);
      setGlobalMetrics(metricsData.filter(m => m.status === "ACTIVE"));
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (academyId) {
      fetchData();
    }
  }, [academyId]);

  const handleAddNew = () => {
    const initialMetrics: ObservationProfileMetric[] = globalMetrics.map((gm, index) => ({
      metricCode: gm.metricCode,
      enabled: false,
      displayOrder: index,
      buttonLabel: gm.metricName,
      categoryDisplay: gm.category
    }));
    
    setEditingProfile({
      academyId,
      profileId: `PROFILE-${Date.now()}`,
      profileName: "New Observation Profile",
      profileVersion: "v1",
      templateId: "GLOBAL-TEMPLATE-1", // For phase 1 minimum viable template
      status: "DRAFT",
      metrics: initialMetrics
    });
    setProfileLockedStatus(false);
    setErrorMsg("");
  };

  const handleEdit = async (profile: ObservationProfile) => {
    try {
      const isLocked = await checkProfileUsedInSession(academyId, profile.profileId, profile.profileVersion);
      setProfileLockedStatus(isLocked);
      
      const clonedProfile = JSON.parse(JSON.stringify(profile));
      
      // Merge any new global metrics that might have been added by Superadmin
      const existingCodes = new Set(clonedProfile.metrics.map((m: any) => m.metricCode));
      globalMetrics.forEach((gm, index) => {
        if (!existingCodes.has(gm.metricCode)) {
          clonedProfile.metrics.push({
            metricCode: gm.metricCode,
            enabled: false,
            displayOrder: clonedProfile.metrics.length + index,
            buttonLabel: gm.metricName,
            categoryDisplay: gm.category
          });
        }
      });

      setEditingProfile(clonedProfile);
      setErrorMsg(isLocked ? "This profile has been used in a session and is READ ONLY. You must 'Clone to New Version' to make changes." : "");
    } catch (error) {
      console.error(error);
    }
  };

  const handleCloneNewVersion = () => {
    if (!editingProfile) return;
    const vMatch = editingProfile.profileVersion.match(/v(\d+)/);
    const newV = vMatch ? parseInt(vMatch[1]) + 1 : 2;
    
    const cloned = { ...editingProfile };
    delete cloned.id; // Delete to prevent Firestore 'undefined' error
    
    setEditingProfile({
      ...cloned,
      profileVersion: `v${newV}`,
      status: "DRAFT"
    });
    setProfileLockedStatus(false);
    setErrorMsg("");
  };

  const handleSave = async () => {
    if (!editingProfile) return;
    
    try {
      if (editingProfile.id) {
        if (profileLockedStatus) {
          setErrorMsg("Cannot update a locked profile. Please clone to a new version.");
          return;
        }
        // Strip fields that should not be in the update payload
        const { id, createdAt, updatedAt, ...updateData } = editingProfile;
        await updateObservationProfile(academyId, editingProfile.id, editingProfile.profileId, editingProfile.profileVersion, updateData);
      } else {
        // Strip fields that should not be in the create payload
        const { id, createdAt, updatedAt, ...createData } = editingProfile;
        await createObservationProfile(academyId, createData);
      }
      setEditingProfile(null);
      fetchData();
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to save profile");
    }
  };

  const toggleMetric = (metricCode: string) => {
    if (profileLockedStatus || !editingProfile) return;
    setEditingProfile({
      ...editingProfile,
      metrics: editingProfile.metrics.map(m => 
        m.metricCode === metricCode ? { ...m, enabled: !m.enabled } : m
      )
    });
  };

  const updateMetricLabel = (metricCode: string, label: string) => {
    if (profileLockedStatus || !editingProfile) return;
    setEditingProfile({
      ...editingProfile,
      metrics: editingProfile.metrics.map(m => 
        m.metricCode === metricCode ? { ...m, buttonLabel: label } : m
      )
    });
  };

  const activateProfile = async (profile: ObservationProfile) => {
    if (!profile.id) return;
    try {
      const activeRef = doc(db, `academies/${academyId}/observation_profiles`, profile.id);
      await updateDoc(activeRef, { status: "ACTIVE", updatedAt: serverTimestamp() });
      
      const otherProfiles = profiles.filter(p => p.id !== profile.id && p.status === "ACTIVE");
      for (const p of otherProfiles) {
        if (p.id) {
          const pRef = doc(db, `academies/${academyId}/observation_profiles`, p.id);
          await updateDoc(pRef, { status: "ARCHIVED", updatedAt: serverTimestamp() });
        }
      }
      fetchData();
      addToast("เปิดใช้งาน Profile สำเร็จ", "success");
    } catch (error: any) {
      console.error("Error activating", error);
      addToast("Activate ไม่สำเร็จ: " + (error?.message || "Unknown error"), "error");
    }
  };

  if (isLoading) return <div className="p-4 text-center">Loading Profiles...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Observation Profiles</h2>
        {!editingProfile && (
          <button 
            onClick={handleAddNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} /> New Profile
          </button>
        )}
      </div>

      {!editingProfile ? (
        <div className="grid gap-4">
          {profiles.map(profile => (
            <div key={profile.id} className="bg-white border rounded-xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{profile.profileName}</h3>
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">{profile.profileVersion}</span>
                  {profile.status === "ACTIVE" && (
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} /> Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {profile.metrics.filter(m => m.enabled).length} metrics enabled
                </p>
              </div>
              <div className="flex gap-2">
                {profile.status !== "ACTIVE" && (
                  <button 
                    onClick={() => activateProfile(profile)}
                    className="text-emerald-600 hover:bg-emerald-50 px-3 py-1 rounded border border-emerald-200"
                  >
                    Activate
                  </button>
                )}
                <button 
                  onClick={() => handleEdit(profile)}
                  className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {profiles.length === 0 && (
            <div className="text-center p-8 text-slate-500 border border-dashed rounded-xl bg-slate-50">
              No profiles found for this academy. Create one to get started.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              {profileLockedStatus ? <Lock size={20} className="text-amber-500" /> : <Edit2 size={20} />}
              {editingProfile.id ? "Edit Profile" : "Create Profile"}
            </h3>
            <button onClick={() => setEditingProfile(null)} className="text-slate-400 hover:text-slate-600">
              <X size={24} />
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-4 text-amber-700 text-sm">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Profile Name</label>
              <input 
                type="text" 
                value={editingProfile.profileName}
                onChange={e => !profileLockedStatus && setEditingProfile({...editingProfile, profileName: e.target.value})}
                disabled={profileLockedStatus}
                className="w-full border rounded-lg p-2 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Version</label>
              <input 
                type="text" 
                value={editingProfile.profileVersion}
                disabled
                className="w-full border rounded-lg p-2 bg-slate-100 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-medium text-slate-800 mb-3 border-b pb-2">Metrics Configuration</h4>
            <div className="space-y-2">
              {editingProfile.metrics.map(metric => {
                const globalDef = globalMetrics.find(g => g.metricCode === metric.metricCode);
                return (
                  <div key={metric.metricCode} className={`flex items-center gap-4 p-3 rounded-lg border ${metric.enabled ? 'bg-white border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                    <button 
                      onClick={() => toggleMetric(metric.metricCode)}
                      disabled={profileLockedStatus}
                      className={`w-6 h-6 rounded flex items-center justify-center ${metric.enabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}
                    >
                      {metric.enabled && <CheckCircle2 size={16} />}
                    </button>
                    
                    <div className="w-8 flex justify-center text-slate-400">
                      <GripVertical size={16} />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{globalDef?.metricName || metric.metricCode}</span>
                        {globalDef?.positionType === "GOALKEEPER" && (
                          <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">GK</span>
                        )}
                        {globalDef?.positionType === "FIELD_PLAYER" && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">FIELD</span>
                        )}
                        {globalDef?.positionType === "ALL" && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">ALL</span>
                        )}
                        {globalDef?.category && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{globalDef.category}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{metric.metricCode}</div>
                    </div>

                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">Button Label Override</label>
                      <input 
                        type="text"
                        value={metric.buttonLabel || ""}
                        onChange={e => updateMetricLabel(metric.metricCode, e.target.value)}
                        disabled={!metric.enabled || profileLockedStatus}
                        placeholder={globalDef?.metricName}
                        className="w-full border rounded p-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            {profileLockedStatus && (
              <button 
                onClick={handleCloneNewVersion}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
              >
                <Copy size={18} /> Clone to New Version
              </button>
            )}
            {!profileLockedStatus && (
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save size={18} /> Save Profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
