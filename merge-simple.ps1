# Simple merge script - keep local login/dashboard/roadmap pages
$ErrorActionPreference = "Continue"

Write-Host "Fetching origin/main..." -ForegroundColor Cyan
git fetch origin main

Write-Host "Merging origin/main..." -ForegroundColor Cyan
git merge origin/main --no-commit --no-ff

if ($LASTEXITCODE -ne 0) {
    Write-Host "Conflicts detected. Resolving login/dashboard/roadmap with local version..." -ForegroundColor Yellow
    
    $files = @(
        "src/app/(auth)/login/page.tsx",
        "src/app/(dashboard)/dashboard/page.tsx",
        "src/app/(dashboard)/roadmap/page.tsx"
    )
    
    foreach ($file in $files) {
        if (Test-Path $file) {
            Write-Host "Keeping local: $file" -ForegroundColor Green
            git checkout --ours $file
            git add $file
        }
    }
    
    Write-Host "`nRemaining conflicts (if any) need manual resolution." -ForegroundColor Yellow
    Write-Host "Then run: git add . && git commit -m 'Merge origin/main'" -ForegroundColor Cyan
} else {
    Write-Host "No conflicts. Committing..." -ForegroundColor Green
    git commit -m "Merge origin/main"
    Write-Host "Done!" -ForegroundColor Green
}
