$path = "c:\Users\asus\Documents\Futverse-app\src\components\YouthPlayerCV.tsx"

if (-Not (Test-Path $path)) {
    Write-Error "Could not find file at $path"
    exit 1
}

$lines = Get-Content -Path $path
$output = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $lines.Length; $i++) {
    $lineNum = $i + 1
    
    if ($lineNum -eq 66) {
        $output.Add($lines[$i])
        $output.Add('import CVOverviewTab from "./player-cv/CVOverviewTab";')
        $output.Add('import CVHistoryTab from "./player-cv/CVHistoryTab";')
        $output.Add('import CVIDPLogTab from "./player-cv/CVIDPLogTab";')
        $output.Add('import CVCareerTab from "./player-cv/CVCareerTab";')
        $output.Add('import CVTrainingTab from "./player-cv/CVTrainingTab";')
        $output.Add('import CVBioTab from "./player-cv/CVBioTab";')
        $output.Add('import CVDailyLogTab from "./player-cv/CVDailyLogTab";')
        continue
    }

    if ($lineNum -ge 978 -and $lineNum -le 2245) {
        if ($lineNum -eq 978) {
            $output.Add('          {activeTab === "overview" && <CVOverviewTab player={player} localPlayer={localPlayer} academyId={academyId} evaluations={evaluations} criteriaMapping={criteriaMapping} growthHistory={growthHistory} dailyLogs={dailyLogs} playerMatches={playerMatches} idpsList={idpsList} idpStats={idpStats} isSaving={isSaving} dashboardWidgets={dashboardWidgets} isEditingVideo={isEditingVideo} setIsEditingVideo={setIsEditingVideo} videoUrlInput={videoUrlInput} setVideoUrlInput={setVideoUrlInput} handleSaveVideo={handleSaveVideo} setIsAddingGrowth={setIsAddingGrowth} handleDeleteGrowth={handleDeleteGrowth} getEmbedUrl={getEmbedUrl} />}')
            $output.Add('          {activeTab === "history" && <CVHistoryTab evaluations={evaluations} criteriaMapping={criteriaMapping} expandedEvals={expandedEvals} toggleEvalExpand={toggleEvalExpand} openEditEval={openEditEval} handleDeleteEval={handleDeleteEval} />}')
            $output.Add('          {activeTab === "idp_log" && <CVIDPLogTab idpsList={idpsList} />}')
            $output.Add('          {activeTab === "career" && <CVCareerTab player={player} localPlayer={localPlayer} careerStatsLoading={careerStatsLoading} careerStats={careerStats} playedUpMatches={playedUpMatches} hasPermission={hasPermission} handleEditScore={handleEditScore} handleDeleteMatch={handleDeleteMatch} settings={settings} setIsAddingAcademy={setIsAddingAcademy} setIsAddingAward={setIsAddingAward} />}')
            $output.Add('          {activeTab === "training" && <CVTrainingTab player={player} />}')
            $output.Add('          {activeTab === "bio" && <CVBioTab selectedLogDate={selectedLogDate} setSelectedLogDate={setSelectedLogDate} handleOpenAddDailyLog={handleOpenAddDailyLog} currentDailyLog={currentDailyLog} dailyLogs={dailyLogs} handleDeleteDailyLog={handleDeleteDailyLog} />}')
        }
        continue
    }

    if ($lineNum -ge 2802 -and $lineNum -le 2813) {
        if ($lineNum -eq 2802) {
            $output.Add('          <CVDailyLogTab isSelfView={isSelfView}>{children}</CVDailyLogTab>')
        }
        continue
    }

    $output.Add($lines[$i])
}

$output | Set-Content -Path $path -Encoding UTF8
Write-Host "SUCCESS: YouthPlayerCV.tsx updated successfully using absolute path!"
