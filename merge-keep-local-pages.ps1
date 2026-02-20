$ErrorActionPreference = "Continue"

Write-Host "=== Merge origin/main (keep local login/dashboard/roadmap pages) ===" -ForegroundColor Cyan

$currentBranch = git branch --show-current
Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow

$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "[WARNING] Uncommitted changes detected:" -ForegroundColor Yellow
    git status --short
    $response = Read-Host "Commit changes? (y/n)"
    if ($response -eq "y" -or $response -eq "Y") {
        git add .
        $commitMsg = Read-Host "Commit message"
        if ([string]::IsNullOrWhiteSpace($commitMsg)) {
            $commitMsg = "WIP: Save local changes"
        }
        git commit -m $commitMsg
        Write-Host "[OK] Committed" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "1. Fetching origin/main..." -ForegroundColor Cyan
git fetch origin main

Write-Host ""
Write-Host "2. Merging origin/main..." -ForegroundColor Cyan
git merge origin/main --no-commit --no-ff

$mergeExitCode = $LASTEXITCODE

if ($mergeExitCode -eq 0) {
    Write-Host "[OK] Merge completed without conflicts" -ForegroundColor Green
    git commit -m "Merge origin/main"
    Write-Host ""
    Write-Host "[SUCCESS] Merge completed" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "[WARNING] Conflicts detected. Resolving login/dashboard/roadmap pages..." -ForegroundColor Yellow

$conflictFiles = git diff --name-only --diff-filter=U

if ($conflictFiles.Count -eq 0) {
    Write-Host "No conflict files found." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Conflict files:" -ForegroundColor Cyan
$conflictFiles | ForEach-Object { Write-Host "  - $_" }

$keepLocalFiles = @(
    "src/app/(auth)/login/page.tsx",
    "src/app/(dashboard)/dashboard/page.tsx",
    "src/app/(dashboard)/roadmap/page.tsx"
)

Write-Host ""
Write-Host "3. Keeping local version for:" -ForegroundColor Cyan
$keepLocalFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }

foreach ($file in $keepLocalFiles) {
    if ($conflictFiles -contains $file) {
        Write-Host ""
        Write-Host "  -> Processing $file..." -ForegroundColor Cyan
        git checkout --ours $file
        git add $file
        Write-Host "    [OK] Kept local version" -ForegroundColor Green
    }
}

$remainingConflicts = git diff --name-only --diff-filter=U
if ($remainingConflicts.Count -gt 0) {
    Write-Host ""
    Write-Host "[WARNING] Manual resolution needed for:" -ForegroundColor Yellow
    $remainingConflicts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "After manual resolution, run:" -ForegroundColor Cyan
    Write-Host "  git add ." -ForegroundColor White
    Write-Host "  git commit -m 'Merge origin/main, keep local login/dashboard/roadmap pages'" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "4. Committing merge..." -ForegroundColor Cyan
    git commit -m "Merge origin/main, keep local login/dashboard/roadmap pages"
    Write-Host ""
    Write-Host "[SUCCESS] Merge completed" -ForegroundColor Green
}
