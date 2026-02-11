# Contributing to ControlWeave

Thank you for your interest in contributing to the ControlWeave! We welcome contributions from the community and are excited to work with you.

## 🤝 How to Contribute

### 1. Fork the Repository
Fork the repo on GitHub and clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/ai-grc-platform.git
cd ai-grc-platform
git remote add upstream https://github.com/conteh-consulting/ai-grc-platform.git
```

### 2. Create a Feature Branch
Create a branch for your contribution:

```bash
git checkout -b feature/amazing-feature
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions

### 3. Make Your Changes
Write your code, following our coding standards (see below).

### 4. Test Your Changes
Ensure your changes work:

```bash
# Test database changes
psql ai_grc_platform < db/schema.sql
psql ai_grc_platform < db/seeds/*.sql

# Test your specific changes
# (Add your test commands here)
```

### 5. Commit Your Changes
Write clear, descriptive commit messages:

```bash
git commit -m "Add HIPAA framework with 164 controls"
```

Good commit messages:
- Start with a verb (Add, Fix, Update, Remove)
- Be specific and descriptive
- Reference issue numbers when applicable

### 6. Push to Your Fork

```bash
git push origin feature/amazing-feature
```

### 7. Open a Pull Request
Go to GitHub and open a Pull Request from your fork to our `main` branch.

In your PR description:
- Explain what you changed and why
- Reference any related issues
- Include screenshots if applicable
- Mention if this is a breaking change

## 🎯 What We Need Help With

We're actively looking for contributions in these areas:

### High Priority
- [ ] **Additional Frameworks**: HIPAA, GDPR, PCI DSS 4.0, CIS Controls v8
- [ ] **Frontend Development**: React/Next.js UI implementation
- [ ] **API Development**: REST API with proper authentication
- [ ] **MCP Server**: Claude AI integration tools
- [ ] **Test Coverage**: Unit and integration tests

### Medium Priority
- [ ] **Documentation**: Tutorials, guides, video walkthroughs
- [ ] **Framework Mappings**: More crosswalk mappings between frameworks
- [ ] **Deployment Guides**: Docker, Kubernetes, cloud platforms
- [ ] **Internationalization**: Multi-language support

### Always Welcome
- [ ] **Bug Fixes**: Found a bug? Submit a fix!
- [ ] **Documentation Improvements**: Typos, clarifications, examples
- [ ] **Performance Optimizations**: Query improvements, indexing
- [ ] **Security Enhancements**: Security issues (report privately first)

## 💻 Development Setup

### Prerequisites
- PostgreSQL 14+
- Node.js 18+ (for backend/MCP)
- Python 3.9+ (if building Python components)
- Git

### Initial Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/ai-grc-platform.git
cd ai-grc-platform

# Set up database
createdb ai_grc_platform
psql ai_grc_platform < db/schema.sql

# Load all framework data
for file in db/seeds/*.sql; do
  psql ai_grc_platform < "$file"
done

# Verify installation
psql ai_grc_platform -c "SELECT COUNT(*) FROM framework_controls;"
# Should return 528+

# Install backend dependencies (when available)
cd backend
npm install

# Install frontend dependencies (when available)
cd frontend
npm install
```

## 📋 Coding Standards

### Database (SQL)
- Use consistent formatting and indentation
- Comment complex queries
- Test all SQL changes before committing
- Follow existing naming conventions (snake_case for tables/columns)

### Backend (Node.js/Python)
- Follow existing code style
- Write clear, self-documenting code
- Add comments for complex logic
- Include error handling
- Write tests for new features

### Frontend (React/Next.js)
- Use functional components with hooks
- Follow accessibility best practices
- Make it responsive (mobile-first)
- Use TypeScript when possible
- Follow existing component structure

### Documentation
- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep formatting consistent
- Update README if needed

## 🐛 Reporting Bugs

Found a bug? Please open an issue with:
- **Clear title**: Describes the problem
- **Description**: What happened vs what should happen
- **Steps to reproduce**: Numbered list
- **Environment**: OS, database version, etc.
- **Screenshots**: If applicable

Example:
```
Title: Database migration fails on PostgreSQL 15

Description: The schema.sql file fails to load on PostgreSQL 15
due to a syntax change in the CREATE INDEX statement.

Steps to Reproduce:
1. Install PostgreSQL 15
2. Run: psql ai_grc_platform < db/schema.sql
3. Error appears: "syntax error at or near..."

Environment:
- OS: Ubuntu 22.04
- PostgreSQL: 15.2
- Command: psql --version
```

## 💡 Suggesting Features

Have an idea? Open an issue with:
- **Clear title**: Describes the feature
- **Problem**: What problem does this solve?
- **Solution**: Your proposed solution
- **Alternatives**: Other solutions you considered
- **Impact**: Who benefits from this?

## 🔒 Security Issues

**IMPORTANT**: Do NOT open public issues for security vulnerabilities.

Instead, email: Contehconsulting@gmail.com with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We'll respond within 48 hours.

## 📜 Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

In short:
- Be respectful and inclusive
- Accept constructive criticism
- Focus on what's best for the community
- Show empathy towards others

## 📞 Questions?

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: Contehconsulting@gmail.com
- **Documentation**: Check [docs/](docs/) first

## 🙏 Recognition

All contributors will be recognized in our README and release notes. Your contributions make this project better!

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to ControlWeave! 🚀
