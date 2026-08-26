import { ChevronLeft, Trophy } from "lucide-react";
import { EmptyState } from "./common/EmptyState";
import { useLanguage } from "../contexts/LanguageContext";

export default function PostMatchStatsEntry({
  onBack,
}: {
  onBack: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>

        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            {t("post_match_title")}
          </h1>

          <p className="text-sm text-slate-500">
            {t("post_match_desc")}
          </p>
        </div>
      </div>

      <EmptyState
        icon={Trophy}
        title={t("post_match_unavailable_title")}
        description={t("post_match_unavailable_desc")}
        primaryActionLabel={t("match_back")}
        onPrimaryAction={onBack}
      />
    </div>
  );
}