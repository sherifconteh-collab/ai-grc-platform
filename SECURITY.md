# Security Policy

## 🔐 Protecting the Repository from Malicious Contributions

This document outlines security measures to protect the AI GRC Platform from malicious code and maintain code integrity.

---

## 1. GitHub Repository Protection Settings

### Branch Protection Rules (CRITICAL - Set these immediately)

Go to: **Settings → Branches → Add branch protection rule**

**For `main` branch:**
- ✅ **Require pull request reviews before merging**
  - Required approving reviews: **2** (you + one trusted maintainer)
  - Dismiss stale pull request approvals when new commits are pushed
  - Require review from Code Owners
- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - Required status checks: Tests, Linting, Security Scan
- ✅ **Require signed commits** (prevents impersonation)
- ✅ **Do not allow bypassing the above settings**
- ✅ **Restrict who can push to matching branches**
  - Only you and trusted maintainers
- ✅ **Require linear history** (no merge commits)
- ✅ **Include administrators** (even you must follow these rules)

---

## 2. Automated Security Scanning (GitHub Actions)

### Create `.github/workflows/security.yml`

```yaml
name: Security Checks

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run npm audit
        run: |
          cd backend && npm audit --audit-level=moderate
          cd ../frontend && npm audit --audit-level=moderate

      - name: Check for known vulnerabilities with Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  code-scanning:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  secret-scanning:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Gitleaks - Detect hardcoded secrets
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: TruffleHog - Find credentials
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD

  malicious-code-detection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for suspicious patterns
        run: |
          # Check for eval(), exec(), child_process usage
          echo "Checking for dangerous functions..."
          if grep -r "eval(" --include="*.js" --include="*.ts" .; then
            echo "⚠️ WARNING: eval() found - requires review"
            exit 1
          fi

          if grep -r "child_process" --include="*.js" --include="*.ts" .; then
            echo "⚠️ WARNING: child_process found - requires review"
          fi

          if grep -r "exec(" --include="*.js" --include="*.ts" .; then
            echo "⚠️ WARNING: exec() found - requires review"
          fi

          # Check for suspicious network calls
          if grep -r "http://" --include="*.js" --include="*.ts" . | grep -v "localhost"; then
            echo "⚠️ WARNING: Non-HTTPS URLs found - requires review"
          fi

          # Check for base64 encoded strings (common obfuscation technique)
          if grep -r "atob\|btoa\|Buffer.*base64" --include="*.js" --include="*.ts" .; then
            echo "⚠️ WARNING: Base64 encoding/decoding found - requires review"
          fi

  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check dependencies for incompatible licenses
        run: |
          cd backend
          npx license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD"
```

---

## 3. CODEOWNERS File

### Create `.github/CODEOWNERS`

```
# Global owners - all files require review from these users
* @sherifconteh-collab

# Critical security files require multiple approvals
/backend/src/middleware/auth.js @sherifconteh-collab
/backend/src/routes/auth.js @sherifconteh-collab
/backend/src/utils/auditLogger.js @sherifconteh-collab
/db/schema.sql @sherifconteh-collab
/db/migrations/ @sherifconteh-collab

# Configuration files
/.github/ @sherifconteh-collab
/package*.json @sherifconteh-collab
/backend/package*.json @sherifconteh-collab
/frontend/package*.json @sherifconteh-collab

# Environment files (should never be committed)
/.env* @sherifconteh-collab
```

---

## 4. Pull Request Review Checklist

When reviewing PRs, check for:

### Code Quality
- [ ] Code follows existing style and conventions
- [ ] No commented-out code left in
- [ ] No debugging statements (console.log, debugger)
- [ ] Proper error handling

### Security Red Flags
- [ ] **No hardcoded credentials** (API keys, passwords, tokens)
- [ ] **No `eval()` or `Function()` constructors**
- [ ] **No `child_process.exec()` without input sanitization**
- [ ] **No SQL string concatenation** (use parameterized queries)
- [ ] **No `innerHTML` with user input** (XSS risk)
- [ ] **No `dangerouslySetInnerHTML` in React**
- [ ] **No file system operations on user-supplied paths** (path traversal)
- [ ] **No dynamic `require()` or `import()`** with user input
- [ ] **No network requests to unknown domains**
- [ ] **No obfuscated code** (minified, base64-encoded, hex strings)
- [ ] **No cryptocurrency mining code**
- [ ] **No telemetry/analytics without disclosure**

### Dependencies
- [ ] New dependencies are from trusted sources (npm official)
- [ ] Check dependency downloads/week (> 10k/week is safer)
- [ ] Check GitHub stars (> 1k is safer)
- [ ] Check last update date (updated in last 6 months)
- [ ] Run `npm audit` on new dependencies
- [ ] Check for typosquatting (e.g., "reacct" instead of "react")

### Database Changes
- [ ] Migrations are reversible
- [ ] No DROP TABLE without backup discussion
- [ ] No TRUNCATE without backup discussion
- [ ] Proper foreign key constraints
- [ ] Indexes added where needed

### Tests
- [ ] New features have tests
- [ ] Tests actually test the feature
- [ ] No tests that always pass

---

## 5. Dependency Security

### Use Dependabot (GitHub built-in)

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "sherifconteh-collab"
    labels:
      - "dependencies"
      - "security"

  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "sherifconteh-collab"
    labels:
      - "dependencies"
      - "security"
```

### Lock Files
- ✅ **Always commit `package-lock.json`**
- ✅ Never run `npm install` with `--legacy-peer-deps` in production
- ✅ Review lock file changes in PRs carefully

---

## 6. Contributor Agreement

### Create `CONTRIBUTING.md` with security requirements:

```markdown
## Security Requirements for Contributors

