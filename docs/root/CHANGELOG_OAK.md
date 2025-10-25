# 🌳 Casual Oak's PAMPAX Changelog

All notable changes to my fork of PAMPAX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.15.1-oak.1] - 2024-10-19

### 🌟 Added
- **Dart/Flutter Support** - Full parsing and indexing of Dart code
  - Function signatures and method declarations
  - Class definitions and mixins
  - Constructor signatures and extension methods
  - Enum declarations and extension declarations
  - Dart documentation comments (`///` and `/** */`)
  - Flutter-specific patterns and widgets
- **Enhanced Package Identity** - Rebranded as `@casualclark/pampax`
- **Additional CLI Command** - `pampax-oak` for branded experience
- **Comprehensive Documentation** - New README_OAK.md and SETUP_GUIDE.md
- **Fork-Specific Configuration** - Updated repository URLs and author information

### 🚀 Changed
- **Package Name** - From `pampax` to `@casualclark/pampax`
- **Version Scheme** - Added `-oak.x` suffix for fork versions
- **Documentation** - Casual, developer-friendly tone throughout
- **Supported Languages Count** - Updated from 21 to 22 languages

### 📝 Documentation
- Added `README_OAK.md` with comprehensive setup guide
- Added `SETUP_GUIDE.md` with detailed configuration instructions
- Added `CHANGELOG_OAK.md` for tracking fork changes
- Updated package.json with fork-specific metadata
- Created configuration examples for all major AI tools

### 🔧 Technical
- Added tree-sitter-dart@1.0.0 dependency
- Updated language rules in service.js for Dart parsing
- Added Dart-specific node types and comment patterns
- Updated file inclusion list in package.json

---

## [Unreleased] - Planned Features

### 🚀 Planned
- **Real-time File Watching** - Automatic re-indexing on file changes
- **Web UI** - Visual code exploration interface
- **Team Features** - Shared code knowledge bases
- **Advanced Analytics** - Code insights and metrics
- **Performance Improvements** - Faster indexing and search
- **More Language Support** - Zig, Rust enhancements, etc.

### 🐛 Known Issues
- Large Dart projects (>10k files) may need increased memory limits
- Some Flutter-specific metaprogramming patterns not fully recognized
- Documentation generation for complex Dart types could be improved

---

## 🔄 Fork Origin

This changelog tracks changes specific to **Casual Oak's fork** of PAMPAX. 

For the original upstream changelog, see [CHANGELOG.md](CHANGELOG.md) in the original repository.

### Upstream Version
- Based on: PAMPAX v1.15.1 by Lemon07r
- Fork Date: 2024-10-19
- Primary Focus: Dart/Flutter support and improved developer experience

---

## 🏷️ Version Scheme

### Format: `VERSION-oak.RELEASE`

- **VERSION**: Base upstream version (e.g., 1.15.1)
- **oak**: Fork identifier
- **RELEASE**: Fork release number (e.g., 1, 2, 3...)

### Examples:
- `1.15.1-oak.1` - First fork release based on upstream 1.15.1
- `1.15.1-oak.2` - Second fork release with bug fixes
- `1.16.0-oak.1` - Fork release based on upstream 1.16.0

---

## 🤝 Contributing to Changelog

When contributing to this fork:

1. **Add entries** under the appropriate version section
2. **Use the format** shown above with clear categories
3. **Include dates** for all releases
4. **Update the version** in package.json accordingly
5. **Tag releases** in GitHub with the full version string

### Entry Format:
```markdown
### Category
- **Brief description** - Detailed explanation of the change
- **Another change** - Why it matters and what it affects
```

### Categories:
- 🌟 **Added** - New features
- 🚀 **Changed** - Changes to existing functionality  
- 🐛 **Fixed** - Bug fixes
- 📝 **Documentation** - Documentation changes
- 🔧 **Technical** - Technical improvements
- ⚠️ **Deprecated** - Features that will be removed
- ❌ **Removed** - Features that were removed

---

## 📊 Release Statistics

### Fork Releases:
- **Total Releases**: 1 (v1.15.1-oak.1)
- **Average Time Between Releases**: N/A (first release)
- **Major Features Added**: Dart/Flutter support
- **Languages Supported**: 22 (up from 21)

### Upstream Sync:
- **Last Upstream Sync**: 2024-10-19
- **Upstream Version**: v1.15.1
- **Fork Divergence**: Dart support + documentation improvements

---

## 🔮 Future Roadmap

### v1.15.1-oak.2 (Bug Fixes)
- Fix memory usage in large Dart projects
- Improve Flutter widget recognition
- Enhanced error messages for Dart parsing
- Performance optimizations for indexing

### v1.16.0-oak.1 (Upstream Sync)
- Sync with upstream v1.16.0 features
- Maintain Dart support enhancements
- Add any new upstream features to fork

### v2.0.0-oak.1 (Major Features)
- Real-time file watching
- Web UI for code exploration
- Team collaboration features
- Advanced code analytics

---

## 📞 Support & Feedback

For issues specific to this fork:
- **GitHub Issues**: [CasualClark/pampax](https://github.com/CasualClark/pampax/issues)
- **Discord**: [Community Server](https://discord.gg/pampax)
- **Email**: casual.oak@example.com

For upstream issues:
- **Original Issues**: [lemon07r/pampax](https://github.com/lemon07r/pampax/issues)

---

*This changelog covers only changes specific to Casual Oak's fork. Please refer to the upstream changelog for changes to the original PAMPAX project.*