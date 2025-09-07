# Contributing to Aegis

Thank you for your interest in contributing to Aegis! This document provides guidelines and instructions for contributing.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our code of conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing opinions and experiences

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/aegis.git`
3. Create a feature branch: `git checkout -b feature-name`
4. Make your changes
5. Run tests: `npm test` (for MCP server) or `pytest` (for Python code)
6. Commit with clear messages: `git commit -m "Add feature: description"`
7. Push to your fork: `git push origin feature-name`
8. Create a Pull Request

## 📋 What We're Looking For

### Priority Areas

1. **New Data Source Integrations**
   - Garmin Connect
   - Apple Health
   - Google Fit
   - Todoist
   - Notion

2. **Analytics & Visualizations**
   - Advanced correlation analysis
   - Interactive dashboards
   - Export capabilities (PDF reports, CSV)
   - Goal tracking and predictions

3. **Mobile Applications**
   - React Native app
   - Quick metric logging
   - Offline support

4. **AI/ML Features**
   - Pattern detection in activities
   - Performance predictions
   - Automated insights generation

### Bug Fixes & Improvements

- Performance optimizations
- UI/UX enhancements
- Documentation improvements
- Test coverage expansion

## 🔧 Development Setup

### Python Environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies
```

### Node.js Environment

```bash
cd aegis-mcp
npm install
npm run dev  # Development mode with auto-reload
```

## 📝 Code Style

### Python
- Follow PEP 8
- Use type hints where possible
- Write docstrings for all functions
- Maximum line length: 88 characters (Black formatter)

### JavaScript/TypeScript
- Use ESLint configuration
- Prefer async/await over callbacks
- Document complex functions
- Use meaningful variable names

### Commit Messages
- Use present tense: "Add feature" not "Added feature"
- Keep first line under 50 characters
- Reference issues: "Fix #123: Description"
- Be descriptive but concise

## 🧪 Testing

### Python Tests
```bash
pytest tests/
pytest tests/test_specific.py::test_function  # Run specific test
pytest --cov=app tests/  # With coverage
```

### JavaScript Tests
```bash
cd aegis-mcp
npm test
npm run test:watch  # Watch mode
```

### Writing Tests
- Test edge cases
- Mock external API calls
- Ensure tests are deterministic
- Aim for >80% coverage on new code

## 📚 Documentation

- Update README.md for user-facing changes
- Add docstrings to new functions
- Update API documentation for new endpoints
- Include examples for new features
- Document environment variables

## 🔐 Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all user inputs
- Follow OWASP guidelines for web security
- Report security issues privately to maintainers

## 📦 Pull Request Process

1. **Before Submitting**
   - Ensure all tests pass
   - Update documentation
   - Add tests for new features
   - Check for linting errors

2. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] No sensitive data exposed
   ```

3. **Review Process**
   - PRs require at least one approval
   - Address all review comments
   - Keep PRs focused and small
   - Be patient and respectful

## 💡 Feature Requests

1. Check existing issues first
2. Use the feature request template
3. Provide clear use cases
4. Be open to discussion and alternatives

## 🐛 Bug Reports

1. Search existing issues
2. Use the bug report template
3. Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details
   - Error messages/logs

## 🎯 Development Philosophy

- **Privacy First**: User data stays under user control
- **Simplicity**: Easy to understand and modify
- **Extensibility**: Easy to add new data sources
- **Performance**: Efficient data processing
- **User Experience**: Intuitive and helpful

## 📮 Communication

- GitHub Issues: Bug reports and features
- Discussions: General questions and ideas
- Pull Requests: Code contributions
- Email: For security issues only

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in documentation

Thank you for helping make Aegis better! 🚀