By submitting a pull request, you certify that:

1. Your contribution does not contain malicious code
2. Your contribution does not contain hardcoded secrets/credentials
3. You have tested your code locally
4. You understand your code will be reviewed for security issues
5. You agree to our Code of Conduct
6. Your code is your original work or properly attributed

### Prohibited in Contributions

- Cryptocurrency miners
- Telemetry/tracking without explicit documentation
- Obfuscated code
- Hardcoded credentials
- Backdoors or remote access capabilities
- Code that phones home to external servers (without disclosure)
```

---

## 7. Environment Variable Protection

### Never commit these files:
```
.env
.env.local
.env.production
backend/.env
frontend/.env.local
```

### .gitignore should include:
```gitignore
# Environment files
.env
.env.*
!.env.example

# Secrets
*.pem
*.key
*.cert
secrets/
credentials/

# Database dumps
*.sql
*.dump
*.backup

# Logs that might contain sensitive data
*.log
logs/
```

---

## 8. Code Signing

### Require Signed Commits

**Setup GPG signing (for you):**
```bash
# Generate GPG key
gpg --full-generate-key

# List keys
gpg --list-secret-keys --keyid-format=long

# Configure git to sign commits
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true

# Add GPG key to GitHub
gpg --armor --export YOUR_KEY_ID
# Paste into GitHub Settings → SSH and GPG keys
```

**Verify commits:**
```bash
git log --show-signature
```

---

## 9. Third-Party Integrations

### Review before enabling:
- GitHub Apps
- GitHub Actions from marketplace
- Webhooks
- OAuth applications

### Safe GitHub Actions sources:
- ✅ `actions/*` (official GitHub actions)
- ✅ `github/*` (official GitHub)
- ⚠️ Third-party actions: Pin to specific commit SHA, not `@latest`

Example:
```yaml
# BAD - could change at any time
- uses: some-action/tool@v1

# GOOD - pinned to specific commit
- uses: some-action/tool@a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

---

## 10. Incident Response

### If malicious code is discovered:

1. **Immediately revert the PR/commit**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Revoke any exposed secrets**
   - Rotate database passwords
   - Regenerate API keys
   - Update JWT secrets
   - Reset affected user passwords

3. **Assess impact**
   - Check audit logs for unauthorized access
   - Check database for unauthorized changes
   - Check server logs for suspicious activity

4. **Notify users if data was compromised**
   - Required by GDPR within 72 hours
   - Document in security advisory

5. **Ban the contributor**
   ```
   GitHub → Settings → Moderation options → Block user
   ```

6. **Report to GitHub**
   - Security vulnerabilities: https://github.com/security/advisories/new
   - Abuse: abuse@github.com

---

## 11. Regular Security Audits

### Weekly:
- [ ] Review Dependabot alerts
- [ ] Check GitHub Security tab for vulnerabilities
- [ ] Review recent PRs/commits

### Monthly:
- [ ] Run full `npm audit` on all packages
- [ ] Review access permissions (who has write access?)
- [ ] Check for outdated dependencies
- [ ] Review GitHub Actions logs for anomalies

### Quarterly:
- [ ] External security audit (hire pentester)
- [ ] Review and update SECURITY.md
- [ ] Rotate secrets (JWT keys, DB passwords)
- [ ] Review user permissions in database

---

## 12. Reporting Security Vulnerabilities

**If you discover a security issue, DO NOT open a public issue.**

Instead:
1. Email: security@[your-domain].com (set this up)
2. Or use GitHub Security Advisories (private disclosure)
   - Go to: Repository → Security → Advisories → New draft security advisory

We will respond within 48 hours.

---

## 13. Security Best Practices in Code

### Input Validation
```javascript
// BAD - SQL injection risk
const query = `SELECT * FROM users WHERE email = '${email}'`;

// GOOD - parameterized query
const query = 'SELECT * FROM users WHERE email = $1';
await pool.query(query, [email]);
```

### XSS Prevention
```javascript
// BAD - XSS risk
element.innerHTML = userInput;

// GOOD - escape HTML
element.textContent = userInput;
```

### Command Injection Prevention
```javascript
// BAD - command injection risk
exec(`convert ${userFilename}.jpg output.png`);

// GOOD - use array syntax
execFile('convert', [userFilename + '.jpg', 'output.png']);
```

### Path Traversal Prevention
```javascript
// BAD - path traversal risk
const file = readFileSync(`/uploads/${req.query.filename}`);

// GOOD - validate and sanitize
const filename = path.basename(req.query.filename);
const file = readFileSync(path.join('/uploads', filename));
```

---

## Summary: Critical Actions to Take NOW

1. ✅ **Enable branch protection** on `main` branch (require PR reviews)
2. ✅ **Create CODEOWNERS file** (you as owner)
3. ✅ **Enable Dependabot** (automated dependency updates)
4. ✅ **Add security.yml** GitHub Action (automated scanning)
5. ✅ **Review and approve all .gitignore entries** (no secrets committed)
6. ✅ **Enable signed commits** (verify contributor identity)
7. ✅ **Set up security email** for private vulnerability reports
8. ✅ **Enable GitHub Advanced Security** (free for public repos)
   - Code scanning
   - Secret scanning
   - Dependency review

---

**Remember**: Trust but verify. Every line of code from external contributors must be reviewed with security in mind.

For a compliance-focused project like this, security isn't optional—it's fundamental.
