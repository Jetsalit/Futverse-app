const fs = require('fs');
const path = 'src/components/YouthPlayerCV.tsx';

if (!fs.existsSync(path)) {
  console.error('Error: Could not find src/components/YouthPlayerCV.tsx. Please run this script from the project root.');
  process.exit(1);
}

let content = fs.readFileSync(path, 'utf8');

const imports = `
import CVOverviewTab from "./player-cv/CVOverviewTab";
import CVHistoryTab from "./player-cv/CVHistoryTab";
import CVIDPLogTab from "./player-cv/CVIDPLogTab";
import CVCareerTab from "./player-cv/CVCareerTab";
import CVTrainingTab from "./player-cv/CVTrainingTab";
import CVBioTab from "./player-cv/CVBioTab";
import CVDailyLogTab from "./player-cv/CVDailyLogTab";
`;

if (!content.includes('import CVOverviewTab')) {
  content = content.replace('} from "recharts";', '} from "recharts";\n' + imports);
}

const startRegex = /\{\s*activeTab === "overview"[\s\S]*?(?=\{\s*\/\*\s*Modals\s*\*\/\s*\})/;

const newTabs = `{activeTab === "overview" && <CVOverviewTab player={player} localPlayer={localPlayer} academyId={academyId} evaluations={evaluations} criteriaMapping={criteriaMapping} growthHistory={growthHistory} dailyLogs={dailyLogs} playerMatches={playerMatches} idpsList={idpsList} idpStats={idpStats} isSaving={isSaving} dashboardWidgets={dashboardWidgets} isEditingVideo={isEditingVideo} setIsEditingVideo={setIsEditingVideo} videoUrlInput={videoUrlInput} setVideoUrlInput={setVideoUrlInput} handleSaveVideo={handleSaveVideo} setIsAddingGrowth={setIsAddingGrowth} handleDeleteGrowth={handleDeleteGrowth} getEmbedUrl={getEmbedUrl} />}
          {activeTab === "history" && <CVHistoryTab evaluations={evaluations} criteriaMapping={criteriaMapping} expandedEvals={expandedEvals} toggleEvalExpand={toggleEvalExpand} openEditEval={openEditEval} handleDeleteEval={handleDeleteEval} />}
          {activeTab === "idp_log" && <CVIDPLogTab idpsList={idpsList} />}
          {activeTab === "career" && <CVCareerTab player={player} localPlayer={localPlayer} careerStatsLoading={careerStatsLoading} careerStats={careerStats} playedUpMatches={playedUpMatches} hasPermission={hasPermission} handleEditScore={handleEditScore} handleDeleteMatch={handleDeleteMatch} settings={settings} setIsAddingAcademy={setIsAddingAcademy} setIsAddingAward={setIsAddingAward} />}
          {activeTab === "training" && <CVTrainingTab player={player} />}
          {activeTab === "bio" && <CVBioTab selectedLogDate={selectedLogDate} setSelectedLogDate={setSelectedLogDate} handleOpenAddDailyLog={handleOpenAddDailyLog} currentDailyLog={currentDailyLog} dailyLogs={dailyLogs} handleDeleteDailyLog={handleDeleteDailyLog} />}
          `;

if (startRegex.test(content)) {
  content = content.replace(startRegex, newTabs);
} else {
  console.log("Warning: Could not find the Overview to Bio block.");
}

const dailyLogRegex = /\{\s*activeTab === "daily_log" && isSelfView && \([\s\S]*?(?=\}\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\;)/;
const newDailyLog = `{activeTab === "daily_log" && <CVDailyLogTab isSelfView={isSelfView}>{children}</CVDailyLogTab>}
          `;

if (dailyLogRegex.test(content)) {
  content = content.replace(dailyLogRegex, newDailyLog);
} else {
  console.log("Warning: Could not find the daily_log block.");
}

fs.writeFileSync(path, content, 'utf8');
console.log('SUCCESS: Refactoring completed successfully!');
